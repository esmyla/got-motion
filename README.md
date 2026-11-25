# Got Motion

**Live: https://esmyla.github.io/got-motion/** (open it on a phone and add it to the Home Screen)

A fake Weather app and a fake Calculator for looking occupied in elevators, at parties, and in
other emergencies. Everything is tappable, swipeable and scrollable; none of it means anything.

- **Weather** — the "locations" are awkward situations (Elevator, Dave's Party, Conference Room B…)
  and the forecast is social: Eye Contact Index, Small Talk chance, Social Pressure, Polite Exit.
  Swipe between places, pull to refresh, tap any card for a chart you can drag a finger along,
  open the radar to pan and pinch a map where the storm cells are people walking toward you.
- **Calculator** — *Mash* mode ignores which key you hit and types a believable calculation with
  a caption ("Dinner, split 7 ways. Kyle had the lobster."). *Math* mode is a real calculator.
- **Over-the-shoulder mode** — hold the bar at the bottom of either app for a second and every
  joke disappears: real city names, real card labels, no captions. Hold again to bring them back.
- **Stage directions** — notification-style acting notes ("Frown slightly. Good. Hold it.") and a
  Performance Review with stats and achievements.

## Run it

```bash
npm install
npm run dev      # http://localhost:5177
npm run build    # static site in dist/
npm run preview  # serves the built site on http://localhost:4177
npm run deploy   # builds and publishes dist/ to the gh-pages branch (the live site)
```

It is a static site with no backend. Built with Vite and plain JavaScript; the only runtime
dependency is the wordmark font. On a phone, open the page and add it to the Home Screen: it then
runs full screen and works offline (a service worker is registered in the built version only).

## Where things are

| Path | What |
| --- | --- |
| `src/shell/` | Home screen, navigation and the swipeable home bar, stage directions, sheets |
| `src/calc/` | Calculator engine (`engine.js`), Mash-mode scripts and captions (`scripts.js`), screen |
| `src/weather/situations.js` | Every situation and all of its copy. Add a place here. |
| `src/weather/forecast.js` | Numbers behind the forecast, plus the joke ↔ straight label for each card |
| `src/weather/` (rest) | Pages and cards, detail chart, location list, radar, animated sky |
| `src/lib/` | Storage and stats, gestures, bottom sheets, small DOM helpers |

Each weather card has a joke face and a straight face (Eye Contact ↔ UV Index, Social Battery ↔
Moon…), so the same layout serves both modes. New copy goes in `situations.js`; a new card also
needs its straight-faced line in `legitLine()` in `forecast.js`.
