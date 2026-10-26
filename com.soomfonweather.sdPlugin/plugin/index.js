// Weather plugin backend.
//
// Fetches current conditions from Open-Meteo, renders a looping set of
// animated frames per key with render.ps1 (PowerShell + System.Drawing), then
// cycles them with setImage. Frames are rendered once per weather update, so
// the animation tick itself is just a websocket send.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Plugins, Actions, log } = require('./utils/plugin');
const { geocode, current } = require('./weather');

const RENDER_SCRIPT = path.join(__dirname, 'render.ps1');
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const DEFAULTS = { unit: 'C', location: 'London', background: 'black' };
const BACKGROUNDS = ['black', 'white', 'navy', 'slate', 'forest', 'scene', 'daynight'];
const FRAME_MS = 250;
const REFRESH_MS = 15 * 60 * 1000;

const plugin = new Plugins();

// context -> { settings, frames: string[] | null }
const contexts = new Map();
const places = new Map(); // location text -> { name, lat, lon }
let tick = 0;

function render(kind, night, temp, city, bg, sky, rain) {
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RENDER_SCRIPT, '-Kind', kind, '-Night', night ? '1' : '0', '-Temp', temp, '-City', city, '-Bg', bg, '-SkyTop', sky[0], '-SkyBottom', sky[1], '-Rain', String(rain)],
      { windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => (err ? reject(err) : resolve(stdout.split(/\r?\n/).filter(Boolean).map((b) => 'data:image/png;base64,' + b))),
    );
  });
}

async function update(context) {
  const entry = contexts.get(context);
  if (!entry) return;
  const { unit, location, background } = entry.settings;
  try {
    let place = places.get(location);
    if (!place) {
      place = await geocode(location);
      places.set(location, place);
    }
    const w = await current(place, unit);
    const frames = await render(w.kind, w.night, `${w.temp}°${unit}`, place.name, background, w.sky, w.rain);
    const s = entry.settings;
    if (contexts.get(context) === entry && s.unit === unit && s.location === location && s.background === background) entry.frames = frames;
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
  s.location = String(s.location || '').trim() || DEFAULTS.location;
  saveLast(s);
  // Give the host the restored values too, so the Property Inspector shows them.
  if (restored) plugin.ws.send(JSON.stringify({ event: 'setSettings', context, payload: s }));
  const prev = contexts.get(context);
  contexts.set(context, { settings: s, frames: prev?.frames ?? null });
  update(context);
}

setInterval(() => {
  tick++;
  for (const [context, { frames }] of contexts) {
    if (frames) plugin.setImage(context, frames[tick % frames.length]);
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
  // Press the key to refresh now.
  keyDown({ context }) {
    update(context);
  },
});
