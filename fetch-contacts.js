let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;
const STATE = process.argv[2] || 'Utah';
const ALL = STATE.toUpperCase() === 'ALL';
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
(async () => {
  console.log('\n=== MEMBER CONTACT INFO: ' + (ALL ? 'ALL STATES' : STATE) + ' ===\n');
  const filter = ALL ? '' : 'state=eq.' + encodeURIComponent(STATE) + '&';
  const mRes = await fetch(SUPABASE_URL + '/rest/v1/members?' + filter + 'select=bioguide_id,full_name,photo_url&limit=1000', { headers });
  const members = await mRes.json();
  const todo = members.filter(m => !m.photo_url);
  console.log(members.length + ' members, ' + todo.length + ' need info\n');
  let done = 0, failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const m = todo[i];
    try {
      const r = await fetch('https://api.congress.gov/v3/member/' + m.bioguide_id + '?format=json&api_key=' + CONGRESS_KEY);
      if (!r.ok) { failed++; console.log('  ' + m.full_name + ': HTTP ' + r.status); continue; }
      const mem = (await r.json()).member || {};
      const addr = mem.addressInformation || {};
      const terms = mem.terms || [];
      const last = terms[terms.length - 1] || {};
      const site = mem.officialWebsiteUrl || '';
      const row = {
        phone: addr.phoneNumber || null,
        office_address: addr.officeAddress || null,
        website_url: site || null,
        contact_url: site ? site.replace(/\/+$/, '') + '/contact' : null,
        photo_url: (mem.depiction && mem.depiction.imageUrl) || null,
        term_start: last.startYear || null,
      };
      const upd = await fetch(SUPABASE_URL + '/rest/v1/members?bioguide_id=eq.' + m.bioguide_id, { method: 'PATCH', headers, body: JSON.stringify(row) });
      if (!upd.ok) { failed++; console.log('  ' + m.full_name + ': save failed ' + upd.status); continue; }
      done++;
      if (!row.photo_url) console.log('  ' + m.full_name + ': no photo on Congress.gov');
      if (done % 50 === 0) console.log('  ...' + done + ' of ' + todo.length);
    } catch (e) { failed++; console.log('  ' + m.full_name + ': ERROR ' + e.message); }
  }
  console.log('\nupdated ' + done + ', failed ' + failed + '\n');
})();