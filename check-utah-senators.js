let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

(async () => {
  const mRes = await fetch(SUPABASE_URL + '/rest/v1/members?chamber=eq.Senate&state=eq.Utah&select=bioguide_id,full_name,party', { headers });
  const utahSenators = await mRes.json();

  const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?chamber=eq.Senate&select=id,roll_call,bill_id,description,result&order=roll_call.desc', { headers });
  const votes = await vRes.json();
  const byId = {};
  votes.forEach(v => { byId[v.id] = v; });

  for (const s of utahSenators) {
    console.log('\n=== ' + s.full_name + ' (' + s.party + ') ===');
    const mvRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?bioguide_id=eq.' + s.bioguide_id + '&select=vote_id,position', { headers });
    const mvs = await mvRes.json();

    const tally = {};
    mvs.forEach(mv => { tally[mv.position] = (tally[mv.position] || 0) + 1; });
    console.log('record: ' + JSON.stringify(tally));

    console.log('votes:');
    mvs.forEach(mv => {
      const v = byId[mv.vote_id];
      if (!v) return;
      const desc = (v.description || '').substring(0, 55);
      console.log('  ' + String(mv.position).padEnd(11) + (v.bill_id || '—').padEnd(14) + desc);
    });
  }
  console.log('');
})();