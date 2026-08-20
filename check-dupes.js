let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

(async () => {
  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?select=id,chamber,congress,session,roll_call,bill_id&order=id.asc&limit=1000', { headers });
  const votes = await vRes.json();

  console.log('\n=== VOTES TABLE ===');
  console.log('total rows: ' + votes.length);

  // A roll call is unique per chamber+congress+session
  const seen = {};
  const dupes = [];
  votes.forEach(v => {
    const key = v.chamber + '|' + v.congress + '|' + v.session + '|' + v.roll_call;
    if (seen[key]) dupes.push({ key, ids: [seen[key], v.id], bill: v.bill_id });
    else seen[key] = v.id;
  });

  console.log('unique roll calls: ' + Object.keys(seen).length);
  console.log('duplicate rows: ' + dupes.length);
  dupes.slice(0, 15).forEach(d => console.log('  ' + d.key + '  ids ' + d.ids.join(',') + '  ' + d.bill));

  const byChamber = {};
  votes.forEach(v => { byChamber[v.chamber] = (byChamber[v.chamber] || 0) + 1; });
  console.log('\nby chamber: ' + JSON.stringify(byChamber));

  const bySession = {};
  votes.forEach(v => {
    const k = v.chamber + ' s' + v.session;
    bySession[k] = (bySession[k] || 0) + 1;
  });
  console.log('by session: ' + JSON.stringify(bySession));
  console.log('');
})();