# soomfon-weather

A tiny StreamDock plugin for Soomfon Stream Controllers: current temperature plus an animated scene (sun, moon and stars, clouds, fog, drizzle, rain, snow, thunder) on a key. Data from [Open-Meteo](https://open-meteo.com) (no API key).

![Animated weather keys: clear, night, partly cloudy, rain, snow, thunder](docs/keys.gif)

Options (per key, in the Property Inspector):
- **Unit**: Celsius (default) or Fahrenheit
- **Location**: free text city name
- **Background**: black, white, navy, slate, forest green, day/night (follows local time) or scene colors (sky gradient)

<img src="docs/settings.png" alt="Property Inspector settings: unit, location, background" width="356">

Press the key to refresh now; otherwise it refreshes every 15 minutes.

## Install

1. Copy `com.soomfonweather.sdPlugin` to `%APPDATA%\HotSpot\StreamDock\plugins\`
2. `cd com.soomfonweather.sdPlugin\plugin && npm install`
3. Restart Stream Controller, then drag **Weather** onto a key.

## How it works

`plugin/weather.js` geocodes and fetches current conditions. `plugin/render.ps1` (PowerShell + System.Drawing) draws a 12-frame seamless loop per update, and `plugin/index.js` cycles the frames with `setImage` every 250 ms, so the animation costs only a websocket send per tick.
