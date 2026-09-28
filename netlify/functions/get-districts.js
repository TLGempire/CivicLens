let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const q = (event && event.queryStringParameters) || {};
  const state = q.state || 'Utah';
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/members?state=eq.' + encodeURIComponent(state) + '&chamber=eq.House&select=district', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    const rows = await r.json();
    const seen = {};
    rows.forEach(function (m) { if (m.district != null) seen[String(m.district)] = true; });
    const districts = Object.keys(seen).sort(function (a, b) { return (+a || 0) - (+b || 0); });
    return { statusCode: 200, headers, body: JSON.stringify({ state: state, districts: districts }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ state: state, districts: [], error: e.message }) };
  }
};