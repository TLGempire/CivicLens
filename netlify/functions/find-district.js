// Looks up a congressional district from a street address.
// Runs server-side because the Census geocoder blocks browser requests.

const FIPS = {'01':'Alabama','02':'Alaska','04':'Arizona','05':'Arkansas','06':'California','08':'Colorado','09':'Connecticut','10':'Delaware','11':'District of Columbia','12':'Florida','13':'Georgia','15':'Hawaii','16':'Idaho','17':'Illinois','18':'Indiana','19':'Iowa','20':'Kansas','21':'Kentucky','22':'Louisiana','23':'Maine','24':'Maryland','25':'Massachusetts','26':'Michigan','27':'Minnesota','28':'Mississippi','29':'Missouri','30':'Montana','31':'Nebraska','32':'Nevada','33':'New Hampshire','34':'New Jersey','35':'New Mexico','36':'New York','37':'North Carolina','38':'North Dakota','39':'Ohio','40':'Oklahoma','41':'Oregon','42':'Pennsylvania','44':'Rhode Island','45':'South Carolina','46':'South Dakota','47':'Tennessee','48':'Texas','49':'Utah','50':'Vermont','51':'Virginia','53':'Washington','54':'West Virginia','55':'Wisconsin','56':'Wyoming'};

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const q = (event && event.queryStringParameters) || {};
  const address = (q.address || '').trim();

  // People type addresses without commas. Census needs them, so rebuild
  // the string as "street, city, state zip" before asking.
  const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  const FULL = {ALABAMA:'AL',ALASKA:'AK',ARIZONA:'AZ',ARKANSAS:'AR',CALIFORNIA:'CA',COLORADO:'CO',CONNECTICUT:'CT',DELAWARE:'DE',FLORIDA:'FL',GEORGIA:'GA',HAWAII:'HI',IDAHO:'ID',ILLINOIS:'IL',INDIANA:'IN',IOWA:'IA',KANSAS:'KS',KENTUCKY:'KY',LOUISIANA:'LA',MAINE:'ME',MARYLAND:'MD',MASSACHUSETTS:'MA',MICHIGAN:'MI',MINNESOTA:'MN',MISSISSIPPI:'MS',MISSOURI:'MO',MONTANA:'MT',NEBRASKA:'NE',NEVADA:'NV',OHIO:'OH',OKLAHOMA:'OK',OREGON:'OR',PENNSYLVANIA:'PA',TENNESSEE:'TN',TEXAS:'TX',UTAH:'UT',VERMONT:'VT',VIRGINIA:'VA',WASHINGTON:'WA',WISCONSIN:'WI',WYOMING:'WY'};

  function normalize(raw) {
    if (raw.indexOf(',') !== -1) return raw;           // already formatted
    const words = raw.replace(/\s+/g, ' ').trim().split(' ');
    if (words.length < 4) return raw;

    let zip = '';
    if (/^\d{5}(-\d{4})?$/.test(words[words.length - 1])) zip = words.pop();

    // Find the state, working backwards
    let stateIdx = -1, stateVal = '';
    for (let i = words.length - 1; i >= 0; i--) {
      const up = words[i].toUpperCase().replace(/[.,]/g, '');
      if (STATES.indexOf(up) !== -1) { stateIdx = i; stateVal = up; break; }
      if (FULL[up]) { stateIdx = i; stateVal = FULL[up]; break; }
    }
    if (stateIdx < 2) return raw;

    // Everything between the street and the state is the city.
    // Streets almost always start with a number, so take the first
    // number-led run as the street and one or two words as the city.
    const before = words.slice(0, stateIdx);
    const cityWords = before.length > 3 ? before.slice(-2) : before.slice(-1);
    const streetWords = before.slice(0, before.length - cityWords.length);
    if (!streetWords.length || !cityWords.length) return raw;

    return streetWords.join(' ') + ', ' + cityWords.join(' ') + ', ' + stateVal + (zip ? ' ' + zip : '');
  }

  const cleaned = normalize(address);

  if (address.length < 8) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: 'Enter a full street address with city and state.' }) };
  }

  const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'
    + '?address=' + encodeURIComponent(cleaned)
    + '&benchmark=Public_AR_Current&vintage=Current_Current&layers=54&format=json';

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Lookup service is unavailable right now.' }) };
    }
    const d = await res.json();
    const matches = (d.result && d.result.addressMatches) || [];
    if (!matches.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'No match. Include the street number, city, and state.' }) };
    }
    const geos = matches[0].geographies || {};
    const key = Object.keys(geos).filter(function (k) { return /congress/i.test(k); })[0];
    if (!key || !geos[key].length) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Found the address but not a district.' }) };
    }
    const g = geos[key][0];
    const state = FIPS[g.STATE];
    const district = String(parseInt(g.BASENAME, 10));
    if (!state) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'That state is not supported yet.' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({
      state: state, district: district, matched: matches[0].matchedAddress, sent: cleaned
    }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: 'Lookup failed. Choose your district below.' }) };
  }
};