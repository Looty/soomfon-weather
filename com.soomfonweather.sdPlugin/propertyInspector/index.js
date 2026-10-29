// Standard Elgato-style PI entry point (same as the sibling soomfon-* plugins).

const DEFAULTS = { unit: 'C', location: 'London', background: 'black', slides: 'mix' };

const $unit = document.getElementById('unit');
const $background = document.getElementById('background');
const $slides = document.getElementById('slides');
const $location = document.getElementById('location');

let ws = null;
let context = null;
let settings = { ...DEFAULTS };

function applySettings(newSettings) {
  settings = { ...DEFAULTS, ...newSettings };
  $unit.value = settings.unit;
  $background.value = settings.background;
  $slides.value = settings.slides;
  if (document.activeElement !== $location) $location.value = settings.location;
}

function save() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event: 'setSettings', context, payload: settings }));
}

$unit.addEventListener('change', () => {
  settings.unit = $unit.value;
  save();
});

$background.addEventListener('change', () => {
  settings.background = $background.value;
  save();
});

$slides.addEventListener('change', () => {
  settings.slides = $slides.value;
  save();
});

// Save shortly after typing stops (so closing the panel without blur/Enter still keeps it),
// and immediately on blur/Enter. Not on every keystroke, to avoid a geocode per letter.
let typing = null;
function saveLocation() {
  clearTimeout(typing);
  const value = $location.value.trim();
  if (!value || value === settings.location) return;
  settings.location = value;
  save();
}
$location.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(saveLocation, 700); });
$location.addEventListener('change', saveLocation);

function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
  context = inUUID;
  let actionInfo = {};
  try { actionInfo = JSON.parse(inActionInfo); } catch { }
  if (actionInfo?.payload?.settings) applySettings(actionInfo.payload.settings);

  ws = new WebSocket('ws://127.0.0.1:' + inPort);
  ws.onopen = () => {
    ws.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
  };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.event === 'didReceiveSettings') {
      applySettings(data.payload?.settings || {});
    }
  };
}

window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
