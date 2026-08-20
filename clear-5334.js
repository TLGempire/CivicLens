let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};

(async () => {
  const r = await fetch(SUPABASE_URL + "/rest/v1/votes?bill_id=eq.H.R.%205334", {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ plain_summary: null, yes_means: null, no_means: null, who_affected: null, explained_at: null })
  });
  console.log('\ncleared H.R. 5334 explanation: ' + (r.ok ? 'ok' : 'failed ' + r.status) + '\n');
})();