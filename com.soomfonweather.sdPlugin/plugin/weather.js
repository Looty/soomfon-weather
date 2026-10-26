// Open-Meteo lookups (same API Skylight uses). Node 20 has global fetch.

// WMO weather code -> scene kind drawn by render.ps1.
function kindFor(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function geocode(query) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(query);
  const r = (await getJson(url)).results?.[0];
  if (!r) throw new Error('location not found: ' + query);
  return { name: r.name, lat: r.latitude, lon: r.longitude };
}

// Sky gradient (top, bottom) keyed to minutes around sunrise (s) and sunset (e), interpolated linearly.
const NIGHT = ['#05081a', '#111b3d'], TWILIGHT = ['#3b3a78', '#f08a4b'], DAY = ['#2a7bd8', '#8fcfff'];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, f) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * f).toString(16).padStart(2, '0')).join('');
const minutes = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

function skyColors(nowIso, sunriseIso, sunsetIso, isDay) {
  if (!sunriseIso || !sunsetIso) return isDay ? DAY : NIGHT; // polar day/night
  const now = minutes(nowIso), s = minutes(sunriseIso), e = minutes(sunsetIso);
  const keys = [[s - 60, NIGHT], [s, TWILIGHT], [s + 60, DAY], [e - 60, DAY], [e, TWILIGHT], [e + 60, NIGHT]];
  if (now <= keys[0][0] || now >= keys[5][0]) return NIGHT;
  for (let i = 0; i < 5; i++) {
    const [t0, c0] = keys[i], [t1, c1] = keys[i + 1];
    if (now >= t0 && now <= t1) { const f = (now - t0) / (t1 - t0); return [mix(c0[0], c1[0], f), mix(c0[1], c1[1], f)]; }
  }
  return DAY;
}

// -> { temp (rounded, in the requested unit), kind, night, sky: [top, bottom] }
async function current(place, unit) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    `&current=temperature_2m,weather_code,is_day&hourly=precipitation_probability&daily=sunrise,sunset&forecast_days=1&timezone=auto` +
    `&temperature_unit=${unit === 'F' ? 'fahrenheit' : 'celsius'}`;
  const j = await getJson(url), c = j.current;
  // Chance of rain for the current local hour; -1 if the API has none.
  const hi = j.hourly?.time?.indexOf(c.time.slice(0, 13) + ':00') ?? -1;
  const rain = hi >= 0 && j.hourly.precipitation_probability[hi] != null ? Math.round(j.hourly.precipitation_probability[hi]) : -1;
  return {
    rain,
    temp: Math.round(c.temperature_2m),
    kind: kindFor(c.weather_code),
    night: c.is_day === 0,
    sky: skyColors(c.time, j.daily?.sunrise?.[0], j.daily?.sunset?.[0], c.is_day === 1),
  };
}

module.exports = { geocode, current, kindFor, skyColors };
