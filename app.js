'use strict';

const LAT = -37.7607;
const LNG = 144.9620;
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

function nowMelbMinutes() {
  const s = new Date().toLocaleTimeString('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,sunrise,sunset`
      + `&timezone=${TZ}&forecast_days=2`;
    const d   = await (await fetch(url)).json();
    const c   = d.current, day = d.daily;
    const [icon, desc]       = wmo(c.weather_code);
    const [tmrIcon, tmrDesc] = wmo(day.weather_code[1]);

    // Day/night from sunrise/sunset ISO strings (e.g. "2025-05-02T06:45")
    // Open-Meteo returns naive local-time ISO strings (no offset) — extract HH:MM directly
    const isoMins = iso => { const t = iso.slice(11,16); const [h,m] = t.split(':').map(Number); return h*60+m; };
    const fmtIso  = iso => { const [h,m] = iso.slice(11,16).split(':').map(Number); const d = new Date(2000,0,1,h,m); return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); };
    const nowM    = nowMelbMinutes();
    const riseM   = isoMins(day.sunrise[0]);
    const setM    = isoMins(day.sunset[0]);
    const isDark  = nowM < riseM || nowM >= setM;
    const sunLabel = isDark
      ? (nowM < riseM ? `Sunrise ${fmtIso(day.sunrise[0])}` : `Sunrise ${fmtIso(day.sunrise[1] ?? day.sunrise[0])}`)
      : `Sunset ${fmtIso(day.sunset[0])}`;
    const sunIcon  = isDark ? '🌙' : '☀️';

    el.innerHTML = `
      <div class="weather-inner">
        <div class="weather-main">
          <div class="weather-icon">${icon}</div>
          <div>
            <div class="weather-temp">${Math.round(c.temperature_2m)}<span class="weather-unit">°C</span></div>
            <div class="weather-feels">Feels ${Math.round(c.apparent_temperature)}°</div>
            <div class="weather-desc">${desc}</div>
          </div>
        </div>
        <div class="weather-stats">
          <div class="weather-row"><span>High / Low</span><span>${Math.round(day.temperature_2m_max[0])}° / ${Math.round(day.temperature_2m_min[0])}°</span></div>
          <div class="weather-row"><span>Wind</span><span>${degToCompass(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} km/h</span></div>
          <div class="weather-row"><span>Rain today</span><span>${day.precipitation_sum[0]} mm</span></div>
          <div class="weather-row"><span>${isDark ? 'After dark' : 'Daylight'}</span><span class="sun-status">${sunIcon} ${sunLabel}</span></div>
        </div>
      </div>
      <div class="weather-tomorrow">
        <span class="tmr-label">Tomorrow</span>
        <span class="tmr-icon">${tmrIcon}</span>
        <span class="tmr-desc">${tmrDesc}</span>
        <span class="tmr-range">${Math.round(day.temperature_2m_max[1])}° / ${Math.round(day.temperature_2m_min[1])}°</span>
        <span class="tmr-rain">${day.precipitation_sum[1]} mm rain</span>
      </div>`;
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

// ── Keyword chips ─────────────────────────────────────────────────────────
const KEYWORDS = [
  { label: 'Cafe',        amenities: ['cafe'] },
  { label: 'Bar & Pub',   amenities: ['bar', 'pub', 'wine_bar', 'biergarten'] },
  { label: 'Restaurant',  amenities: ['restaurant', 'fast_food', 'food_court'] },
  { label: 'Bakery',      amenities: ['bakery'] },
  { label: 'Bottle Shop', amenities: ['alcohol', 'wine'] },
  { label: 'Supermarket', amenities: ['supermarket', 'convenience'] },
  { label: 'Pharmacy',    amenities: ['pharmacy', 'chemist'] },
  { label: 'Gym / Yoga',  amenities: ['gym', 'fitness_centre', 'yoga', 'sports_centre'] },
  { label: 'Op Shop',     amenities: ['second_hand', 'charity', 'antiques'] },
  { label: 'Library',     amenities: ['library'] },
  { label: 'Music',       amenities: ['music', 'musical_instrument'] },
  { label: 'Books',       amenities: ['books'] },
];

let _activeKeyword = null;

function buildKeywordChips() {
  const wrap = document.getElementById('keyword-chips');
  wrap.innerHTML = KEYWORDS.map((kw, i) =>
    `<button class="kw-chip" data-idx="${i}">${escHtml(kw.label)}</button>`
  ).join('');
  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.kw-chip');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const kw  = KEYWORDS[idx];
    if (_activeKeyword === kw) {
      _activeKeyword = null;
      btn.classList.remove('active');
    } else {
      _activeKeyword = kw;
      wrap.querySelectorAll('.kw-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    renderPlaces();
  });
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
    if (_activeKeyword && !_activeKeyword.amenities.includes(p.amenity)) return false;
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
  const distStr   = maxDist >= 1000 ? (maxDist/1000).toFixed(1)+'km' : maxDist+'m';
  const filterStr = [_activeKeyword ? escHtml(_activeKeyword.label) : '', term ? `"${escHtml(term)}"` : ''].filter(Boolean).join(' · ');
  let html = `<div class="places-summary"><strong>${totalOpen}</strong> open within ${distStr}${filterStr ? ` · ${filterStr}` : ''}</div>`;

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
(node["amenity"~"^(${amenityList})$"](around:1000,${LAT},${LNG});
 way["amenity"~"^(${amenityList})$"](around:1000,${LAT},${LNG});
 node["shop"~"^(${shopList})$"](around:1000,${LAT},${LNG});
 way["shop"~"^(${shopList})$"](around:1000,${LAT},${LNG}););
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
  // also clear keyword chip if active
  _activeKeyword = null;
  document.querySelectorAll('.kw-chip').forEach(b => b.classList.remove('active'));
  renderPlaces();
});
distSlider.addEventListener('input', () => {
  const v = Number(distSlider.value);
  distLabel.textContent = v >= 1000 ? (v/1000).toFixed(1)+'km' : v+'m';
  renderPlaces();
});

buildKeywordChips();
loadPlaces();
setInterval(loadPlaces, 5*60_000);
