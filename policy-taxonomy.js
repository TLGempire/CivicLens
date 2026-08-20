// Maps Congress.gov's 32 official policy areas to plain-language labels.
// Official names come from the Library of Congress and never change,
// so we get consistency for free while showing friendlier wording.

const POLICY_AREAS = {
  'Agriculture and Food':                    { label: 'Food & Farming',        icon: '🌾' },
  'Animals':                                 { label: 'Animals',               icon: '🐾' },
  'Armed Forces and National Security':      { label: 'Military & Defense',    icon: '🎖️' },
  'Arts, Culture, Religion':                 { label: 'Arts & Culture',        icon: '🎭' },
  'Civil Rights and Liberties, Minority Issues': { label: 'Civil Rights',      icon: '⚖️' },
  'Commerce':                                { label: 'Business & Commerce',   icon: '🏪' },
  'Congress':                                { label: 'Congress & Procedure',  icon: '🏛️' },
  'Crime and Law Enforcement':               { label: 'Crime & Policing',      icon: '🚔' },
  'Economics and Public Finance':            { label: 'Budget & Spending',     icon: '💵' },
  'Education':                               { label: 'Education',             icon: '🎓' },
  'Emergency Management':                    { label: 'Disasters & Emergencies', icon: '🚨' },
  'Energy':                                  { label: 'Energy',                icon: '⚡' },
  'Environmental Protection':                { label: 'Environment',           icon: '🌲' },
  'Families':                                { label: 'Families',              icon: '👨‍👩‍👧' },
  'Finance and Financial Sector':            { label: 'Banking & Finance',     icon: '🏦' },
  'Foreign Trade and International Finance': { label: 'Trade',                 icon: '🚢' },
  'Government Operations and Politics':      { label: 'Government Operations', icon: '🗳️' },
  'Health':                                  { label: 'Healthcare',            icon: '🏥' },
  'Housing and Community Development':       { label: 'Housing',               icon: '🏘️' },
  'Immigration':                             { label: 'Immigration',           icon: '🛂' },
  'International Affairs':                   { label: 'Foreign Policy',        icon: '🌍' },
  'Labor and Employment':                    { label: 'Jobs & Labor',          icon: '👷' },
  'Law':                                     { label: 'Law & Courts',          icon: '📜' },
  'Native Americans':                        { label: 'Tribal Affairs',        icon: '🪶' },
  'Public Lands and Natural Resources':      { label: 'Public Lands',          icon: '🏔️' },
  'Science, Technology, Communications':     { label: 'Science & Tech',        icon: '🔬' },
  'Social Sciences and History':             { label: 'History & Research',    icon: '📚' },
  'Social Welfare':                          { label: 'Social Programs',       icon: '🤝' },
  'Sports and Recreation':                   { label: 'Sports & Recreation',   icon: '⚽' },
  'Taxation':                                { label: 'Taxes',                 icon: '🧾' },
  'Transportation and Public Works':         { label: 'Transportation',        icon: '🚗' },
  'Water Resources Development':             { label: 'Water',                 icon: '💧' }
};

// Procedural votes — real, but not what people mean by 'issues'.
// Shown separately rather than mixed into issue browsing.
const PROCEDURAL = ['Congress'];

function displayLabel(officialName) {
  const entry = POLICY_AREAS[officialName];
  return entry ? entry.label : (officialName || 'Uncategorized');
}

function displayIcon(officialName) {
  const entry = POLICY_AREAS[officialName];
  return entry ? entry.icon : '📋';
}

function isProcedural(officialName) {
  return PROCEDURAL.indexOf(officialName) !== -1;
}

module.exports = { POLICY_AREAS, PROCEDURAL, displayLabel, displayIcon, isProcedural };