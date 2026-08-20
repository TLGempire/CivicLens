const tax = require('./policy-taxonomy.js');

let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

(async () => {
  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?select=id,bill_id,policy_area,description,vote_date&order=vote_date.desc', { headers });
  const votes = await vRes.json();
  const byId = {};
  votes.forEach(v => { byId[v.id] = v; });

  // Group votes by friendly issue label
  const groups = {};
  votes.forEach(v => {
    if (tax.isProcedural(v.policy_area)) return;
    const label = tax.displayLabel(v.policy_area);
    const icon = tax.displayIcon(v.policy_area);
    const key = icon + ' ' + label;
    (groups[key] = groups[key] || []).push(v);
  });

  console.log('\n=== BROWSE BY ISSUE ===\n');
  Object.keys(groups).sort().forEach(k => {
    console.log(k + '  (' + groups[k].length + ' votes)');
    groups[k].forEach(v => console.log('     ' + (v.bill_id || '—')));
  });

  const procCount = votes.filter(v => tax.isProcedural(v.policy_area)).length;
  console.log('\n(' + procCount + ' procedural votes hidden from issue browsing)');

  // Now: one member's record on one issue
  const mRes = await fetch(SUPABASE_URL + '/rest/v1/members?state=eq.Utah&chamber=eq.Senate&select=bioguide_id,full_name', { headers });
  const senators = await mRes.json();

  console.log('\n\n=== EXAMPLE: UTAH SENATORS BY ISSUE ===');
  for (const s of senators) {
    const mvRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?bioguide_id=eq.' + s.bioguide_id + '&select=vote_id,position', { headers });
    const mvs = await mvRes.json();

    const byIssue = {};
    mvs.forEach(mv => {
      const v = byId[mv.vote_id];
      if (!v || tax.isProcedural(v.policy_area)) return;
      const label = tax.displayIcon(v.policy_area) + ' ' + tax.displayLabel(v.policy_area);
      (byIssue[label] = byIssue[label] || []).push({ bill: v.bill_id, pos: mv.position });
    });

    console.log('\n--- ' + s.full_name + ' ---');
    Object.keys(byIssue).sort().forEach(k => {
      const items = byIssue[k];
      const summary = items.map(i => i.pos.charAt(0)).join('');
      console.log('  ' + k.padEnd(28) + items.length + ' votes  [' + summary + ']');
    });
  }
  console.log('');
})();