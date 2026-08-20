let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
};
const ABBR = {Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY'};
function tag(xml, name) {
  const re = new RegExp('<' + name + '>([\\s\\S]*?)<\\/' + name + '>');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}
(async () => {
  console.log('\n=== BACKFILL SENATE MEMBER VOTES ===\n');
  const memRes = await fetch(SUPABASE_URL + '/rest/v1/members?chamber=eq.Senate&select=bioguide_id,last_name,state', { headers: headers });
  const senators = await memRes.json();
  const lookup = {};
  senators.forEach(function (s) {
    const ab = ABBR[s.state] || s.state;
    lookup[(s.last_name || '').toLowerCase() + '|' + String(ab).toUpperCase()] = s.bioguide_id;
  });
  console.log('senators indexed: ' + Object.keys(lookup).length);
  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?chamber=eq.Senate&select=id,congress,session,roll_call&order=roll_call.asc', { headers: headers });
  const votes = await vRes.json();
  console.log('senate votes stored: ' + votes.length + '\n');
  let total = 0;
  for (const v of votes) {
    const existRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?vote_id=eq.' + v.id + '&select=id&limit=1', { headers: headers });
    const already = await existRes.json();
    if (Array.isArray(already) && already.length) { console.log('roll ' + v.roll_call + ': already has member votes'); continue; }
    const padded = String(v.roll_call).padStart(5, '0');
    const url = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote' + v.congress + v.session + '/vote_' + v.congress + '_' + v.session + '_' + padded + '.xml';
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'CivicLens/1.0' } });
      if (!res.ok) { console.log('roll ' + v.roll_call + ': fetch ' + res.status); continue; }
      const xml = await res.text();
      const memberBlocks = xml.split('<member>').slice(1);
      const rows = [];
      let unmatched = 0;
      for (const mb of memberBlocks) {
        const ln = tag(mb, 'last_name');
        const st = tag(mb, 'state');
        const cast = tag(mb, 'vote_cast');
        const bio = lookup[(ln || '').toLowerCase() + '|' + (st || '').toUpperCase()];
        if (!bio) { unmatched++; continue; }
        rows.push({ vote_id: v.id, bioguide_id: bio, position: cast });
      }
      if (rows.length) {
        const ins = await fetch(SUPABASE_URL + '/rest/v1/member_votes', { method: 'POST', headers: headers, body: JSON.stringify(rows) });
        if (ins.ok || ins.status === 201) {
          total += rows.length;
          console.log('roll ' + v.roll_call + ': saved ' + rows.length + (unmatched ? ' (' + unmatched + ' unmatched)' : ''));
        } else {
          console.log('roll ' + v.roll_call + ': FAILED ' + ins.status + ' ' + (await ins.text()).substring(0, 150));
        }
      } else {
        console.log('roll ' + v.roll_call + ': no matches (' + unmatched + ' unmatched)');
      }
    } catch (e) {
      console.log('roll ' + v.roll_call + ': ERROR ' + e.message);
    }
  }
  console.log('\nDone. ' + total + ' member votes saved.\n');
})();