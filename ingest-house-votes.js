let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const YEAR = 2026;
const CONGRESS = 119;
const SESSION = 2;
const MAX_VOTES = 15;
const SCAN_LIMIT = 120;
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
function isFinalPassage(q, type) {
  const s = ((q || '') + ' ' + (type || '')).toLowerCase();
  if (/quorum|journal|adjourn|motion to table|previous question|amendment|recommit|order of business/.test(s)) return false;
  return /on passage|on motion to suspend the rules and pass|on concurring|on agreeing to the resolution|conference report/.test(s);
}
(async () => {
  console.log('\n=== HOUSE VOTE INGEST ===\n');
  const existRes = await fetch(SUPABASE_URL + '/rest/v1/votes?chamber=eq.House&congress=eq.' + CONGRESS + '&select=roll_call', { headers: headers });
  const existing = new Set((await existRes.json()).map(function (r) { return Number(r.roll_call); }));
  console.log('already stored: ' + existing.size);
  const memRes = await fetch(SUPABASE_URL + '/rest/v1/members?chamber=eq.House&select=bioguide_id', { headers: headers });
  const known = new Set((await memRes.json()).map(function (m) { return m.bioguide_id; }));
  console.log('house members indexed: ' + known.size + '\n');
  let saved = 0;
  let scanned = 0;
  for (let roll = SCAN_LIMIT; roll >= 1 && saved < MAX_VOTES; roll--) {
    if (existing.has(roll)) continue;
    const padded = String(roll).padStart(3, '0');
    const url = 'https://clerk.house.gov/evs/' + YEAR + '/roll' + padded + '.xml';
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'CivicLens/1.0' } });
      if (!res.ok) continue;
      const xml = await res.text();
      scanned++;
      const question = tag(xml, 'vote-question');
      const voteType = tag(xml, 'vote-type');
      if (!isFinalPassage(question, voteType)) continue;
      const legisNum = tag(xml, 'legis-num');
      const rawDate = tag(xml, 'action-date');
      const parsedDate = new Date(rawDate);
      const voteDate = isNaN(parsedDate) ? null : parsedDate.toISOString().split('T')[0];
      const recRe = new RegExp('<recorded-vote>([\\s\\S]*?)<\\/recorded-vote>', 'g');
      const positions = [];
      let m;
      while ((m = recRe.exec(xml)) !== null) {
        const block = m[1];
        const idRe = new RegExp('name-id="([^"]+)"');
        const idMatch = block.match(idRe);
        const bio = idMatch ? idMatch[1] : null;
        const cast = tag(block, 'vote');
        if (bio) positions.push({ bioguide_id: bio, position: cast });
      }
      if (!positions.length) continue;
      const count = function (t) { return positions.filter(function (x) { return x.position === t; }).length; };
      const voteRow = {
        chamber: 'House', congress: CONGRESS, session: SESSION, roll_call: roll,
        vote_date: voteDate, bill_id: legisNum || null,
        question: question,
        description: tag(xml, 'vote-desc').substring(0, 500),
        result: tag(xml, 'vote-result'),
        policy_area: null, is_final_passage: true,
        yea_count: count('Yea') + count('Aye'),
        nay_count: count('Nay') + count('No'),
        present_count: count('Present'),
        not_voting_count: count('Not Voting'),
      };
      const insHeaders = Object.assign({}, headers, { Prefer: 'return=representation' });
      const ins = await fetch(SUPABASE_URL + '/rest/v1/votes', { method: 'POST', headers: insHeaders, body: JSON.stringify(voteRow) });
      if (!ins.ok) { console.log('roll ' + roll + ': save failed ' + ins.status + ' ' + (await ins.text()).substring(0, 150)); continue; }
      const inserted = (await ins.json())[0];
      console.log('roll ' + roll + ': ' + (legisNum || 'no bill') + ' (' + voteRow.yea_count + '-' + voteRow.nay_count + ')');
      saved++;
      const mvRows = [];
      let unmatched = 0;
      for (const pos of positions) {
        if (!known.has(pos.bioguide_id)) { unmatched++; continue; }
        mvRows.push({ vote_id: inserted.id, bioguide_id: pos.bioguide_id, position: pos.position });
      }
      if (mvRows.length) {
        const mvRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes', { method: 'POST', headers: headers, body: JSON.stringify(mvRows) });
        console.log('   ' + mvRows.length + ' member votes' + (unmatched ? ' (' + unmatched + ' unmatched)' : '') + (mvRes.ok ? '' : ' - SAVE FAILED ' + mvRes.status));
      }
    } catch (e) {
      console.log('roll ' + roll + ': ERROR ' + e.message);
    }
  }
  console.log('\nDone. scanned ' + scanned + ' roll calls, ingested ' + saved + '.\n');
})();