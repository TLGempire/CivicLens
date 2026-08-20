let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

(async () => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bills?level=eq.state&select=id,title,tldr`,
    { headers }
  );
  const rows = await res.json();

  const bad = rows.filter(r =>
    r.title === 'Utah Bill' ||
    /insufficient information|not provided|without knowing|no bill specified/i.test(r.tldr || '')
  );

  console.log('\nPlaceholder bills found: ' + bad.length);

  if (!bad.length) {
    console.log('Nothing to reset.\n');
    return;
  }

  // Deletes are blocked by RLS, so clear tldr instead.
  // The ingest skips bills only when tldr is set, so this makes them eligible again.
  let ok = 0;
  for (const b of bad) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/bills?id=eq.${encodeURIComponent(b.id)}`,
      { method: 'PATCH', headers, body: JSON.stringify({ tldr: null }) }
    );
    if (r.ok) { ok++; console.log('  reset ' + b.id); }
    else console.log('  FAILED ' + b.id + ' (status ' + r.status + ')');
  }

  console.log('\nReset ' + ok + ' of ' + bad.length + '\n');
})();