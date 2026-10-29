// Weather plugin backend.
//
// Fetches the forecast from Open-Meteo, turns it into a few slides (slides.js),
// renders a looping set of animated frames per slide with render.ps1
// (PowerShell + System.Drawing), then cycles them with setImage. Frames are
// rendered once per weather update, so the animation tick itself is just a
// websocket send. Each key shows the next slide every minute, or on a press.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Plugins, Actions, log } = require('./utils/plugin');
const { geocode, forecast } = require('./weather');
const { SETS, buildSlides } = require('./slides');

const RENDER_SCRIPT = path.join(__dirname, 'render.ps1');
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const DEFAULTS = { unit: 'C', location: 'London', background: 'black', slides: 'mix' };
const BACKGROUNDS = ['black', 'white', 'navy', 'slate', 'forest', 'scene', 'daynight'];
const FRAME_MS = 250;
const ROTATE_MS = 60 * 1000;
const REFRESH_MS = 15 * 60 * 1000;

const plugin = new Plugins();

// context -> { settings, slides: string[][] | null (frames per slide), slide: index shown, since: when it was shown }
const contexts = new Map();
const places = new Map(); // location text -> { name, lat, lon }
let tick = 0;

// -> the slide's animation frames as data URLs. `dot` / `dots` draw the page indicator.
function render(slide, bg, dot, dots) {
  const { kind, night, value, label, sky, rain } = slide;
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RENDER_SCRIPT, '-Kind', kind, '-Night', night ? '1' : '0', '-Temp', value, '-City', label, '-Bg', bg, '-SkyTop', sky[0], '-SkyBottom', sky[1], '-Rain', String(rain), '-Dot', String(dot), '-Dots', String(dots)],
      { windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => (err ? reject(err) : resolve(stdout.split(/\r?\n/).filter(Boolean).map((b) => 'data:image/png;base64,' + b))),
    );
  });
}

async function update(context) {
  const entry = contexts.get(context);
  if (!entry) return;
  const { unit, location, background, slides: set } = entry.settings;
  try {
    let place = places.get(location);
    if (!place) {
      place = await geocode(location);
      places.set(location, place);
    }
    const w = await forecast(place, unit);
    const list = buildSlides(set, w, place.name, unit);
    const slides = [];
    // One at a time, so a refresh of several keys does not start a burst of PowerShell processes.
    for (let i = 0; i < list.length; i++) slides.push(await render(list[i], background, i, list.length));
    const s = entry.settings;
    if (contexts.get(context) === entry && s.unit === unit && s.location === location && s.background === background && s.slides === set) {
      entry.slides = slides;
      entry.slide %= slides.length; // the set can shrink when a slide has nothing to say
    }
  } catch (err) {
    log(`update(${location}): ${err.message}`);
  }
}

function updateAll() {
  for (const context of contexts.keys()) update(context);
}

// The host does not always hand back what the Property Inspector saved, so the last settings are also kept
// on disk. A key that appears with no saved location (new key, or the host lost it) starts from them.
const LAST_FILE = path.join(__dirname, '..', 'last-settings.json');
function loadLast() {
  try { return JSON.parse(fs.readFileSync(LAST_FILE, 'utf8')); } catch { return {}; }
}
function saveLast(s) {
  try { fs.writeFileSync(LAST_FILE, JSON.stringify(s, null, 2)); } catch (err) { log('saveLast: ' + err.message); }
}

function setSettings(context, settings) {
  const restored = !settings?.location;
  const s = { ...DEFAULTS, ...(restored ? loadLast() : {}), ...(settings || {}) };
  s.unit = s.unit === 'F' ? 'F' : 'C';
  if (!BACKGROUNDS.includes(s.background)) s.background = DEFAULTS.background;
  if (!SETS.includes(s.slides)) s.slides = DEFAULTS.slides;
  s.location = String(s.location || '').trim() || DEFAULTS.location;
  saveLast(s);
  // Give the host the restored values too, so the Property Inspector shows them.
  if (restored) plugin.ws.send(JSON.stringify({ event: 'setSettings', context, payload: s }));
  const prev = contexts.get(context);
  contexts.set(context, { settings: s, slides: prev?.slides ?? null, slide: prev?.slide ?? 0, since: prev?.since ?? Date.now() });
  update(context);
}

function nextSlide(entry) {
  entry.slide = entry.slides ? (entry.slide + 1) % entry.slides.length : 0;
  entry.since = Date.now();
}

setInterval(() => {
  tick++;
  const now = Date.now();
  for (const [context, entry] of contexts) {
    if (!entry.slides) continue;
    if (now - entry.since >= ROTATE_MS) nextSlide(entry);
    const frames = entry.slides[entry.slide];
    plugin.setImage(context, frames[tick % frames.length]);
  }
}, FRAME_MS);
setInterval(updateAll, REFRESH_MS);

plugin.weather = new Actions({
  _willAppear({ context, payload }) {
    setSettings(context, payload?.settings);
  },
  _willDisappear({ context }) {
    contexts.delete(context);
  },
  didReceiveSettings({ context, payload }) {
    setSettings(context, payload?.settings);
  },
  // Press the key to show the next slide now; the 1-minute timer starts over.
  keyDown({ context }) {
    const entry = contexts.get(context);
    if (!entry) return;
    if (entry.slides) nextSlide(entry);
    else update(context); // nothing loaded yet (e.g. offline at start): try again
  },
});
