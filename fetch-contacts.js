let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;
const STATE = process.env.CONTACT_STATE || 'Utah';
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};
(async () => {
  console.log('\n=== MEMBER CONTACT INFO: ' + STATE + ' ===\n');
  const mRes = await fetch(SUPABASE_URL + '/rest/v1/members?state=eq.' + encodeURIComponent(STATE) + '&select=bioguide_id,full_name,phone', { headers: headers });
  const members = await mRes.json();
  console.log(members.length + ' members\n');
  let done = 0, skipped = 0;
  for (const m of members) {
    if (m.phone) { skipped++; console.log('  ' + m.full_name + ': already has contact info'); continue; }
    try {
      const r = await fetch('https://api.congress.gov/v3/member/' + m.bioguide_id + '?format=json&api_key=' + CONGRESS_KEY);
      if (!r.ok) { console.log('  ' + m.full_name + ': HTTP ' + r.status); continue; }
      const d = await r.json();
      const mem = d.member || {};
      const addr = mem.addressInformation || {};
      const terms = mem.terms || [];
      const last = terms[terms.length - 1] || {};
      const site = mem.officialWebsiteUrl || '';
      // Most congressional sites put the contact form at /contact
      const contact = site ? site.replace(/\/+$/, '') + '/contact' : '';
      const row = {
        phone: addr.phoneNumber || null,
        office_address: addr.officeAddress || null,
        website_url: site || null,
        contact_url: contact || null,
        photo_url: (mem.depiction && mem.depiction.imageUrl) || null,
        term_start: last.startYear || null,
      };
      const upd = await fetch(SUPABASE_URL + '/rest/v1/members?bioguide_id=eq.' + m.bioguide_id, {
        method: 'PATCH', headers: headers, body: JSON.stringify(row)
      });
      if (!upd.ok) { console.log('  ' + m.full_name + ': save failed ' + upd.status); continue; }
      done++;
      console.log('  ' + m.full_name);
      console.log('     ' + (row.phone || 'no phone') + '  ·  ' + (row.website_url || 'no site'));
    } catch (e) {
      console.log('  ' + m.full_name + ': ERROR ' + e.message);
    }
  }
  console.log('\nupdated ' + done + ', skipped ' + skipped + '\n');
})();