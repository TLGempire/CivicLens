let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONGRESS = 119;
const SESSION = 2;
const MAX_VOTES = 15;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
};
function tag(xml, name) {
  const re = new RegExp('<' + name + '>([\\s\\S]*?)<\\/' + name + '>');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}
function isFinalPassage(q) {
  q = (q || '').toLowerCase();
  if (/cloture|nomination|motion to proceed|motion to table|adjourn|quorum|amendment/.test(q)) return false;
  return /on passage|on the bill|on the joint resolution|on the concurrent resolution|on the resolution|on the conference report/.test(q);
}
(async () => {
  console.log('\n=== SENATE VOTE INGEST ===\n');
  const menuUrl = 'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_' + CONGRESS + '_' + SESSION + '.xml';
  const menuRes = await fetch(menuUrl, { headers: { 'User-Agent': 'CivicLens/1.0' } });
  if (!menuRes.ok) { console.log('menu fetch failed: ' + menuRes.status); return; }
  const menuXml = await menuRes.text();
  const blocks = menuXml.split('<vote>').slice(1);
  console.log('roll calls this session: ' + blocks.length);
  const candidates = blocks
    .map(function (b) { return { number: tag(b, 'vote_number'), question: tag(b, 'question') }; })
    .filter(function (v) { return v.number && isFinalPassage(v.question); });
  console.log('final passage votes: ' + candidates.length);
  const existRes = await fetch(SUPABASE_URL + '/rest/v1/votes?chamber=eq.Senate&congress=eq.' + CONGRESS + '&session=eq.' + SESSION + '&select=roll_call', { headers: headers });
  const existing = new Set((await existRes.json()).map(function (r) { return String(r.roll_call); }));
  const todo = candidates.filter(function (v) { return !existing.has(String(parseInt(v.number, 10))); });
  console.log('already stored: ' + existing.size + ' | to ingest: ' + todo.length + '\n');
  const memRes = await fetch(SUPABASE_URL + '/rest/v1/members?chamber=eq.Senate&select=bioguide_id,last_name,state', { headers: headers });
  const senators = await memRes.json();
  const lookup = {};
  senators.forEach(function (s) { lookup[(s.last_name || '').toLowerCase() + '|' + (s.state || '').toUpperCase()] = s.bioguide_id; });
  let saved = 0;
  for (const v of todo.slice(0, MAX_VOTES)) {
    const rollNum = parseInt(v.number, 10);
    const padded = String(rollNum).padStart(5, '0');
    const url = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote' + CONGRESS + SESSION + '/vote_' + CONGRESS + '_' + SESSION + '_' + padded + '.xml';
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'CivicLens/1.0' } });
      if (!res.ok) { console.log('roll ' + rollNum + ': fetch ' + res.status); continue; }
      const xml = await res.text();
      const docRe = new RegExp('<document>([\\s\\S]*?)<\\/document>');
      const doc = xml.match(docRe);
      const docBlock = doc ? doc[1] : '';
      const billId = tag(docBlock, 'document_name') || null;
      const rawDate = tag(xml, 'vote_date');
      const cleaned = rawDate.replace(/,\s*\d{2}:\d{2}\s*[AP]M/, '');
      const parsedDate = new Date(cleaned);
      const voteDate = isNaN(parsedDate) ? null : parsedDate.toISOString().split('T')[0];
      const memberBlocks = xml.split('<member>').slice(1);
      const positions = memberBlocks.map(function (mb) {
        return { last_name: tag(mb, 'last_name'), state: tag(mb, 'state'), vote_cast: tag(mb, 'vote_cast') };
      });
      const count = function (t) { return positions.filter(function (x) { return x.vote_cast === t; }).length; };
      const voteRow = {
        chamber: 'Senate', congress: CONGRESS, session: SESSION, roll_call: rollNum,
        vote_date: voteDate, bill_id: billId,
        question: tag(xml, 'question'),
        description: tag(xml, 'vote_document_text').substring(0, 500),
        result: tag(xml, 'vote_result'),
        policy_area: null, is_final_passage: true,
        yea_count: count('Yea'), nay_count: count('Nay'),
        present_count: count('Present'), not_voting_count: count('Not Voting'),
      };
      const insHeaders = Object.assign({}, headers, { Prefer: 'return=representation' });
      const ins = await fetch(SUPABASE_URL + '/rest/v1/votes', { method: 'POST', headers: insHeaders, body: JSON.stringify(voteRow) });
      if (!ins.ok) { console.log('roll ' + rollNum + ': save failed ' + ins.status + ' ' + (await ins.text()).substring(0, 150)); continue; }
      const inserted = (await ins.json())[0];
      console.log('roll ' + rollNum + ': ' + (billId || 'no bill') + ' (' + voteRow.yea_count + '-' + voteRow.nay_count + ')');
      saved++;
      const mvRows = [];
      let unmatched = 0;
      for (const pos of positions) {
        const bio = lookup[(pos.last_name || '').toLowerCase() + '|' + (pos.state || '').toUpperCase()];
        if (!bio) { unmatched++; continue; }
        mvRows.push({ vote_id: inserted.id, bioguide_id: bio, position: pos.vote_cast });
      }
      if (mvRows.length) {
        const mvRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes', { method: 'POST', headers: headers, body: JSON.stringify(mvRows) });
        console.log('   ' + mvRows.length + ' member votes' + (unmatched ? ' (' + unmatched + ' unmatched)' : '') + (mvRes.ok ? '' : ' - SAVE FAILED ' + mvRes.status));
      }
    } catch (e) {
      console.log('roll ' + rollNum + ': ERROR ' + e.message);
    }
  }
  console.log('\nDone. ' + saved + ' votes ingested this run.\n');
})();