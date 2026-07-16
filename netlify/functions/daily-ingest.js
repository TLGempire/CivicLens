// netlify/functions/daily-ingest.js
//
// Fetches recent federal + Utah bills and summarizes a SMALL number of new
// ones per run. Safe to trigger manually by visiting the function URL.
// The whole body is wrapped so it always returns JSON instead of crashing.

exports.handler = async function (event, context) {
  const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
  const ANTHROPIC_API_KEY = process.env.CLAUDE_KEY;
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

  const headers = { 'Content-Type': 'application/json' };
  const log = [];
  const START_TIME = Date.now();
  const elapsed = () => Date.now() - START_TIME;
  const DEADLINE_MS = 22000; // bail out before Netlify's 30s limit
  let newBills = 0;

  const MAX_NEW_PER_RUN = 1;   // summarize at most 2 new bills per run
  const FETCH_LIMIT = 40;       // consider only a few recent bills per source

  async function fetchWithTimeout(url, options = {}, ms = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    // Quick sanity check on required config
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_KEY env vars', log }) };
    }
    if (!ANTHROPIC_API_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY env var', log }) };
    }

    // ── 1. FETCH FEDERAL BILLS ──
    let candidates = [];
    if (CONGRESS_API_KEY) {
      try {
        const url = `https://api.congress.gov/v3/bill?format=json&limit=${FETCH_LIMIT}&sort=updateDate+desc&api_key=${CONGRESS_API_KEY}`;
        const res = await fetchWithTimeout(url, {}, 6000);
        if (res && res.ok) {
          const data = await res.json();
          candidates.push(...(data.bills || []).map((b) => ({
            id: `${b.type}${b.number}-${b.congress}`,
            level: 'federal',
            number: `${b.type}.${b.number}`,
            chamber: b.originChamber === 'Senate' ? 'U.S. Senate' : 'U.S. House',
            title: b.title || 'Untitled Bill',
            status: b.latestAction?.actionDate ? 'progress' : 'pending',
            status_label: (b.latestAction?.text || 'In Progress').substring(0, 45),
            date: b.latestAction?.actionDate || b.updateDate || '',
            sponsor: b.sponsors?.[0]?.name || 'Unknown sponsor',
          })));
          log.push(`Fetched ${candidates.length} federal bills`);
        } else {
          log.push(`Congress API returned ${res.status}`);
        }
      } catch (e) {
        log.push('Congress fetch error: ' + e.message);
      }
    } else {
      log.push('No CONGRESS_API_KEY set — skipping federal');
    }

    // ── 2. FETCH UTAH BILLS (skipped gracefully if slow) ──
    try {
      const SKIP_UTAH = true;
    const utahUrl = 'https://glen.le.utah.gov/bills/2026GS/billlist.json';
      const res = SKIP_UTAH ? null : await fetchWithTimeout(utahUrl, {}, 5000);
      if (SKIP_UTAH) log.push('Utah skipped (endpoint 404s - fixing separately)');
      if (res.ok) {
        const data = await res.json();
        const list = data.bills || data || [];
        const utahMapped = (Array.isArray(list) ? list : []).slice(0, FETCH_LIMIT).map((b) => {
          const billNum = b.number || b.billno || 'HB000';
          return {
            id: `utah-${billNum}`,
            level: 'state',
            number: billNum,
            chamber: String(billNum).startsWith('H') ? 'Utah House' : 'Utah Senate',
            title: b.shorttitle || b.title || 'Utah Bill',
            status: 'progress',
            status_label: b.status || 'In Progress',
            date: b.lastactiondate || '',
            sponsor: b.sponsor || 'Utah Legislature',
          };
        });
        candidates.push(...utahMapped);
        log.push(`Fetched ${utahMapped.length} Utah bills`);
      } else {
        if (res) log.push(`Utah API returned ${res.status}`);
      }
    } catch (e) {
      log.push('Utah fetch skipped: ' + e.message);
    }

    // ── 3. DEDUPE ──
    const seen = new Set();
    const unique = [];
    for (const bill of candidates) {
      const key = String(bill.number || bill.id || '').replace(/[\s.]/g, '').toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(bill);
    }
    log.push(`${unique.length} unique candidate bills`);

    // ── 4. Walk bills; summarize new ones until we hit the per-run limit ──
    for (const bill of unique) {
      if (elapsed() > DEADLINE_MS) {
        log.push(`DEADLINE REACHED at ${elapsed()}ms - returning early`);
        break;
      }
      if (newBills >= MAX_NEW_PER_RUN) {
        log.push(`Hit per-run limit of ${MAX_NEW_PER_RUN}. Run again for more.`);
        break;
      }

      // Check if THIS bill already has a summary (single simple query)
      let exists = false;
      try {
        const checkRes = await fetchWithTimeout(
          `${SUPABASE_URL}/rest/v1/bills?id=eq.${encodeURIComponent(bill.id)}&select=id,tldr`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
          5000
        );
        if (checkRes.ok) {
          const rows = await checkRes.json();
          if (rows.length && rows[0].tldr) exists = true;
        }
      } catch (e) {
        log.push(`Check error for ${bill.id}: ${e.message}`);
      }
      if (exists) continue;

      // Summarize with Claude
      let summary = null;
      try {
        const prompt = `You are a nonpartisan civic education assistant. Explain this legislation clearly and neutrally.

Bill: ${bill.title}

Respond ONLY with valid JSON (no markdown) in this exact format:
{
  "tldr": "One sentence, plain English, what this bill does. Max 30 words.",
  "summary": "A 2-3 paragraph plain-English summary covering what it does, who it affects, and key numbers.",
  "analysis": "A balanced policy analysis: what supporters say, what critics say, independent context. Strictly nonpartisan.",
  "topic": "ONE topic from this exact list: Healthcare, Education, Taxes, Environment, Housing, Energy, Transportation, Public Safety, Economy, Civil Rights, Immigration, Agriculture, Technology, Veterans, Government Reform",
  "impactTiles": [
    {"icon":"emoji","label":"SHORT LABEL","value":"key stat","type":"positive|caution|neutral"}
  ]
}
Choose the single best "topic". Provide exactly 3 impactTiles.`;

        log.push(`[timing] starting claude for ${bill.id} at ${elapsed()}ms`);
      const claudeRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1200,
            messages: [{ role: 'user', content: prompt }],
          }),
        }, 20000);

        if (claudeRes.ok) {
          const cd = await claudeRes.json();
          let raw = (cd.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
          raw = raw.replace(/```json|```/g, '').trim();
          summary = JSON.parse(raw);
        } else {
          const errTxt = await claudeRes.text();
          log.push(`Claude ${claudeRes.status} for ${bill.id}: ${errTxt.substring(0,120)}`);
        }
      } catch (e) {
        log.push(`Summary error for ${bill.id}: ${e.message}`);
        continue;
      }

      if (!summary || !summary.tldr) continue;

      // Store in Supabase
      try {
        const storeRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/bills`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            id: bill.id,
            level: bill.level,
            number: bill.number,
            chamber: bill.chamber,
            title: bill.title,
            status: bill.status,
            status_label: bill.status_label,
            date: bill.date,
            sponsor: bill.sponsor,
            tldr: summary.tldr,
            summary: summary.summary,
            full_summary: summary.summary,
            analysis: summary.analysis || '',
            tiles: summary.impactTiles || [],
            topic: summary.topic || 'Government Reform',
            updated_at: new Date().toISOString(),
          }),
        }, 5000);
        if (storeRes.ok || storeRes.status === 201) {
          newBills++;
          log.push(`Saved ${bill.id}`);
        } else {
          const t = await storeRes.text();
          log.push(`Store ${storeRes.status} for ${bill.id}: ${t.substring(0,160)}`);
        }
      } catch (e) {
        log.push(`Store error for ${bill.id}: ${e.message}`);
      }
    }

    log.push(`Done. ${newBills} new bills summarized this run.`);
    console.log(log.join('\n'));
    return { statusCode: 200, headers, body: JSON.stringify({ newBills, log }) };

  } catch (fatal) {
    // Catch-all so we never 502 — always return the error as JSON
    log.push('FATAL: ' + fatal.message);
    console.error(fatal);
    return { statusCode: 200, headers, body: JSON.stringify({ error: fatal.message, log }) };
  }
};
