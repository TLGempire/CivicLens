let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

(async () => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bills?select=id,level,title,updated_at&order=updated_at.desc&limit=1000`,
    { headers }
  );
  const rows = await res.json();

  const fed = rows.filter(r => r.level === 'federal').length;
  const state = rows.filter(r => r.level === 'state').length;

  console.log('\n=== BILL COUNT ===');
  console.log('Total:   ' + rows.length);
  console.log('Federal: ' + fed);
  console.log('State:   ' + state);

  console.log('\n5 most recently updated:');
  rows.slice(0, 5).forEach(r => {
    console.log('  ' + r.updated_at + '  ' + r.id + '  ' + String(r.title).substring(0, 45));
  });
  console.log('');
})();