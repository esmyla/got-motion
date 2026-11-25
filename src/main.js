import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/calc.css';
import './styles/weather.css';
import './styles/chat.css';

import { createCalc } from './calc/calc.js';
import { createChat } from './chat/chat.js';
import { h } from './lib/dom.js';
import { mouseDragScroll } from './lib/gestures.js';
import { sheetIsOpen } from './lib/sheet.js';
import { on, settings } from './lib/store.js';
import { trackKeyboard } from './lib/viewport.js';
import { coach } from './shell/coach.js';
import { createHome } from './shell/home.js';
import { createShell } from './shell/shell.js';
import { openGuide, openReport, openSettings } from './shell/sheets.js';
import { createWeather } from './weather/weather.js';

const device = document.getElementById('device');

// Over-the-shoulder mode: anything marked data-joke disappears.
const applyLegit = () => device.classList.toggle('is-legit', settings.legit);
applyLegit();

const home = createHome(document.getElementById('home'), {
  onOpen: (id) => shell.open(id),
  onReport: openReport,
  onSettings: openSettings,
  onGuide: openGuide,
});

const shell = createShell({
  home,
  apps: {
    weather: { el: document.getElementById('app-weather'), create: createWeather },
    calc: { el: document.getElementById('app-calc'), create: createCalc },
    chat: { el: document.getElementById('app-chat'), create: createChat },
  },
});

on('settings', (key) => {
  if (key === 'legit') applyLegit();
  if (key === 'legit' || key === 'unit') home.refresh();
});

// Resize to the space above the phone's keyboard whenever one is showing.
trackKeyboard(device);

// Sheets live outside the apps, so give them the same drag-with-a-mouse behaviour.
mouseDragScroll(document.getElementById('overlays'));

// iOS only applies :active styles when something is listening for touches, and older
// versions will still pinch-zoom the whole page unless the gesture is refused.
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('gesturestart', (event) => event.preventDefault());

// Build both apps during idle time so the first open is instant.
(window.requestIdleCallback || ((fn) => setTimeout(fn, 250)))(() => shell.warm());

// ---------------------------------------------------------------------------
// Wide screens show the app inside a phone frame, with a fake status bar and a note.

const clock = h('span', { class: 'statusbar-time' });
const tickClock = () => {
  clock.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
};
tickClock();
setInterval(tickClock, 15_000);

document.getElementById('statusbar').append(
  clock,
  h('span', {
    class: 'statusbar-icons',
    html: `
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.500" width="3" height="6.500" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M1.500 4.200a9.600 9.600 0 0 1 13 0"/><path d="M4 6.900a6 6 0 0 1 8 0"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".500" y=".500" width="22" height="12" rx="3.500" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="9" rx="2" fill="currentColor"/><path d="M24.500 4.500v4c.800-.300 1.500-1.100 1.500-2s-.700-1.700-1.500-2z" fill="currentColor" opacity=".5"/></svg>`,
  }),
);

document.getElementById('desk-note').append(
  h('div', { class: 'desk-title', text: 'Got Motion' }),
  h('p', {
    class: 'desk-lede',
    text: 'A fake Weather app, a fake Calculator and fake Messages, for elevators, parties, and other emergencies.',
  }),
  h(
    'ul',
    { class: 'desk-list' },
    h('li', { text: 'Made for phones. Open this page on yours and add it to your Home Screen.' }),
    h('li', null, 'On a computer, drag with the mouse to swipe and scroll.'),
    h('li', null, h('kbd', { text: 'Esc' }), ' goes home. ', h('kbd', { text: '←' }), ' ', h('kbd', { text: '→' }), ' change location.'),
    h('li', null, 'In the calculator and in Messages, type anything on the keyboard.'),
  ),
);

// Offline support, in the built app only (it would get in the way of live reload in dev).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The app opens from its offline copy and looks for a newer version in the background.
  // When one has been fetched: if the app has only just opened and nothing has been touched,
  // switch to it straight away; otherwise offer it, so nothing is yanked from under a thumb.
  let touched = false;
  window.addEventListener('pointerdown', () => (touched = true), { once: true, capture: true });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'updated') return;
    const reload = () => {
      // Never twice in quick succession, so a misbehaving server cannot cause a reload loop.
      const last = Number(sessionStorage.getItem('gotmotion:reloaded') || 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem('gotmotion:reloaded', String(Date.now()));
      window.location.reload();
    };
    const untouched = !touched && !shell.current() && !sheetIsOpen() && performance.now() < 10_000;
    if (untouched) reload();
    else coach.notify({ label: 'Got Motion', text: 'A new version is ready. Tap to update.', ms: 9000, onTap: reload, keep: true });
  });

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      const registration = await navigator.serviceWorker.ready;
      // Hand over everything this visit loaded, so one visit is enough to work offline.
      const urls = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.startsWith(window.location.origin));
      registration.active?.postMessage({ type: 'precache', urls: [...new Set(urls)] });
    } catch {
      /* no service worker here (private window, old browser): the app still works online */
    }
  });
}
