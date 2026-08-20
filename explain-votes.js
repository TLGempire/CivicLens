let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY;
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;
const MAX = parseInt(process.env.EXPLAIN_MAX || '5', 10);
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};
function parseBillId(raw) {
  if (!raw) return null;
  const s = raw.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const m = s.match(/^([A-Z]+(?:\s[A-Z]+)*)\s(\d+)$/);
  if (!m) return null;
  const typeMap = { 'H R':'hr','HR':'hr','S':'s','H RES':'hres','HRES':'hres','S RES':'sres','SRES':'sres','H J RES':'hjres','HJRES':'hjres','S J RES':'sjres','SJRES':'sjres','H CON RES':'hconres','HCONRES':'hconres','S CON RES':'sconres','SCONRES':'sconres' };
  const type = typeMap[m[1]];
  return type ? { type: type, number: m[2] } : null;
}
(async () => {
  console.log('\n=== EXPLAIN VOTES (max ' + MAX + ') ===\n');
  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?yes_means=is.null&is_final_passage=eq.true&select=id,bill_id,congress,question,description,policy_area,result&order=vote_date.desc&limit=' + MAX, { headers: headers });
  const votes = await vRes.json();
  console.log('votes needing explanation: ' + votes.length + '\n');
  let done = 0;
  for (const v of votes) {
    let billTitle = v.description || '';
    let billSummary = '';
    const parsed = parseBillId(v.bill_id);
    if (parsed) {
      try {
        const bRes = await fetch('https://api.congress.gov/v3/bill/' + v.congress + '/' + parsed.type + '/' + parsed.number + '?format=json&api_key=' + CONGRESS_KEY);
        if (bRes.ok) {
          const bd = await bRes.json();
          if (bd.bill && bd.bill.title) billTitle = bd.bill.title;
        }
        const sRes = await fetch('https://api.congress.gov/v3/bill/' + v.congress + '/' + parsed.type + '/' + parsed.number + '/summaries?format=json&api_key=' + CONGRESS_KEY);
        if (sRes.ok) {
          const sd = await sRes.json();
          const list = sd.summaries || [];
          if (list.length) {
            const cand = String(list[list.length - 1].text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const stop = new Set(['this','that','with','from','have','will','would','shall','which','their','other','under','such','been','were','into','more','than','also','including','purposes','respect','act','bill','the','and','for','sec']);
            const words = function (s) {
              return new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) ? String(s).toLowerCase().match(/[a-z]{4,}/g).filter(function (w) { return !stop.has(w); }) : []);
            };
            const titleWords = words(billTitle + ' ' + (v.description || ''));
            const summaryWords = words(cand.substring(0, 600));
            let overlap = 0;
            titleWords.forEach(function (w) { if (summaryWords.has(w)) overlap++; });
            if (titleWords.size === 0 || overlap >= 2) {
              billSummary = cand.substring(0, 2500);
            } else {
              console.log('  [' + v.bill_id + '] summary looked unrelated - using title only');
            }
          }
        }
      } catch (e) { /* fall back to description */ }
    }
    const prompt = 'You are a strictly nonpartisan civic educator. Explain what this congressional vote means for ordinary people.\n\n' +
      'Bill: ' + (v.bill_id || 'unknown') + '\n' +
      'Title: ' + billTitle + '\n' +
      'Vote question: ' + (v.question || '') + '\n' +
      'Policy area: ' + (v.policy_area || '') + '\n' +
      (billSummary ? 'Official summary: ' + billSummary + '\n' : '') +
      '\nRules you must follow:\n' +
      '- Neutral throughout. Do not imply either vote is correct, responsible, or harmful.\n' +
      '- Describe consequences, not virtues. No praise or criticism of either position.\n' +
      '- Plain language, no jargon. Assume no political background.\n' +
      '- If effects are uncertain or disputed, say so rather than picking a side.\n' +
      '- Use parallel structure for yes_means and no_means so neither sounds better.\n\n' +
      'Respond ONLY with JSON (no markdown):\n' +
      '{\n' +
      '  "plain_summary": "One or two sentences: what this bill or resolution would do. Max 40 words.",\n' +
      '  "yes_means": "A yes vote means... Describe the concrete effect. Max 30 words.",\n' +
      '  "no_means": "A no vote means... Describe the concrete effect. Max 30 words.",\n' +
      '  "who_affected": "Who this touches most directly. Max 20 words."\n' +
      '}';
    try {
      const cRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
      });
      if (!cRes.ok) { console.log('  ' + v.bill_id + ': Claude ' + cRes.status + ' ' + (await cRes.text()).substring(0, 120)); continue; }
      const cd = await cRes.json();
      let raw = (cd.content || []).map(function (c) { return c.type === 'text' ? c.text : ''; }).join('').trim();
      raw = raw.replace(/```json|```/g, '').trim();
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first !== -1 && last > first) raw = raw.substring(first, last + 1);
      const out = JSON.parse(raw);
      const upd = await fetch(SUPABASE_URL + '/rest/v1/votes?id=eq.' + v.id, {
        method: 'PATCH', headers: headers,
        body: JSON.stringify({
          plain_summary: out.plain_summary,
          yes_means: out.yes_means,
          no_means: out.no_means,
          who_affected: out.who_affected,
          explained_at: new Date().toISOString()
        })
      });
      if (!upd.ok) { console.log('  ' + v.bill_id + ': save failed ' + upd.status); continue; }
      done++;
      console.log('--- ' + v.bill_id + ' (' + (v.policy_area || '') + ') ---');
      console.log('  WHAT: ' + out.plain_summary);
      console.log('  YES:  ' + out.yes_means);
      console.log('  NO:   ' + out.no_means);
      console.log('  WHO:  ' + out.who_affected);
      console.log('');
    } catch (e) {
      console.log('  ' + v.bill_id + ': ERROR ' + e.message);
    }
  }
  console.log('Done. ' + done + ' votes explained.\n');
})();