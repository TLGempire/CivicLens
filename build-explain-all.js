const fs = require('fs');
const L = [];
const p = (s) => L.push(s);

p("const { execSync } = require('child_process');");
p("function run(script, env) {");
p("  try { return execSync('node ' + script, { encoding: 'utf8', stdio: 'pipe', env: Object.assign({}, process.env, env || {}) }); }");
p("  catch (e) { return (e.stdout || '') + (e.stderr || ''); }");
p("}");
p("(async () => {");
p("  console.log('\\n=== EXPLAINING ALL REMAINING VOTES ===\\n');");
p("  let total = 0;");
p("  for (let round = 1; round <= 20; round++) {");
p("    const out = run('explain-votes.js', { EXPLAIN_MAX: '10' });");
p("    const m = out.match(/Done\\. (\\d+) votes explained/);");
p("    const n = m ? parseInt(m[1], 10) : 0;");
p("    total += n;");
p("    console.log('round ' + round + ': ' + n + ' explained  (running total ' + total + ')');");
p("    const warn = out.match(/summary looked unrelated/g);");
p("    if (warn) console.log('   ' + warn.length + ' summaries rejected as mismatched');");
p("    const errs = out.match(/ERROR|Claude 4\\d\\d|save failed/g);");
p("    if (errs) console.log('   issues: ' + errs.slice(0, 3).join(', '));");
p("    if (n === 0) { console.log('  nothing left'); break; }");
p("  }");
p("  console.log('\\nDone. ' + total + ' votes explained this session.\\n');");
p("})();");

fs.writeFileSync('explain-all.js', L.join('\n'), 'utf8');
console.log('\nWrote explain-all.js\n');