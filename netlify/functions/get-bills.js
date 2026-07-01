// netlify/functions/get-bills.js
//
// Serves bills to the website by reading PRE-LOADED data from Supabase.
// No live Congress.gov calls, no AI generation — everything was already
// done by the daily-ingest scheduled function. This makes the site fast
// and nearly free to run.
//
// Call from your frontend with:  fetch('/.netlify/functions/get-bills')

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let SUPABASE_URL = process.env.SUPABASE_URL;
  // Strip any trailing slash so `${SUPABASE_URL}/rest/v1/...` never doubles up
  if (SUPABASE_URL) {
    // Normalize: strip trailing slashes AND any /rest/v1 endpoint path that may
    // have been pasted in, leaving just the base https://xxx.supabase.co
    SUPABASE_URL = SUPABASE_URL.replace(/\/+$/, '');
    SUPABASE_URL = SUPABASE_URL.replace(/\/rest\/v1.*$/, '');
    SUPABASE_URL = SUPABASE_URL.replace(/\/+$/, '');
  }
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  try {
    // Pull the most recent bills, newest first
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bills?select=*&order=updated_at.desc&limit=40`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );

    if (!res.ok) {
      throw new Error('Supabase read failed: ' + res.status);
    }

    const rows = await res.json();

    // Split into federal and state
    const federal = rows.filter((r) => r.level === 'federal');
    const utah = rows.filter((r) => r.level === 'state');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        federal,
        utah,
        total: rows.length,
        source: 'supabase-cache',
      }),
    };
  } catch (e) {
    console.error('get-bills error:', e.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ federal: [], utah: [], error: e.message }),
    };
  }
};
