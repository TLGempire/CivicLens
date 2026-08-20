// Populates the members table from the Congress.gov API.
// All current members of the 119th Congress (House + Senate).

let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;

const CONGRESS = 119;

(async () => {
  if (!CONGRESS_KEY) { console.log('\nMissing CONGRESS_API_KEY\n'); return; }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };

  console.log('\n=== POPULATING MEMBERS ===\n');

  // Congress.gov pages results 250 at a time
  let all = [];
  let offset = 0;
  while (true) {
    const url = `https://api.congress.gov/v3/member/congress/${CONGRESS}` +
                `?format=json&limit=250&offset=${offset}&currentMember=true&api_key=${CONGRESS_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log('Congress API error ' + res.status);
      console.log((await res.text()).substring(0, 300));
      return;
    }
    const data = await res.json();
    const batch = data.members || [];
    all.push(...batch);
    console.log('fetched ' + batch.length + ' (total ' + all.length + ')');
    if (batch.length < 250) break;
    offset += 250;
  }

  console.log('\nMapping ' + all.length + ' members...');

  const rows = all.map(m => {
    // The API returns "Last, First Middle" — split it out
    const full = m.name || '';
    let last = '', first = '';
    if (full.includes(',')) {
      const parts = full.split(',');
      last = parts[0].trim();
      first = parts.slice(1).join(',').trim();
    } else {
      const parts = full.trim().split(' ');
      first = parts.slice(0, -1).join(' ');
      last = parts[parts.length - 1];
    }

    const chamber = (m.terms?.item?.[m.terms.item.length - 1]?.chamber) || '';

    return {
      bioguide_id: m.bioguideId,
      full_name: full,
      first_name: first,
      last_name: last,
      party: m.partyName || '',
      state: m.state || '',
      district: m.district != null ? String(m.district) : null,
      chamber: chamber.includes('Senate') ? 'Senate' : 'House',
      in_office: true,
      updated_at: new Date().toISOString(),
    };
  }).filter(r => r.bioguide_id);

  // Write in batches so we don't send one enormous request
  let saved = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/members`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (res.ok || res.status === 201) {
      saved += chunk.length;
      console.log('saved ' + saved + '/' + rows.length);
    } else {
      console.log('batch failed (' + res.status + '): ' + (await res.text()).substring(0, 250));
      break;
    }
  }

  const senate = rows.filter(r => r.chamber === 'Senate').length;
  const house = rows.filter(r => r.chamber === 'House').length;
  console.log('\nDone. ' + saved + ' members saved (' + senate + ' Senate, ' + house + ' House)\n');
})();