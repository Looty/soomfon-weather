// Minimal Stream Dock plugin<->app websocket bridge.
// The host launches this as: node index.js -port P -pluginUUID U -registerEvent E -info I
// i.e. flag/value pairs, so the values sit at argv[3], argv[5], argv[7], argv[9].
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'log.txt');
function log(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
process.on('uncaughtException', (err) => log('uncaughtException: ' + (err?.stack || err)));
process.on('unhandledRejection', (err) => log('unhandledRejection: ' + (err?.stack || err)));

let WebSocket;
try {
  WebSocket = require('ws');
} catch (error) {
  log(`dependency missing: run "npm install" inside ${__dirname} (${error.message})`);
  process.exit(1); // exit cleanly instead of lingering with a dead WebSocket constructor
}

class Plugins {
  constructor() {
    if (Plugins.instance) return Plugins.instance;
    const port = Number(process.argv[3]);
    if (!Number.isInteger(port)) {
      log(`expected -port <number> as first arg, got ${JSON.stringify(process.argv.slice(2).join(' '))}`);
      process.exit(1);
    }
    this.ws = new WebSocket('ws://127.0.0.1:' + port);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ uuid: process.argv[5], event: process.argv[7] })));
    this.ws.on('close', () => process.exit(0));
    this.ws.on('error', () => process.exit(1));
    this.ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const action = data.action?.split('.').pop();
        const actionHandlers = typeof this[action] === 'object' ? this[action] : null;
        if (actionHandlers && typeof actionHandlers[data.event] === 'function') actionHandlers[data.event](data);
        if (typeof this[data.event] === 'function') this[data.event](data);
      } catch (err) {
        // One malformed frame must not take down the whole message pipeline.
        log('message handler error: ' + (err?.stack || err));
      }
    });
    Plugins.instance = this;
  }
  setTitle(context, title) {
    this.ws.send(JSON.stringify({ event: 'setTitle', context, payload: { target: 0, title } }));
  }
  setImage(context, dataUrl) {
    this.ws.send(JSON.stringify({ event: 'setImage', context, payload: { target: 0, image: dataUrl } }));
  }
}

class Actions {
  constructor(handlers) {
    Object.assign(this, handlers);
  }
  willAppear(data) {
    this._willAppear?.(data);
  }
  willDisappear(data) {
    this._willDisappear?.(data);
  }
}

module.exports = { Plugins, Actions, log };
