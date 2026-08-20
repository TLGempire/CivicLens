const fs = require('fs');

let src = fs.readFileSync('explain-votes.js', 'utf8');

// The summaries endpoint sometimes returns a summary from an unrelated bill.
// Only trust it when it shares meaningful wording with the title/description.
const oldBlock = "          if (list.length) billSummary = String(list[list.length - 1].text || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim().substring(0, 2500);";

const newBlock = [
  "          if (list.length) {",
  "            const cand = String(list[list.length - 1].text || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();",
  "            const stop = new Set(['this','that','with','from','have','will','would','shall','which','their','other','under','such','been','were','into','more','than','also','including','purposes','respect','act','bill','the','and','for','sec']);",
  "            const words = function (s) {",
  "              return new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) ? String(s).toLowerCase().match(/[a-z]{4,}/g).filter(function (w) { return !stop.has(w); }) : []);",
  "            };",
  "            const titleWords = words(billTitle + ' ' + (v.description || ''));",
  "            const summaryWords = words(cand.substring(0, 600));",
  "            let overlap = 0;",
  "            titleWords.forEach(function (w) { if (summaryWords.has(w)) overlap++; });",
  "            if (titleWords.size === 0 || overlap >= 2) {",
  "              billSummary = cand.substring(0, 2500);",
  "            } else {",
  "              console.log('  [' + v.bill_id + '] summary looked unrelated - using title only');",
  "            }",
  "          }",
].join('\n');

if (!src.includes(oldBlock)) {
  console.log('\nERROR: could not find the summary block to patch\n');
  process.exit(1);
}

src = src.replace(oldBlock, newBlock);
fs.writeFileSync('explain-votes.js', src, 'utf8');
console.log('\nPatched explain-votes.js with summary/title sanity check\n');