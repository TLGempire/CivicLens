// netlify/functions/daily-ingest.js
//
// SCHEDULED FUNCTION — runs daily, but also safe to trigger manually.
// Fetches recent federal + Utah bills and summarizes a SMALL number of new
// ones per run (to stay under Netlify's 30-second limit). Because already-
// summarized bills are skipped, running it repeatedly fills the database.

exports.handler = async function (event, context) {
  const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const log = [];
  let newBills = 0;

  // How many NEW bills to summarize per run. Kept low to avoid timeouts.
  const MAX_NEW_PER_RUN = 2;
  // How many bills to consider from each source (small = fast).
  const FETCH_LIMIT = 8;

  // Helper: fetch with a hard timeout so a slow API can't hang the function
  async function fetchWithTimeout(url, options = {}, ms = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 1. FETCH FEDERAL BILLS ──
  let candidates = [];
  if (CONGRESS_API_KEY) {
    try {
      const url = `https://api.congress.gov/v3/bill?format=json&limit=${FETCH_LIMIT}&sort=updateDate+desc&api_key=${CONGRESS_API_KEY}`;
      const res = await fetchWithTimeout(url);
      if (res.ok) {
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
      }
    } catch (e) {
      log.push('Congress fetch error: ' + e.message);
    }
  }

  // ── 2. FETCH UTAH BILLS (with timeout so it can't hang) ──
  try {
    const utahUrl = 'https://glen.le.utah.gov/bills/2026GS/billlist.json';
    const res = await fetchWithTimeout(utahUrl, {}, 5000);
    if (res.ok) {
      const data = await res.json();
      const list = data.bills || data || [];
      const utahMapped = list.slice(0, FETCH_LIMIT).map((b) => {
        const billNum = b.number || b.billno || 'HB000';
        return {
          id: `utah-${billNum}`,
          level: 'state',
          number: billNum,
          chamber: billNum.startsWith('H') ? 'Utah House' : 'Utah Senate',
          title: b.shorttitle || b.title || 'Utah Bill',
          status: 'progress',
          status_label: b.status || 'In Progress',
          date: b.lastactiondate || '',
          sponsor: b.sponsor || 'Utah Legislature',
        };
      });
      candidates.push(...utahMapped);
      log.push(`Fetched ${utahMapped.length} Utah bills`);
    }
  } catch (e) {
    log.push('Utah fetch error (skipped): ' + e.message);
  }

  // ── 3. DEDUPE candidates by normalized bill number ──
  const seen = new Set();
  const unique = [];
  for (const bill of candidates) {
    const key = (bill.number || bill.id || '').toString().replace(/[\s.]/g, '').toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(bill);
  }

  // ── 4. ONE bulk query to find which bills already have summaries ──
  const alreadyDone = new Set();
  try {
    const ids = unique.map((b) => `"${b.id}"`).join(',');
    const checkRes = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/bills?id=in.(${encodeURIComponent(ids)})&select=id,tldr`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
      5000
    );
    if (checkRes.ok) {
      const rows = await checkRes.json();
      rows.forEach((r) => { if (r.tldr) alreadyDone.add(r.id); });
    }
  } catch (e) {
    log.push('Bulk existence check error: ' + e.message);
  }

  // Only the new ones need summarizing
  const todo = unique.filter((b) => !alreadyDone.has(b.id));
  log.push(`${todo.length} new bills to summarize (${alreadyDone.size} already cached)`);

  // ── 5. Summarize up to MAX_NEW_PER_RUN new bills ──
  for (const bill of todo) {
    if (newBills >= MAX_NEW_PER_RUN) {
      log.push(`Hit per-run limit of ${MAX_NEW_PER_RUN}. Run again to add more.`);
      break;
    }

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
Choose the single best-fitting "topic" from the list. Provide exactly 3 impactTiles.`;

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
      }, 12000);

      if (claudeRes.ok) {
        const cd = await claudeRes.json();
        let raw = cd.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
        raw = raw.replace(/```json|```/g, '').trim();
        summary = JSON.parse(raw);
      } else {
        log.push(`Claude error ${claudeRes.status} for ${bill.id}`);
      }
    } catch (e) {
      log.push(`Summary error for ${bill.id}: ${e.message}`);
      continue;
    }

    if (!summary) continue;

    // Store in Supabase
    try {
      await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/bills`, {
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
          analysis: summary.analysis,
          tiles: summary.impactTiles || [],
          topic: summary.topic || 'Government Reform',
          updated_at: new Date().toISOString(),
        }),
      }, 5000);
      newBills++;
      log.push(`Saved ${bill.id}`);
    } catch (e) {
      log.push(`Store error for ${bill.id}: ${e.message}`);
    }
  }

  log.push(`Done. ${newBills} new bills summarized this run.`);
  console.log(log.join('\n'));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newBills, cached: alreadyDone.size, log }),
  };
};
