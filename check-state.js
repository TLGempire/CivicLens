let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

(async () => {
  const r = await fetch(SUPABASE_URL + '/rest/v1/members?chamber=eq.Senate&select=bioguide_id,last_name,state&limit=5', { headers });
  console.log('\nSample senators in members table:');
  (await r.json()).forEach(s => console.log('  ' + s.last_name + ' | state="' + s.state + '"'));

  const mv = await fetch(SUPABASE_URL + '/rest/v1/member_votes?select=id&limit=1', { headers });
  const rows = await mv.json();
  console.log('\nmember_votes rows: ' + (Array.isArray(rows) ? rows.length : 'error'));
  console.log('');
})();