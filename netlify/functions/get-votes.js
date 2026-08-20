// Serves vote-tracking data to the site.
// ?state=Utah          -> that state's delegation with records
// ?recent=1            -> most recent votes across Congress

let SUPABASE_URL = process.env.SUPABASE_URL;
if (SUPABASE_URL) {
  SUPABASE_URL = SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
}
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const POLICY_AREAS = {
  'Agriculture and Food': ['Food & Farming', '\u{1F33E}'],
  'Animals': ['Animals', '\u{1F43E}'],
  'Armed Forces and National Security': ['Military & Defense', '\u{1F396}'],
  'Arts, Culture, Religion': ['Arts & Culture', '\u{1F3AD}'],
  'Civil Rights and Liberties, Minority Issues': ['Civil Rights', '\u{2696}'],
  'Commerce': ['Business & Commerce', '\u{1F3EA}'],
  'Congress': ['Congress & Procedure', '\u{1F3DB}'],
  'Crime and Law Enforcement': ['Crime & Policing', '\u{1F693}'],
  'Economics and Public Finance': ['Budget & Spending', '\u{1F4B5}'],
  'Education': ['Education', '\u{1F393}'],
  'Emergency Management': ['Disasters & Emergencies', '\u{1F6A8}'],
  'Energy': ['Energy', '\u{26A1}'],
  'Environmental Protection': ['Environment', '\u{1F332}'],
  'Families': ['Families', '\u{1F46A}'],
  'Finance and Financial Sector': ['Banking & Finance', '\u{1F3E6}'],
  'Foreign Trade and International Finance': ['Trade', '\u{1F6A2}'],
  'Government Operations and Politics': ['Government Operations', '\u{1F5F3}'],
  'Health': ['Healthcare', '\u{1F3E5}'],
  'Housing and Community Development': ['Housing', '\u{1F3D8}'],
  'Immigration': ['Immigration', '\u{1F6C2}'],
  'International Affairs': ['Foreign Policy', '\u{1F30D}'],
  'Labor and Employment': ['Jobs & Labor', '\u{1F477}'],
  'Law': ['Law & Courts', '\u{1F4DC}'],
  'Native Americans': ['Tribal Affairs', '\u{1FAB6}'],
  'Public Lands and Natural Resources': ['Public Lands', '\u{1F3D4}'],
  'Science, Technology, Communications': ['Science & Tech', '\u{1F52C}'],
  'Social Sciences and History': ['History & Research', '\u{1F4DA}'],
  'Social Welfare': ['Social Programs', '\u{1F91D}'],
  'Sports and Recreation': ['Sports & Recreation', '\u{26BD}'],
  'Taxation': ['Taxes', '\u{1F9FE}'],
  'Transportation and Public Works': ['Transportation', '\u{1F697}'],
  'Water Resources Development': ['Water', '\u{1F4A7}']
};
const PROCEDURAL = ['Congress'];

function decorate(v) {
  const entry = POLICY_AREAS[v.policy_area];
  v.issue_label = entry ? entry[0] : (v.policy_area || 'Uncategorized');
  v.issue_icon = entry ? entry[1] : '\u{1F4CB}';
  v.is_procedural = PROCEDURAL.indexOf(v.policy_area) !== -1;
  return v;
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  const db = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
  };

  try {
    const q = (event && event.queryStringParameters) || {};
    const state = q.state || 'Utah';

    // All votes, decorated with friendly issue labels
    const vRes = await fetch(SUPABASE_URL + '/rest/v1/votes?select=*&order=vote_date.desc&limit=1000', { headers: db });
    const votes = (await vRes.json()).map(decorate);
    const voteById = {};
    votes.forEach(function (v) { voteById[v.id] = v; });

    // The state's delegation
    const mRes = await fetch(SUPABASE_URL + '/rest/v1/members?state=eq.' + encodeURIComponent(state) + '&select=*&order=chamber.asc', { headers: db });
    const members = await mRes.json();

    // Each member's positions
    for (const m of members) {
      const mvRes = await fetch(SUPABASE_URL + '/rest/v1/member_votes?bioguide_id=eq.' + m.bioguide_id + '&select=vote_id,position&limit=2000', { headers: db });
      const mvs = await mvRes.json();

      const tally = { Yea: 0, Nay: 0, Present: 0, 'Not Voting': 0 };
      const byIssue = {};
      const positions = [];

      mvs.forEach(function (mv) {
        const v = voteById[mv.vote_id];
        if (!v) return;
        tally[mv.position] = (tally[mv.position] || 0) + 1;
        positions.push({ vote_id: mv.vote_id, position: mv.position });
        if (v.is_procedural) return;
        const key = v.issue_label;
        if (!byIssue[key]) byIssue[key] = { label: key, icon: v.issue_icon, yea: 0, nay: 0, missed: 0, total: 0 };
        byIssue[key].total++;
        if (mv.position === 'Yea') byIssue[key].yea++;
        else if (mv.position === 'Nay') byIssue[key].nay++;
        else if (mv.position === 'Not Voting') byIssue[key].missed++;
      });

      const cast = tally.Yea + tally.Nay + tally.Present;
      const totalVotes = cast + tally['Not Voting'];
      m.record = tally;
      m.total_votes = totalVotes;
      m.attendance_pct = totalVotes ? Math.round(cast / totalVotes * 100) : null;
      m.by_issue = Object.keys(byIssue).sort().map(function (k) { return byIssue[k]; });
      m.positions = positions;
    }

    // Issue list for filtering
    const issueSet = {};
    votes.forEach(function (v) {
      if (v.is_procedural) return;
      issueSet[v.issue_label] = { label: v.issue_label, icon: v.issue_icon, count: (issueSet[v.issue_label] ? issueSet[v.issue_label].count : 0) + 1 };
    });
    const issues = Object.keys(issueSet).sort().map(function (k) { return issueSet[k]; });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        state: state,
        members: members,
        votes: votes,
        issues: issues,
        counts: {
          votes: votes.length,
          members: members.length,
          senate: votes.filter(function (v) { return v.chamber === 'Senate'; }).length,
          house: votes.filter(function (v) { return v.chamber === 'House'; }).length
        }
      })
    };
  } catch (e) {
    return { statusCode: 200, headers: headers, body: JSON.stringify({ error: e.message }) };
  }
};