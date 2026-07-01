// netlify/functions/summarize-bill.js
//
// Takes a bill's title and text, asks Claude to generate plain-English
// summaries at multiple depth levels, and caches the result in Supabase
// so each bill is only ever summarized ONCE (keeping AI costs low).
//
// Call from your frontend with:
//   fetch('/.netlify/functions/summarize-bill', {
//     method: 'POST',
//     body: JSON.stringify({ billId, title, text })
//   })

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  let billId, title, text;
  try {
    const body = JSON.parse(event.body);
    billId = body.billId;
    title = body.title;
    text = body.text || body.title;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // ── 1. CHECK SUPABASE CACHE FIRST ──
  // If we've already summarized this bill, return the cached version (free + instant)
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const cacheRes = await fetch(
        `${SUPABASE_URL}/rest/v1/bills?id=eq.${encodeURIComponent(billId)}&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );
      if (cacheRes.ok) {
        const rows = await cacheRes.json();
        if (rows.length && rows[0].tldr) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ cached: true, ...rows[0] }),
          };
        }
      }
    } catch (e) {
      console.error('Supabase cache check error:', e.message);
    }
  }

  // ── 2. GENERATE SUMMARY WITH CLAUDE ──
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Anthropic API key not configured' }) };
  }

  const prompt = `You are a nonpartisan civic education assistant. A citizen wants to understand this piece of legislation. Provide a clear, neutral, fact-based explanation.

Bill: ${title}

${text ? `Details: ${text}` : ''}

Respond ONLY with valid JSON (no markdown, no backticks) in exactly this format:
{
  "tldr": "One sentence, plain English, what this bill does. Max 30 words.",
  "summary": "A 2-3 paragraph plain-English summary. Explain what it does, who it affects, and key numbers. No jargon.",
  "analysis": "A balanced policy analysis. Include what supporters say, what critics say, and any independent/expert context. Stay strictly nonpartisan — present both sides fairly.",
  "topic": "ONE topic from this exact list: Healthcare, Education, Taxes, Environment, Housing, Energy, Transportation, Public Safety, Economy, Civil Rights, Immigration, Agriculture, Technology, Veterans, Government Reform",
  "impactTiles": [
    {"icon": "emoji", "label": "SHORT LABEL", "value": "key stat", "type": "positive|caution|neutral"}
  ]
}

For "topic", choose the single best-fitting category from the list. For impactTiles, provide exactly 3 tiles showing the most relevant impacts (financial, who's affected, timeline). Use "positive" for beneficial impacts, "caution" for costs/tradeoffs, "neutral" for informational.`;

  let summary;
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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    let raw = claudeData.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
      .trim();

    // Strip any accidental markdown fences
    raw = raw.replace(/```json|```/g, '').trim();
    summary = JSON.parse(raw);
  } catch (e) {
    console.error('Claude summarization error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Summarization failed: ' + e.message }) };
  }

  // ── 3. CACHE THE RESULT IN SUPABASE ──
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/bills`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: billId,
          title: title,
          tldr: summary.tldr,
          summary: summary.summary,
          full_summary: summary.summary,
          analysis: summary.analysis,
          tiles: summary.impactTiles || [],
          topic: summary.topic || 'Government Reform',
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error('Supabase save error:', e.message);
      // Not fatal — we still return the summary to the user
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ cached: false, ...summary }),
  };
};
