// Look at a single Senate roll call to see the member-level structure.
// Read-only.

(async () => {
  const url = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00231.xml';
  console.log('\n=== SENATE VOTE 231 DETAIL ===');
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CivicLens/1.0' } });
    console.log('status:', res.status);
    if (!res.ok) {
      console.log('body:', (await res.text()).substring(0, 300));
      return;
    }
    const xml = await res.text();
    console.log('length:', xml.length);

    // Header info (everything before the member list)
    const memberStart = xml.indexOf('<members>');
    console.log('\n--- header ---');
    console.log(xml.substring(0, Math.min(memberStart, 1400)));

    // First two member entries
    console.log('\n--- first members ---');
    console.log(xml.substring(memberStart, memberStart + 700));
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  console.log('');
})();