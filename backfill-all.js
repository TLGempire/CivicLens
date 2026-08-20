// Runs the Senate and House ingest scripts repeatedly to build up vote data.
// Each script caps itself per run, so we loop until nothing new comes back.
const { execSync } = require('child_process');

function run(script) {
  try {
    return execSync('node ' + script, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

const ROUNDS = 8;

console.log('\n=== BACKFILL: SENATE ===\n');
for (let i = 1; i <= ROUNDS; i++) {
  const out = run('ingest-senate-votes.js');
  const m = out.match(/Done\. (\d+) votes ingested/);
  const n = m ? parseInt(m[1], 10) : 0;
  console.log('round ' + i + ': ' + n + ' votes');
  if (n === 0) { console.log('  nothing new, stopping'); break; }
}

console.log('\n=== BACKFILL: HOUSE ===\n');
for (let i = 1; i <= ROUNDS; i++) {
  const out = run('ingest-house-votes.js');
  const m = out.match(/ingested (\d+)\./);
  const n = m ? parseInt(m[1], 10) : 0;
  console.log('round ' + i + ': ' + n + ' votes');
  if (n === 0) { console.log('  nothing new, stopping'); break; }
}

console.log('\n=== NORMALIZING POSITIONS ===');
console.log(run('normalize-positions.js'));

console.log('=== BACKFILLING POLICY AREAS ===');
console.log(run('backfill-policy-areas.js'));