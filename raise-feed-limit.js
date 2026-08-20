const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'netlify', 'functions', 'get-bills.js');
let content = fs.readFileSync(file, 'utf8');

const before = content;
content = content.replace(/limit=\d+/, 'limit=500');

if (content === before) {
  console.log('\nlimit not found - here are the lines with "limit":\n');
  content.split('\n').forEach((l, i) => {
    if (/limit/i.test(l)) console.log((i + 1) + ': ' + l.trim());
  });
  console.log('');
} else {
  fs.writeFileSync(file, content, 'utf8');
  console.log('\nFeed limit raised to 500\n');
}