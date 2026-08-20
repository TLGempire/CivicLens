const fs = require('fs');

const L = [];
const p = (s) => L.push(s);

p("let SUPABASE_URL = (process.env.SUPABASE_URL || '')");
p("  .replace(/\\/+$/, '').replace(/\\/rest\\/v1.*$/, '').replace(/\\/+$/, '');");
p("const SUPABASE_KEY = process.env.SUPABASE_KEY;");
p("const headers = {");
p("  apikey: SUPABASE_KEY,");
p("  Authorization: 'Bearer ' + SUPABASE_KEY,");
p("  'Content-Type': 'application/json',");
p("};");
p("(async () => {");
p("  console.log('\\n=== NORMALIZE Aye/No -> Yea/Nay ===\\n');");
p("  const pairs = [['Aye', 'Yea'], ['No', 'Nay']];");
p("  for (const pr of pairs) {");
p("    const from = pr[0];");
p("    const to = pr[1];");
p("    const cRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?position=eq.' + from + '&select=id', { headers: headers });");
p("    const rows = await cRes.json();");
p("    console.log(from + ' rows found: ' + rows.length);");
p("    if (!rows.length) continue;");
p("    const upd = await fetch(SUPABASE_URL + '/rest/v1/member_votes?position=eq.' + from, {");
p("      method: 'PATCH', headers: headers, body: JSON.stringify({ position: to })");
p("    });");
p("    console.log('  -> ' + to + ': ' + (upd.ok ? 'done' : 'FAILED ' + upd.status + ' ' + (await upd.text()).substring(0,150)));");
p("  }");
p("  const check = await fetch(SUPABASE_URL + '/rest/v1/member_votes?select=position', { headers: headers });");
p("  const all = await check.json();");
p("  const tally = {};");
p("  all.forEach(function (r) { tally[r.position] = (tally[r.position] || 0) + 1; });");
p("  console.log('\\nfinal position values: ' + JSON.stringify(tally) + '\\n');");
p("})();");

fs.writeFileSync('normalize-positions.js', L.join('\n'), 'utf8');
console.log('\nWrote normalize-positions.js\n');