// Probe the Senate and House roll call feeds to see the real data shape.
// Read-only — writes nothing.

(async () => {
  // ── SENATE: XML feed, one file lists all roll calls for a session ──
  console.log('\n=== SENATE MENU (119th, session 2) ===');
  try {
    const url = 'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml';
    const res = await fetch(url, { headers: { 'User-Agent': 'CivicLens/1.0' } });
    console.log('status:', res.status);
    if (res.ok) {
      const xml = await res.text();
      console.log('length:', xml.length);
      // Show the first vote entry so we can see the field names
      const first = xml.indexOf('<vote>');
      console.log('\nfirst <vote> block:');
      console.log(xml.substring(first, first + 900));
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  // ── HOUSE: one XML file per roll call ──
  console.log('\n\n=== HOUSE ROLL CALL SAMPLE (2026, roll 1) ===');
  try {
    const url = 'https://clerk.house.gov/evs/2026/roll001.xml';
    const res = await fetch(url, { headers: { 'User-Agent': 'CivicLens/1.0' } });
    console.log('status:', res.status);
    if (res.ok) {
      const xml = await res.text();
      console.log('length:', xml.length);
      console.log('\nfirst 1200 chars:');
      console.log(xml.substring(0, 1200));
    } else {
      console.log('body:', (await res.text()).substring(0, 200));
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  console.log('');
})();