// netlify/functions/test-ingest.js
// A minimal diagnostic function. It does ONE bill end-to-end with heavy logging
// and returns detailed JSON so we can see exactly which step works or fails.
// No Congress fetch, no Utah fetch — just Claude + Supabase on a hardcoded bill.

exports.handler = async function () {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const headers = { 'Content-Type': 'application/json' };
  const steps = {};

  try {
    // Step 0: confirm env vars exist (report presence, not values)
    steps.env = {
      hasAnthropic: !!ANTHROPIC_API_KEY,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasSupabaseKey: !!SUPABASE_KEY,
      supabaseUrlStart: SUPABASE_URL ? SUPABASE_URL.substring(0, 20) : null,
    };
    if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ stoppedAt: 'env-check', steps }) };
    }

    // Step 1: Call Claude on a simple hardcoded prompt
    const t1 = Date.now();
    let summary = null;
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          messages: [{ role: 'user', content: 'Respond ONLY with JSON: {"tldr":"test summary","topic":"Technology"}' }],
        }),
      });
      steps.claude = { status: claudeRes.status, ms: Date.now() - t1 };
      if (claudeRes.ok) {
        const cd = await claudeRes.json();
        let raw = (cd.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
        raw = raw.replace(/```json|```/g, '').trim();
        summary = JSON.parse(raw);
        steps.claude.parsed = summary;
      } else {
        const errTxt = await claudeRes.text();
        steps.claude.error = errTxt.substring(0, 200);
        return { statusCode: 200, headers, body: JSON.stringify({ stoppedAt: 'claude', steps }) };
      }
    } catch (e) {
      steps.claude = { error: e.message, ms: Date.now() - t1 };
      return { statusCode: 200, headers, body: JSON.stringify({ stoppedAt: 'claude-exception', steps }) };
    }

    // Step 2: Write a test row to Supabase
    const t2 = Date.now();
    try {
      const storeRes = await fetch(`${SUPABASE_URL}/rest/v1/bills`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: 'test-bill-001',
          level: 'federal',
          number: 'TEST.1',
          chamber: 'U.S. Senate',
          title: 'Diagnostic Test Bill',
          tldr: summary.tldr || 'test',
          summary: 'This is a test row written by test-ingest.',
          topic: summary.topic || 'Technology',
          updated_at: new Date().toISOString(),
        }),
      });
      steps.supabase = { status: storeRes.status, ms: Date.now() - t2 };
      if (!storeRes.ok && storeRes.status !== 201) {
        steps.supabase.error = (await storeRes.text()).substring(0, 300);
        return { statusCode: 200, headers, body: JSON.stringify({ stoppedAt: 'supabase', steps }) };
      }
    } catch (e) {
      steps.supabase = { error: e.message, ms: Date.now() - t2 };
      return { statusCode: 200, headers, body: JSON.stringify({ stoppedAt: 'supabase-exception', steps }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, steps }) };

  } catch (fatal) {
    return { statusCode: 200, headers, body: JSON.stringify({ fatal: fatal.message, steps }) };
  }
};
