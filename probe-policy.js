const CONGRESS_KEY = process.env.CONGRESS_API_KEY;

// Turn "H.R. 6938" or "H R 1689" into { type: 'hr', number: '6938' }
function parseBillId(raw) {
  if (!raw) return null;
  const s = raw.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const m = s.match(/^([A-Z]+(?:\s[A-Z]+)*)\s(\d+)$/);
  if (!m) return null;
  const typeMap = {
    'H R': 'hr', 'HR': 'hr',
    'S': 's',
    'H RES': 'hres', 'HRES': 'hres',
    'S RES': 'sres', 'SRES': 'sres',
    'H J RES': 'hjres', 'HJRES': 'hjres',
    'S J RES': 'sjres', 'SJRES': 'sjres',
    'H CON RES': 'hconres', 'HCONRES': 'hconres',
    'S CON RES': 'sconres', 'SCONRES': 'sconres',
  };
  const type = typeMap[m[1]];
  return type ? { type, number: m[2] } : null;
}

const samples = ['H.R. 6938', 'H R 1689', 'S. 2', 'H.J.Res. 142', 'H CON RES 40', 'S.Res. 817', 'H RES 965'];

(async () => {
  console.log('\n=== PARSE TEST ===');
  samples.forEach(s => console.log('  ' + s.padEnd(16) + ' -> ' + JSON.stringify(parseBillId(s))));

  console.log('\n=== API LOOKUP TEST ===');
  for (const s of samples.slice(0, 4)) {
    const p = parseBillId(s);
    if (!p) { console.log('  ' + s + ': could not parse'); continue; }
    const url = 'https://api.congress.gov/v3/bill/119/' + p.type + '/' + p.number + '?format=json&api_key=' + CONGRESS_KEY;
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log('  ' + s + ': HTTP ' + res.status); continue; }
      const d = await res.json();
      const pa = d.bill && d.bill.policyArea ? d.bill.policyArea.name : '(none)';
      const title = d.bill ? String(d.bill.title).substring(0, 45) : '';
      console.log('  ' + s.padEnd(16) + ' -> ' + pa);
      console.log('       ' + title);
    } catch (e) {
      console.log('  ' + s + ': ERROR ' + e.message);
    }
  }
  console.log('');
})();