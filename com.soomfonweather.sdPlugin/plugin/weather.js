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

const pct = (v) => (v != null ? Math.round(v) : -1); // chance of rain; -1 if the API has none

// Temperatures are rounded and in the requested unit; precipitation is in mm (in for F).
// -> {
//   now:   { temp, feels, kind, night, sky: [top, bottom], rain },
//   today: { hi, lo, kind, rainLeft },            rainLeft: precipitation from this hour to midnight
//   hours: [{ time: 'HH:MM', temp, kind, night, sky, rain }],   +3h, +6h, +9h
//   days:  [{ date: 'YYYY-MM-DD', hi, lo, kind, rain }],        the next 3 days
// }
async function forecast(place, unit) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day` +
    `&hourly=temperature_2m,weather_code,is_day,precipitation_probability,precipitation` +
    `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&forecast_days=4&timezone=auto` +
    `&temperature_unit=${unit === 'F' ? 'fahrenheit' : 'celsius'}&precipitation_unit=${unit === 'F' ? 'inch' : 'mm'}`;
  const j = await getJson(url), c = j.current, h = j.hourly, d = j.daily;
  const dayOf = (iso) => d.time.indexOf(iso.slice(0, 10));
  const hi = h.time.indexOf(c.time.slice(0, 13) + ':00');

  let rainLeft = 0;
  if (hi >= 0) for (let i = hi; i < h.time.length && h.time[i].slice(0, 10) === d.time[0]; i++) rainLeft += h.precipitation[i] || 0;

  const hours = [];
  for (const k of [3, 6, 9]) {
    const i = hi + k;
    if (hi < 0 || i >= h.time.length) break;
    const di = dayOf(h.time[i]);
    hours.push({
      time: h.time[i].slice(11, 16),
      temp: Math.round(h.temperature_2m[i]),
      kind: kindFor(h.weather_code[i]),
      night: h.is_day[i] === 0,
      sky: skyColors(h.time[i], d.sunrise?.[di], d.sunset?.[di], h.is_day[i] === 1),
      rain: pct(h.precipitation_probability[i]),
    });
  }

  return {
    now: {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      kind: kindFor(c.weather_code),
      night: c.is_day === 0,
      sky: skyColors(c.time, d.sunrise?.[0], d.sunset?.[0], c.is_day === 1),
      rain: hi >= 0 ? pct(h.precipitation_probability[hi]) : -1,
    },
    today: { hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), kind: kindFor(d.weather_code[0]), rainLeft },
    hours,
    days: d.time.slice(1, 4).map((date, k) => ({
      date,
      hi: Math.round(d.temperature_2m_max[k + 1]),
      lo: Math.round(d.temperature_2m_min[k + 1]),
      kind: kindFor(d.weather_code[k + 1]),
      rain: pct(d.precipitation_probability_max[k + 1]),
    })),
  };
}

module.exports = { geocode, forecast, kindFor, skyColors, DAY };
