const fs = require('fs');

// Make a session-1 copy of the Senate ingest, plus a matching backfill.
let src = fs.readFileSync('ingest-senate-votes.js', 'utf8');
src = src.replace('const SESSION = 2;', 'const SESSION = 1;');
src = src.replace("=== SENATE VOTE INGEST ===", "=== SENATE VOTE INGEST (session 1) ===");
fs.writeFileSync('ingest-senate-votes-s1.js', src, 'utf8');
console.log('wrote ingest-senate-votes-s1.js');

// The backfill script already reads session from each stored vote,
// so it works for both sessions unchanged.
const L = [];
const p = (s) => L.push(s);

p("const { execSync } = require('child_process');");
p("function run(script) {");
p("  try { return execSync('node ' + script, { encoding: 'utf8', stdio: 'pipe' }); }");
p("  catch (e) { return (e.stdout || '') + (e.stderr || ''); }");
p("}");
p("(async () => {");
p("  console.log('\\n=== SENATE SESSION 1 BACKFILL ===\\n');");
p("  for (let i = 1; i <= 10; i++) {");
p("    const out = run('ingest-senate-votes-s1.js');");
p("    const m = out.match(/Done\\. (\\d+) votes ingested/);");
p("    const n = m ? parseInt(m[1], 10) : 0;");
p("    if (i === 1 && /roll calls this session: (\\d+)/.test(out)) {");
p("      console.log(out.match(/roll calls this session: \\d+/)[0]);");
p("      console.log(out.match(/final passage votes: \\d+/)[0]);");
p("    }");
p("    console.log('round ' + i + ': ' + n + ' votes');");
p("    if (n === 0) break;");
p("  }");
p("  console.log('\\n--- filling in member votes ---');");
p("  console.log(run('backfill-senate-member-votes.js'));");
p("  console.log('--- policy areas ---');");
p("  console.log(run('backfill-policy-areas.js'));");
p("})();");

fs.writeFileSync('backfill-senate-s1.js', L.join('\n'), 'utf8');
console.log('wrote backfill-senate-s1.js\n');