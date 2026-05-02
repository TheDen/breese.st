'use strict';

const LAT = -37.7620;
const LNG = 144.961;
const TZ  = 'Australia/Melbourne';

// ── Clock ─────────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('en-AU', {
    timeZone: TZ, weekday: 'short', day: 'numeric',
    month: 'short', hour: 'numeric', minute: '2-digit',
  });
}
updateClock();
setInterval(updateClock, 10_000);

// ── Transit — static GTFS timetable ──────────────────────────────────────
// timetable.json was generated from PTV open GTFS data (no API key required).
// Scheduled times only — check ptv.vic.gov.au for real-time disruptions.

let _timetable = null;

async function getTimetable() {
  if (_timetable) return _timetable;
  const r = await fetch('timetable.json');
  _timetable = await r.json();
  return _timetable;
}

function dayType() {
  const d = new Date().toLocaleDateString('en-AU', { timeZone: TZ, weekday: 'long' }).toLowerCase();
  if (d === 'saturday') return 'saturday';
  if (d === 'sunday')   return 'sunday';
  return 'weekday';
}

function nowMelbMinutes() {
  // Current time in Melbourne as minutes since midnight
  const s = new Date().toLocaleTimeString('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function nextDepartures(sortedTimes, count = 4) {
  const nowM = nowMelbMinutes();
  const toM  = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const after = sortedTimes.filter(t => toM(t) > nowM);
  if (after.length >= count) return after.slice(0, count);
  return [...after, ...sortedTimes.slice(0, count - after.length)];
}

function minsUntil(timeStr) {
  const nowM = nowMelbMinutes();
  const [h, m] = timeStr.split(':').map(Number);
  let dep = h * 60 + m;
  if (dep <= nowM) dep += 24 * 60;
  return dep - nowM;
}

function depPill(timeStr) {
  const mins = minsUntil(timeStr);
  const cls   = mins <= 1 ? 'now' : mins <= 5 ? 'soon' : '';
  const label = mins <= 1 ? 'Now' : mins === 1 ? '1 min' : `${mins} min`;
  return `<span class="dep-pill ${cls}">${label}</span>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Which stops to show and how to group them
const TRANSIT_DISPLAY = [
  {
    heading: 'Upfield Line — Brunswick Station',
    icon: '🚆',
    stops: ['brunswick_city', 'brunswick_upfield'],
  },
  {
    heading: 'Route 19 — Sydney Rd (Albert St)',
    icon: '🚃',
    stops: ['sydney_rd_south', 'sydney_rd_north'],
  },
  {
    heading: 'Route 1 — Lygon St (Victoria St)',
    icon: '🚃',
    stops: ['lygon_st_south', 'lygon_st_north'],
  },
];

async function loadTransit() {
  const el = document.getElementById('transit-content');
  try {
    const data = await getTimetable();
    const byId = Object.fromEntries(data.stops.map(s => [s.id, s]));
    const dt   = dayType();
    let html = '';

    for (const group of TRANSIT_DISPLAY) {
      html += `<div class="transit-group">
        <div class="transit-group-title">${group.icon} ${escHtml(group.heading)}</div>`;

      for (const stopId of group.stops) {
        const stop = byId[stopId];
        if (!stop) continue;
        const times = stop.departures[dt] || stop.departures.weekday || [];
        if (!times.length) continue;
        const next  = nextDepartures(times);
        const badge = stop.type === 'train' ? 'Upfield' : stop.route.replace('Route ', '');
        html += `
          <div class="transit-route">
            <div class="route-badge">${escHtml(badge)}</div>
            <div class="route-info">
              <div class="route-name">${escHtml(stop.direction)}</div>
              <div class="route-times">${next.map(depPill).join('')}</div>
            </div>
          </div>`;
      }
      html += '</div>';
    }

    html += `<div class="transit-updated">
      Scheduled times · <a href="https://www.ptv.vic.gov.au" target="_blank" rel="noopener">Live updates on PTV ↗</a>
    </div>`;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">Couldn't load timetable. <a href="https://www.ptv.vic.gov.au" target="_blank" rel="noopener">Check PTV ↗</a></div>`;
  }
}

loadTransit();
setInterval(loadTransit, 30_000);

// ── Weather — Open-Meteo (no key required) ────────────────────────────────
const WMO = {
  0:  ['☀️',  'Clear sky'],   1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'],
  3:  ['☁️',  'Overcast'],   45: ['🌫️', 'Foggy'],       48: ['🌫️', 'Icy fog'],
  51: ['🌦️', 'Light drizzle'],53:['🌦️', 'Drizzle'],    55: ['🌦️', 'Heavy drizzle'],
  61: ['🌧️', 'Slight rain'], 63: ['🌧️', 'Rain'],       65: ['🌧️', 'Heavy rain'],
  71: ['❄️',  'Slight snow'], 73: ['❄️',  'Snow'],       75: ['❄️',  'Heavy snow'],
  80: ['🌦️', 'Showers'],    81: ['🌧️', 'Showers'],    82: ['⛈️', 'Heavy showers'],
  95: ['⛈️', 'Thunderstorm'],96: ['⛈️', 'Thunderstorm'],99: ['⛈️', 'Thunderstorm'],
};
function wmo(c) { return WMO[c] || ['🌡️', 'Unknown']; }
function degToCompass(d) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8]; }

async function loadWeather() {
  const el = document.getElementById('weather-content');
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}`
      + `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`
      + `&timezone=${TZ}&forecast_days=1`;
    const d   = await (await fetch(url)).json();
    const c   = d.current, day = d.daily;
    const [icon, desc] = wmo(c.weather_code);
    el.innerHTML = `
      <div class="weather-main">
        <div class="weather-icon">${icon}</div>
        <div>
          <div class="weather-temp">${Math.round(c.temperature_2m)}<span class="weather-unit">°C</span></div>
          <div class="weather-feels">Feels ${Math.round(c.apparent_temperature)}°</div>
        </div>
      </div>
      <div class="weather-desc">${desc}</div>
      <div class="weather-row"><span>High / Low</span><span>${Math.round(day.temperature_2m_max[0])}° / ${Math.round(day.temperature_2m_min[0])}°</span></div>
      <div class="weather-row"><span>Wind</span><span>${degToCompass(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} km/h</span></div>
      <div class="weather-row"><span>Rain today</span><span>${day.precipitation_sum[0]} mm</span></div>`;
  } catch {
    el.innerHTML = '<div class="loading">Weather unavailable</div>';
  }
}
loadWeather();
setInterval(loadWeather, 15 * 60_000);

// ── Open Now — Overpass API (no key required) ─────────────────────────────
const AMENITY_GROUPS = {
  'Eat & Drink': [
    'cafe','restaurant','bar','pub','bakery','fast_food','ice_cream',
    'wine_bar','food_court','juice_bar','deli','biergarten','food',
  ],
  'Shops': [
    'supermarket','convenience','greengrocer','butcher','newsagent',
    'florist','books','music','clothing','shoes','bicycle','hardware',
    'gifts','pet','stationery','alcohol','wine','chemist','optician',
    'second_hand','antiques','charity','electronics','mobile_phone',
    'fabric','craft','musical_instrument','furniture','jewelry',
    'camera','toys','sports','outdoor','garden_centre','interior',
    'copyshop','photo','frame','watches','kiosk','variety_store',
  ],
  'Health & Wellbeing': [
    'pharmacy','doctors','dentist','veterinary','gym','yoga','fitness_centre',
    'massage','hairdresser','beauty','laundry','dry_cleaning','tattoo',
    'physiotherapist','optician','chiropractor','acupuncture',
    'psychotherapist','hearing_aids','sports_centre','swimming_pool',
    'sauna','spa',
  ],
  'Arts & Community': [
    'cinema','theatre','library','community_centre','gallery','arts_centre',
    'museum','nightclub','social_club','events_venue','place_of_worship',
    'escape_game','bowling_alley','recreation_ground','studio',
    'hookah_lounge','language_school','driving_school',
  ],
  'Money & Services': [
    'bank','atm','post_office','bureau_de_change','money_transfer',
    'printing','car_wash','fuel','car_repair','key','insurance',
    'estate_agent','travel_agency','dry_cleaning','laundry',
    'tailor','cobbler','locksmith',
  ],
};

// Map each value to its group (amenity= tags)
const AMENITY_TO_GROUP = {};
for (const [g, list] of Object.entries(AMENITY_GROUPS)) for (const a of list) AMENITY_TO_GROUP[a] = g;

// shop= tag overrides that map to a group
const SHOP_TO_GROUP = {
  // Food & drink
  bakery:'Eat & Drink', wine:'Eat & Drink', alcohol:'Eat & Drink', deli:'Eat & Drink',
  // Shops
  supermarket:'Shops', convenience:'Shops', greengrocer:'Shops', butcher:'Shops',
  newsagent:'Shops', florist:'Shops', books:'Shops', music:'Shops',
  clothing:'Shops', shoes:'Shops', bicycle:'Shops', hardware:'Shops',
  gifts:'Shops', pet:'Shops', stationery:'Shops',
  second_hand:'Shops', antiques:'Shops', charity:'Shops',
  electronics:'Shops', mobile_phone:'Shops', fabric:'Shops', craft:'Shops',
  musical_instrument:'Shops', furniture:'Shops', jewelry:'Shops',
  camera:'Shops', toys:'Shops', sports:'Shops', outdoor:'Shops',
  garden_centre:'Shops', interior:'Shops', copyshop:'Shops',
  photo:'Shops', frame:'Shops', watches:'Shops', kiosk:'Shops',
  variety_store:'Shops', art:'Shops',
  // Health
  chemist:'Health & Wellbeing', optician:'Health & Wellbeing',
  hairdresser:'Health & Wellbeing', beauty:'Health & Wellbeing',
  massage:'Health & Wellbeing', tattoo:'Health & Wellbeing',
  gym:'Health & Wellbeing', yoga:'Health & Wellbeing',
  laundry:'Health & Wellbeing', dry_cleaning:'Health & Wellbeing',
  hearing_aids:'Health & Wellbeing', sauna:'Health & Wellbeing',
  // Services
  travel_agency:'Money & Services', estate_agent:'Money & Services',
  tailor:'Money & Services', cobbler:'Money & Services',
  locksmith:'Money & Services', printing:'Money & Services',
  insurance:'Money & Services', key:'Money & Services',
  // Arts
  studio:'Arts & Community',
};

const DAY_IDX = { Mo:1, Tu:2, We:3, Th:4, Fr:5, Sa:6, Su:0 };
function parseMin(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }

function openStatus(oh) {
  if (!oh) return { open: null };
  const s = oh.trim();
  if (s === '24/7') return { open: true, closesAt: null };
  if (s === 'off')  return { open: false };
  const today = new Date().getDay();
  const nowM  = nowMelbMinutes();
  for (const rule of s.split(';').map(r => r.trim()).filter(Boolean)) {
    if (rule === 'off') continue;
    const m = rule.match(/^([A-Za-z,\-]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!m) continue;
    const [, ds, tf, tt] = m;
    const from = parseMin(tf), to = parseMin(tt);
    let dayMatch = false;
    if (ds.includes(','))      dayMatch = ds.split(',').some(d => DAY_IDX[d.trim()] === today);
    else if (ds.includes('-')) { const [a,b]=ds.split('-'),ai=DAY_IDX[a],bi=DAY_IDX[b]; if(ai!=null&&bi!=null) dayMatch=ai<=bi?today>=ai&&today<=bi:today>=ai||today<=bi; }
    else                       dayMatch = DAY_IDX[ds] === today;
    if (!dayMatch) continue;
    const inTime = from < to ? nowM >= from && nowM < to : nowM >= from || nowM < to;
    if (!inTime) continue;
    const minsLeft = from < to ? to - nowM : (to + 1440) - nowM;
    const d = new Date(); d.setHours(Math.floor(to/60), to%60, 0);
    const closesAt = d.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: to%60 ? '2-digit' : undefined });
    return { open: true, closesAt, closingSoon: minsLeft < 45 };
  }
  return { open: false };
}

function haversine(la1, lo1, la2, lo2) {
  const R=6371000, p=Math.PI/180, f1=la1*p, f2=la2*p;
  const a=Math.sin((la2-la1)*p/2)**2+Math.cos(f1)*Math.cos(f2)*Math.sin((lo2-lo1)*p/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function fmtDist(m) { return m<100?`${Math.round(m)}m`:m<1000?`${Math.round(m/10)*10}m`:`${(m/1000).toFixed(1)}km`; }
function fmtAmenity(a) { return a.replace(/_/g,' '); }
const GROUP_EMOJI = {'Eat & Drink':'☕','Shops':'🛍','Health & Wellbeing':'💊','Arts & Community':'🎭','Money & Services':'🏦'};

function placeHref(p) {
  if (p.website) return p.website;
  return `https://www.google.com/maps/search/${encodeURIComponent(p.name)}/@${p.lat},${p.lon},17z`;
}

// Cached place data — fetched once, filtered client-side
let _places = null;

function renderPlaces() {
  const el      = document.getElementById('places-content');
  if (!_places) return;

  const term    = document.getElementById('places-search').value.trim().toLowerCase();
  const maxDist = Number(document.getElementById('places-dist-slider').value);

  const filtered = _places.filter(p => {
    if (p.dist > maxDist) return false;
    if (!term) return true;
    return p.name.toLowerCase().includes(term)
        || p.amenity.toLowerCase().includes(term)
        || p.group.toLowerCase().includes(term);
  });

  if (!filtered.length) {
    el.innerHTML = `<div class="places-empty">No open places match — try a different search or wider distance.</div>`;
    return;
  }

  const byGroup = {};
  for (const p of filtered) {
    if (!byGroup[p.group]) byGroup[p.group] = [];
    byGroup[p.group].push(p);
  }

  const totalOpen = filtered.filter(p => p.status.open === true).length;
  let html = `<div class="places-summary"><strong>${totalOpen}</strong> open within ${maxDist >= 1000 ? (maxDist/1000).toFixed(1)+'km' : maxDist+'m'}${term ? ` · "${escHtml(term)}"` : ''}</div>`;

  for (const group of Object.keys(AMENITY_GROUPS)) {
    const list = byGroup[group];
    if (!list?.length) continue;
    html += `<div class="places-group">
      <div class="places-group-title">${GROUP_EMOJI[group]||''} ${group}</div>
      <div class="places-list">`;
    for (const p of list) {
      const dotCls  = p.status.closingSoon ? 'closing-soon' : '';
      const metaTxt = p.status.open===true && p.status.closesAt
        ? `<span class="${p.status.closingSoon?'closing-soon':''}">${p.status.closingSoon?'⚠ ':''}closes ${p.status.closesAt}</span>`
        : escHtml(fmtAmenity(p.amenity));
      const linkIcon = p.website ? '↗' : '⌖';
      html += `<a class="place-item" href="${escHtml(placeHref(p))}" target="_blank" rel="noopener noreferrer">
        <div class="place-dot ${dotCls}"></div>
        <div class="place-item-info">
          <div class="place-name">${escHtml(p.name)}</div>
          <div class="place-meta">${metaTxt}</div>
        </div>
        <div class="place-right">
          <div class="place-dist">${fmtDist(p.dist)}</div>
          <div class="place-link-icon">${linkIcon}</div>
        </div>
      </a>`;
    }
    html += `</div></div>`;
  }
  html += `<p class="places-note">Open status from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> — may not reflect actual hours. ↗ website · ⌖ Google Maps.</p>`;
  el.innerHTML = html;
}

async function loadPlaces() {
  const el = document.getElementById('places-content');
  const amenityList = [...new Set([...Object.values(AMENITY_GROUPS).flat(), ...Object.keys(SHOP_TO_GROUP)])].join('|');
  const shopList    = Object.keys(SHOP_TO_GROUP).join('|');
  const query = `[out:json][timeout:30];
(node["amenity"~"^(${amenityList})$"](around:900,${LAT},${LNG});
 way["amenity"~"^(${amenityList})$"](around:900,${LAT},${LNG});
 node["shop"~"^(${shopList})$"](around:900,${LAT},${LNG});
 way["shop"~"^(${shopList})$"](around:900,${LAT},${LNG}););
out center tags;`;

  try {
    const d = await (await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body: query })).json();
    const seen = new Set();
    _places = (d.elements||[]).flatMap(el => {
      const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
      const tags = el.tags||{};
      if (!tags.name || !lat) return [];
      const key = tags.name + '|' + Math.round(lat*1000) + '|' + Math.round(lon*1000);
      if (seen.has(key)) return [];
      seen.add(key);
      const amenity = tags.amenity || tags.shop || '';
      const group   = AMENITY_TO_GROUP[amenity] || SHOP_TO_GROUP[amenity];
      if (!group) return [];
      const website = tags.website || tags['contact:website'] || tags['contact:url'] || null;
      return [{ name: tags.name, amenity, group, lat, lon,
                dist: haversine(LAT,LNG,lat,lon), website,
                status: openStatus(tags.opening_hours) }];
    })
    .filter(p => p.status.open !== false)
    .sort((a,b) => a.dist - b.dist);

    renderPlaces();
  } catch {
    el.innerHTML = `<div class="error-msg">Couldn't load nearby places.</div>`;
  }
}

// ── Filter controls ───────────────────────────────────────────────────────
const searchInput  = document.getElementById('places-search');
const searchClear  = document.getElementById('places-search-clear');
const distSlider   = document.getElementById('places-dist-slider');
const distLabel    = document.getElementById('dist-label');

searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('hidden', !searchInput.value);
  renderPlaces();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  searchInput.focus();
  renderPlaces();
});
distSlider.addEventListener('input', () => {
  const v = Number(distSlider.value);
  distLabel.textContent = v >= 1000 ? (v/1000).toFixed(1)+'km' : v+'m';
  renderPlaces();
});

loadPlaces();
setInterval(loadPlaces, 5*60_000);
