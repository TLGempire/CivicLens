let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};
function parseBillId(raw) {
  if (!raw) return null;
  const s = raw.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const m = s.match(/^([A-Z]+(?:\s[A-Z]+)*)\s(\d+)$/);
  if (!m) return null;
  const typeMap = {
    'H R': 'hr', 'HR': 'hr', 'S': 's',
    'H RES': 'hres', 'HRES': 'hres',
    'S RES': 'sres', 'SRES': 'sres',
    'H J RES': 'hjres', 'HJRES': 'hjres',
    'S J RES': 'sjres', 'SJRES': 'sjres',
    'H CON RES': 'hconres', 'HCONRES': 'hconres',
    'S CON RES': 'sconres', 'SCONRES': 'sconres'
  };
  const type = typeMap[m[1]];
  return type ? { type: type, number: m[2] } : null;
}
(async () => {
  console.log('\n=== BACKFILL POLICY AREAS ===\n');
  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?policy_area=is.null&select=id,chamber,roll_call,bill_id,congress', { headers: headers });
  const votes = await vRes.json();
  console.log('votes missing policy_area: ' + votes.length + '\n');
  const cache = {};
  let updated = 0;
  let skipped = 0;
  for (const v of votes) {
    const parsed = parseBillId(v.bill_id);
    if (!parsed) { console.log('  ' + (v.bill_id || 'no bill') + ': cannot parse'); skipped++; continue; }
    const key = v.congress + '/' + parsed.type + '/' + parsed.number;
    let area = cache[key];
    if (area === undefined) {
      const url = 'https://api.congress.gov/v3/bill/' + v.congress + '/' + parsed.type + '/' + parsed.number + '?format=json&api_key=' + CONGRESS_KEY;
      try {
        const res = await fetch(url);
        if (!res.ok) { console.log('  ' + v.bill_id + ': HTTP ' + res.status); cache[key] = null; skipped++; continue; }
        const d = await res.json();
        area = (d.bill && d.bill.policyArea) ? d.bill.policyArea.name : null;
        cache[key] = area;
      } catch (e) {
        console.log('  ' + v.bill_id + ': ERROR ' + e.message);
        skipped++; continue;
      }
    }
    if (!area) { console.log('  ' + v.bill_id + ': no policy area listed'); skipped++; continue; }
    const upd = await fetch(SUPABASE_URL + '/rest/v1/votes?id=eq.' + v.id, {
      method: 'PATCH', headers: headers, body: JSON.stringify({ policy_area: area })
    });
    if (upd.ok) {
      updated++;
      console.log('  ' + String(v.bill_id).padEnd(16) + ' -> ' + area);
    } else {
      console.log('  ' + v.bill_id + ': update failed ' + upd.status);
      skipped++;
    }
  }
  console.log('\nupdated ' + updated + ', skipped ' + skipped);
  const allRes = await fetch(SUPABASE_URL + '/rest/v1/votes?select=policy_area', { headers: headers });
  const all = await allRes.json();
  const tally = {};
  all.forEach(function (r) { const k = r.policy_area || '(none)'; tally[k] = (tally[k] || 0) + 1; });
  console.log('\n=== POLICY AREAS IN DATABASE ===');
  Object.keys(tally).sort().forEach(function (k) { console.log('  ' + String(tally[k]).padStart(3) + '  ' + k); });
  console.log('');
})();