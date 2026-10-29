// Turns a forecast (weather.js) into the slides a key rotates through.
// Each slide is drawn by render.ps1 with `label` as the headline and `value` as the big text.

const { DAY } = require('./weather');

const SETS = ['mix', 'today', 'hours', 'days'];

function rainAmount(x, unit) {
  if (unit === 'F') return `${x.toFixed(2)} in`;
  return `${x < 10 ? Number(x.toFixed(1)) : Math.round(x)} mm`;
}

const weekday = (date) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

// -> [{ label, value, kind, night, sky, rain }]. Slides with nothing to say are left out.
function buildSlides(set, w, city, unit) {
  const { now, today } = w;
  const deg = (t) => `${t}°${unit}`;
  const nowSlide = { label: city, value: deg(now.temp), kind: now.kind, night: now.night, sky: now.sky, rain: now.rain };
  const hiLo = { label: 'Hi / Lo', value: `${today.hi}°/${today.lo}°`, kind: today.kind, night: now.night, sky: now.sky, rain: -1 };
  // Only when it differs enough from the real temperature to matter.
  const feels = Math.abs(now.feels - now.temp) >= (unit === 'F' ? 5 : 3)
    ? { label: 'Feels', value: deg(now.feels), kind: now.kind, night: now.night, sky: now.sky, rain: -1 }
    : null;
  const rainLeft = today.rainLeft >= (unit === 'F' ? 0.02 : 0.5)
    ? { label: 'Rain today', value: rainAmount(today.rainLeft, unit), kind: 'rain', night: now.night, sky: now.sky, rain: -1 }
    : null;
  const hours = w.hours.map((h) => ({ label: h.time, value: deg(h.temp), kind: h.kind, night: h.night, sky: h.sky, rain: h.rain }));
  const days = w.days.map((d) => ({ label: weekday(d.date), value: `${d.hi}°/${d.lo}°`, kind: d.kind, night: false, sky: DAY, rain: d.rain }));

  const pick = {
    mix: [nowSlide, hiLo, hours[0], days[0]],
    today: [nowSlide, hiLo, feels, rainLeft],
    hours: [nowSlide, ...hours],
    days: [nowSlide, ...days],
  }[set] || [nowSlide];
  return pick.filter(Boolean);
}

module.exports = { SETS, buildSlides };
