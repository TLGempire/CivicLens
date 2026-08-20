// Runs daily-ingest repeatedly to fill the database.
// Keep `netlify dev` running in your other terminal window.

const ROUNDS = 12;
const URL = 'http://localhost:8888/.netlify/functions/daily-ingest-background';

(async () => {
  console.log('\n=== POPULATING BILLS ===\n');
  let totalNew = 0;

  for (let i = 1; i <= ROUNDS; i++) {
    process.stdout.write('Round ' + i + '/' + ROUNDS + '... ');
    try {
      const res = await fetch(URL);
      const data = await res.json();
      const n = data.newBills || 0;
      totalNew += n;

      const saved = (data.log || []).filter(l => l.startsWith('Saved'));
      if (saved.length) {
        console.log('saved ' + saved.map(s => s.replace('Saved ', '')).join(', '));
      } else {
        console.log('no new bills (all cached)');
        if (n === 0 && i > 2) {
          console.log('\nNothing new left to add. Stopping early.');
          break;
        }
      }
    } catch (e) {
      console.log('failed: ' + e.message);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n=== DONE: ' + totalNew + ' new bills added ===\n');
})();