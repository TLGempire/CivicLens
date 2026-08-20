let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

(async () => {
  const r = await fetch(SUPABASE_URL + "/rest/v1/votes?bill_id=eq.H.R.%205334&select=id,chamber,congress,session,roll_call,bill_id,question,description,policy_area,plain_summary", { headers });
  const rows = await r.json();

  console.log('\n=== WHAT WE STORED ===');
  rows.forEach(v => {
    console.log('  chamber:     ' + v.chamber + '  congress ' + v.congress + ' session ' + v.session + ' roll ' + v.roll_call);
    console.log('  bill_id:     ' + v.bill_id);
    console.log('  description: ' + v.description);
    console.log('  policy_area: ' + v.policy_area);
    console.log('  ai summary:  ' + v.plain_summary);
  });

  console.log('\n=== WHAT CONGRESS.GOV RETURNS FOR 119/hr/5334 ===');
  const b = await fetch('https://api.congress.gov/v3/bill/119/hr/5334?format=json&api_key=' + CONGRESS_KEY);
  console.log('  status: ' + b.status);
  if (b.ok) {
    const d = await b.json();
    console.log('  title:       ' + (d.bill ? d.bill.title : ''));
    console.log('  policyArea:  ' + (d.bill && d.bill.policyArea ? d.bill.policyArea.name : ''));
    console.log('  latestAction:' + (d.bill && d.bill.latestAction ? d.bill.latestAction.text : ''));
  }
  console.log('');
})();