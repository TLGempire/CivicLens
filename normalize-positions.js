let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};
(async () => {
  console.log('\n=== NORMALIZE POSITIONS (loops until clean) ===\n');
  const pairs = [['Aye', 'Yea'], ['No', 'Nay']];
  for (const pr of pairs) {
    const from = pr[0];
    const to = pr[1];
    let pass = 0;
    while (pass < 30) {
      const cRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?position=eq.' + from + '&select=id&limit=1', { headers: headers });
      const rows = await cRes.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      const upd = await fetch(SUPABASE_URL + '/rest/v1/member_votes?position=eq.' + from, {
        method: 'PATCH', headers: headers, body: JSON.stringify({ position: to })
      });
      if (!upd.ok) { console.log('  ' + from + ': FAILED ' + upd.status); break; }
      pass++;
      console.log('  ' + from + ' -> ' + to + ': pass ' + pass);
    }
    if (pass === 0) console.log('  ' + from + ': already clean');
  }
  console.log('\nverifying...');
  const check = {};
  for (const val of ['Yea', 'Nay', 'Aye', 'No', 'Present', 'Not Voting']) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/member_votes?position=eq.' + encodeURIComponent(val) + '&select=id&limit=1', { headers: headers });
    const rows = await r.json();
    check[val] = (Array.isArray(rows) && rows.length) ? 'present' : 'none';
  }
  console.log(JSON.stringify(check, null, 2));
  console.log('');
})();