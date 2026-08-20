const { execSync } = require('child_process');
function run(script, env) {
  try { return execSync('node ' + script, { encoding: 'utf8', stdio: 'pipe', env: Object.assign({}, process.env, env || {}) }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
(async () => {
  console.log('\n=== EXPLAINING ALL REMAINING VOTES ===\n');
  let total = 0;
  for (let round = 1; round <= 20; round++) {
    const out = run('explain-votes.js', { EXPLAIN_MAX: '10' });
    const m = out.match(/Done\. (\d+) votes explained/);
    const n = m ? parseInt(m[1], 10) : 0;
    total += n;
    console.log('round ' + round + ': ' + n + ' explained  (running total ' + total + ')');
    const warn = out.match(/summary looked unrelated/g);
    if (warn) console.log('   ' + warn.length + ' summaries rejected as mismatched');
    const errs = out.match(/ERROR|Claude 4\d\d|save failed/g);
    if (errs) console.log('   issues: ' + errs.slice(0, 3).join(', '));
    if (n === 0) { console.log('  nothing left'); break; }
  }
  console.log('\nDone. ' + total + ' votes explained this session.\n');
})();