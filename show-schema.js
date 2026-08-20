let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

(async () => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  for (const table of ['members', 'votes', 'member_votes']) {
    console.log('\n=== ' + table + ' ===');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers });
      console.log('status:', res.status);
      if (!res.ok) {
        console.log('error:', (await res.text()).substring(0, 200));
        continue;
      }
      const rows = await res.json();
      if (rows.length) {
        console.log('columns:', Object.keys(rows[0]).join(', '));
      } else {
        console.log('(empty table)');
      }
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  }
  console.log('');
})();