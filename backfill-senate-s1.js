const { execSync } = require('child_process');
function run(script) {
  try { return execSync('node ' + script, { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
(async () => {
  console.log('\n=== SENATE SESSION 1 BACKFILL ===\n');
  for (let i = 1; i <= 10; i++) {
    const out = run('ingest-senate-votes-s1.js');
    const m = out.match(/Done\. (\d+) votes ingested/);
    const n = m ? parseInt(m[1], 10) : 0;
    if (i === 1 && /roll calls this session: (\d+)/.test(out)) {
      console.log(out.match(/roll calls this session: \d+/)[0]);
      console.log(out.match(/final passage votes: \d+/)[0]);
    }
    console.log('round ' + i + ': ' + n + ' votes');
    if (n === 0) break;
  }
  console.log('\n--- filling in member votes ---');
  console.log(run('backfill-senate-member-votes.js'));
  console.log('--- policy areas ---');
  console.log(run('backfill-policy-areas.js'));
})();