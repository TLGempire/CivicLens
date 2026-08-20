const fs = require('fs');
const path = require('path');

// 1. Rename daily-ingest.js -> daily-ingest-background.js
//    Netlify gives any function ending in "-background" a 15-minute limit
//    instead of 30 seconds, which is what we need.
const fnDir = path.join(__dirname, 'netlify', 'functions');
const oldPath = path.join(fnDir, 'daily-ingest.js');
const newPath = path.join(fnDir, 'daily-ingest-background.js');

if (fs.existsSync(oldPath)) {
  let code = fs.readFileSync(oldPath, 'utf8');

  // With 15 minutes available, raise the limits substantially
  code = code.replace(/const MAX_NEW_PER_RUN = \d+;/, 'const MAX_NEW_PER_RUN = 25;');
  code = code.replace(/const DEADLINE_MS = \d+;/, 'const DEADLINE_MS = 600000; // 10 min, well under the 15 min ceiling');

  fs.writeFileSync(newPath, code, 'utf8');
  fs.unlinkSync(oldPath);
  console.log('renamed to daily-ingest-background.js');
  console.log('raised MAX_NEW_PER_RUN to 25, deadline to 10 minutes');
} else if (fs.existsSync(newPath)) {
  console.log('already renamed');
} else {
  console.log('ERROR: daily-ingest.js not found');
  process.exit(1);
}

// 2. Create netlify.toml with the daily schedule
const toml = `[build]
  functions = "netlify/functions"
  publish = "."

[functions]
  node_bundler = "esbuild"

# Runs once a day at 9:00 AM UTC (about 2-3 AM Mountain).
# Background functions get a 15-minute limit instead of 30 seconds.
[functions."daily-ingest-background"]
  schedule = "0 9 * * *"
`;

fs.writeFileSync(path.join(__dirname, 'netlify.toml'), toml, 'utf8');
console.log('created netlify.toml with daily 9am UTC schedule');

// 3. Point populate.js at the new function name
const popPath = path.join(__dirname, 'populate.js');
if (fs.existsSync(popPath)) {
  let pop = fs.readFileSync(popPath, 'utf8');
  pop = pop.replace(/functions\/daily-ingest(?!-background)/g, 'functions/daily-ingest-background');
  fs.writeFileSync(popPath, pop, 'utf8');
  console.log('updated populate.js to use new function name');
}

console.log('\nDone.\n');