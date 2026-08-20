let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

(async () => {
  const mRes = await fetch(SUPABASE_URL + '/rest/v1/members?state=eq.Utah&select=bioguide_id,full_name,party,chamber,district&order=chamber.asc', { headers });
  const utah = await mRes.json();

  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?select=id,chamber,roll_call,bill_id,description', { headers });
  const votes = await vRes.json();
  const byId = {};
  votes.forEach(v => { byId[v.id] = v; });

  console.log('\n=== UTAH DELEGATION VOTING RECORDS ===');

  for (const m of utah) {
    const seat = m.chamber === 'Senate' ? 'Senate' : 'UT-' + m.district;
    console.log('\n--- ' + m.full_name + ' (' + m.party.charAt(0) + ', ' + seat + ') ---');

    const mvRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?bioguide_id=eq.' + m.bioguide_id + '&select=vote_id,position', { headers });
    const mvs = await mvRes.json();

    if (!mvs.length) { console.log('  no votes recorded'); continue; }

    const tally = {};
    mvs.forEach(mv => { tally[mv.position] = (tally[mv.position] || 0) + 1; });

    const missed = (tally['Not Voting'] || 0);
    const pct = Math.round((mvs.length - missed) / mvs.length * 100);
    console.log('  ' + mvs.length + ' final passage votes | attendance ' + pct + '%');
    console.log('  ' + JSON.stringify(tally));

    if (missed) {
      console.log('  MISSED:');
      mvs.filter(mv => mv.position === 'Not Voting').forEach(mv => {
        const v = byId[mv.vote_id];
        if (v) console.log('    ' + (v.bill_id || '—') + '  ' + (v.description || '').substring(0, 50));
      });
    }
  }
  console.log('');
})();