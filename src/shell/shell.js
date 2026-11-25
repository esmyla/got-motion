// Navigation between the home screen and the three fake apps, the swipeable home bar,
// and the bookkeeping that feeds the busyness report.

import { animate, clamp, settle, themeColor } from '../lib/dom.js';
import { drag } from '../lib/gestures.js';
import { tick } from '../lib/haptics.js';
import { closeAllSheets, closeTopSheet, sheetIsOpen } from '../lib/sheet.js';
import { bump, firstTime, setSetting, settings } from '../lib/store.js';
import { coach } from './coach.js';

const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)';
const FULL = 'inset(0px 0px 0px 0px round 0px)';
const GAP = 18; // space between two apps while sliding from one to the other
const IDS = ['weather', 'calc', 'chat'];
const TITLES = { weather: 'Weather', calc: 'Calculator', chat: 'Messages' };
const HOME_COLOR = '#0e0f13';

export function createShell({ apps, home }) {
  const device = document.getElementById('device');
  const bar = document.getElementById('homebar');
  const barHit = bar.querySelector('.homebar-hit');

  let current = null;
  let busy = false;
  let closeOptions = null;
  let leaving = false; // true while a swipe-up (not the phone's back gesture) is closing the app
  const visited = new Set();

  // What an app is told about the rest of the phone.
  const ctx = { current: () => current, goTo: (id) => goTo(id) };
  const instance = (id) => (apps[id].instance ||= apps[id].create(apps[id].el, ctx));
  /** The app one swipe to the right (+1) or left (-1), wrapping round. */
  const neighbor = (id, step) => IDS[(IDS.indexOf(id) + step + IDS.length) % IDS.length];

  function arrived(id) {
    visited.add(id);
    if (visited.size === IDS.length && !visited.has('all')) {
      visited.add('all');
      bump('trifecta');
    }
  }

  /** The home-screen tile an app grows out of and shrinks back into, as a clip-path. */
  function clipFor(id) {
    const d = device.getBoundingClientRect();
    const r = home.tileRect(id);
    if (!r || !r.width) return 'inset(40% 30% 40% 30% round 30px)';
    const top = clamp(r.top - d.top, 0, d.height);
    const bottom = clamp(d.bottom - r.bottom, 0, d.height);
    return `inset(${top}px ${d.right - r.right}px ${bottom}px ${r.left - d.left}px round 24px)`;
  }

  async function open(id, { instant = false, push = true } = {}) {
    if (busy || current) return;
    busy = true;
    const app = apps[id];
    app.el.hidden = false;
    instance(id).show();
    current = id;
    if (push) history.pushState({ app: id }, '', `#${id}`);
    const clip = clipFor(id);
    const moves = instant
      ? []
      : await Promise.all([
          animate(app.el, [{ clipPath: clip, opacity: 0.4 }, { clipPath: FULL, opacity: 1 }], { duration: 480, easing: EASE }),
          animate(home.el, [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.93)', opacity: 0.25 }], {
            duration: 480,
            easing: EASE,
          }),
        ]);
    home.el.style.visibility = 'hidden';
    settle(moves);
    bar.hidden = false;
    document.title = TITLES[id];
    coach.setContext(id);
    arrived(id);
    busy = false;
    tips(id);
  }

  async function close({ transform = 'none', radius = '0px' } = {}) {
    if (busy || !current) return;
    busy = true;
    closeAllSheets();
    coach.setContext(null);
    const id = current;
    const app = apps[id];
    bar.hidden = true;
    home.refresh();
    home.el.style.visibility = '';
    const homeFrom = {
      transform: home.el.style.transform || 'scale(0.93)',
      opacity: home.el.style.opacity || '0.25',
    };
    home.el.style.transform = '';
    home.el.style.opacity = '';
    const clip = clipFor(id);
    app.el.style.transform = '';
    app.el.style.borderRadius = '';
    const moves = await Promise.all([
      animate(
        app.el,
        [
          { clipPath: FULL, opacity: 1, transform, borderRadius: radius },
          { clipPath: clip, opacity: 0, transform: 'none', borderRadius: '0px' },
        ],
        { duration: 440, easing: EASE },
      ),
      animate(home.el, [homeFrom, { transform: 'none', opacity: 1 }], { duration: 440, easing: EASE }),
    ]);
    app.el.hidden = true;
    settle(moves);
    app.instance.hide();
    document.title = 'Got Motion';
    themeColor(HOME_COLOR);
    current = null;
    busy = false;
  }

  async function switchTo(id, dir, { fromDx = 0, record = true } = {}) {
    if (busy || !current || current === id) return;
    busy = true;
    closeAllSheets();
    const from = apps[current];
    const to = apps[id];
    const width = device.clientWidth + GAP;
    to.el.hidden = false;
    instance(id).show();
    const timing = { duration: 380, easing: EASE };
    const moves = await Promise.all([
      animate(from.el, [{ transform: `translateX(${fromDx}px)` }, { transform: `translateX(${-dir * width}px)` }], timing),
      animate(to.el, [{ transform: `translateX(${fromDx + dir * width}px)` }, { transform: 'translateX(0px)' }], timing),
    ]);
    from.el.hidden = true;
    from.el.style.transform = '';
    to.el.style.transform = '';
    settle(moves);
    from.instance.hide();
    document.title = TITLES[id];
    current = id;
    history.replaceState({ app: id }, '', `#${id}`);
    coach.setContext(id);
    arrived(id);
    if (record) {
      bump('switches');
      coach.event('switch', { chance: 0.6 });
    }
    busy = false;
  }

  /** Open an app from anywhere: a notification tap uses this. */
  function goTo(id) {
    if (!apps[id] || current === id) return;
    if (current) switchTo(id, 1);
    else open(id);
  }

  /** Leave the current app. Goes through history so the phone's back gesture does the same thing. */
  function requestClose(options) {
    if (busy || !current) return;
    if (history.state && history.state.app) {
      closeOptions = options || null;
      leaving = true;
      history.back();
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      close(options);
    }
  }

  function syncToHistory() {
    if (busy) {
      setTimeout(syncToHistory, 500);
      return;
    }
    const target = history.state?.app;
    const options = closeOptions;
    const swipedAway = leaving;
    closeOptions = null;
    leaving = false;
    // The phone's back gesture should first close whatever is open on top: a sheet, the
    // radar, a conversation. Only then does it leave the app.
    if (current && !swipedAway && !(target && apps[target])) {
      const handled = sheetIsOpen() ? closeTopSheet() : apps[current].instance.back?.();
      if (handled) {
        history.pushState({ app: current }, '', `#${current}`);
        return;
      }
    }
    if (target && apps[target]) {
      if (!current) open(target, { push: false });
      else if (current !== target) switchTo(target, 1, { record: false });
    } else if (current) {
      close(options || undefined);
    }
  }
  window.addEventListener('popstate', syncToHistory);

  function tips(id) {
    if (firstTime('tip-bar')) {
      coach.tip('Swipe the bar at the bottom up to leave. Swipe it sideways to switch apps.');
      hintBar();
    }
    if (id === 'calc' && firstTime('tip-mash')) {
      coach.tip('Mash mode is on. Hit any keys at all. The math writes itself.');
    } else if (id === 'chat' && firstTime('tip-chat')) {
      coach.tip('Open a conversation, tap the message box and hit any keys. The texts write themselves.');
    } else if (id === 'weather' && firstTime('tip-weather')) {
      coach.tip('Swipe sideways for more situations. Pull down to refresh. Tap any card.');
    }
  }

  function hintBar() {
    bar.classList.add('is-hint');
    setTimeout(() => bar.classList.remove('is-hint'), 2400);
  }

  // ---------------------------------------------------------------- home bar

  let mode = null; // 'up' | 'side' once the drag direction is known
  let other = null;
  let holdTimer = 0;
  let held = false;

  function toggleLegit() {
    held = true;
    setSetting('legit', !settings.legit);
    tick(18);
    bar.classList.add('is-legit-flash');
    setTimeout(() => bar.classList.remove('is-legit-flash'), 500);
    if (!settings.legit) coach.event('jokesBack', { force: true });
  }

  drag(barHit, {
    onStart: () => {
      if (busy || !current) return false;
      mode = null;
      other = null;
      held = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(toggleLegit, 650);
      return true;
    },
    onMove: ({ dx, dy }) => {
      if (held) return;
      const el = apps[current].el;
      if (!mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        clearTimeout(holdTimer);
        mode = Math.abs(dx) > Math.abs(dy) ? 'side' : 'up';
        if (mode === 'up') {
          home.refresh();
          home.el.style.visibility = '';
        }
      }
      if (mode === 'side' && dx !== 0) {
        // Swiping left brings in the next app, right the previous one. Changing direction
        // mid-swipe swaps which neighbour is waiting at the edge.
        const wanted = neighbor(current, dx < 0 ? 1 : -1);
        if (wanted !== other) {
          if (other) {
            apps[other].el.hidden = true;
            apps[other].el.style.transform = '';
            apps[other].instance.hide();
          }
          other = wanted;
          apps[other].el.hidden = false;
          instance(other).show();
        }
      }
      if (mode === 'up') {
        const p = clamp(-dy / 280, 0, 1);
        el.style.transform = `translateY(${-p * 80}px) scale(${1 - p * 0.18})`;
        el.style.borderRadius = `${p * 40}px`;
        home.el.style.opacity = String(0.25 + p * 0.55);
        home.el.style.transform = `scale(${0.93 + p * 0.05})`;
      } else if (other) {
        const width = device.clientWidth + GAP;
        el.style.transform = `translateX(${dx}px)`;
        apps[other].el.style.transform = `translateX(${dx + (dx < 0 ? width : -width)}px)`;
      }
    },
    onEnd: async ({ dx, dy, vx, vy, cancelled }) => {
      clearTimeout(holdTimer);
      if (held || !current) return;
      const el = apps[current].el;
      if (!mode) {
        // A plain tap: show how the bar works.
        hintBar();
        coach.tip('Swipe this bar up to leave, sideways to switch apps. Hold it to hide every joke.', { ms: 5200 });
        return;
      }
      if (mode === 'up') {
        if (!cancelled && (dy < -70 || vy < -0.4)) {
          requestClose({ transform: el.style.transform || 'none', radius: el.style.borderRadius || '0px' });
          return;
        }
        busy = true;
        const moves = await Promise.all([
          animate(el, [{ transform: el.style.transform, borderRadius: el.style.borderRadius }, { transform: 'none', borderRadius: '0px' }], {
            duration: 300,
            easing: EASE,
          }),
          animate(home.el, [{ opacity: home.el.style.opacity, transform: home.el.style.transform }, { opacity: 0.25, transform: 'scale(0.93)' }], {
            duration: 300,
            easing: EASE,
          }),
        ]);
        el.style.transform = '';
        el.style.borderRadius = '';
        home.el.style.opacity = '';
        home.el.style.transform = '';
        home.el.style.visibility = 'hidden';
        settle(moves);
        busy = false;
        return;
      }
      if (!other) {
        el.style.transform = '';
        return;
      }
      const width = device.clientWidth + GAP;
      const commit = !cancelled && (Math.abs(dx) > width * 0.26 || Math.abs(vx) > 0.45) && dx !== 0;
      if (commit) {
        const target = other;
        el.style.transform = '';
        apps[target].el.style.transform = '';
        switchTo(target, dx < 0 ? 1 : -1, { fromDx: dx });
        return;
      }
      busy = true;
      const otherEl = apps[other].el;
      const moves = await Promise.all([
        animate(el, [{ transform: el.style.transform }, { transform: 'translateX(0px)' }], { duration: 280, easing: EASE }),
        animate(otherEl, [{ transform: otherEl.style.transform }, { transform: `translateX(${dx < 0 ? width : -width}px)` }], {
          duration: 280,
          easing: EASE,
        }),
      ]);
      el.style.transform = '';
      otherEl.style.transform = '';
      otherEl.hidden = true;
      settle(moves);
      apps[other].instance.hide();
      instance(current).show(); // the peeked-at app borrowed the toolbar colour; take it back
      busy = false;
    },
  });

  // Keyboard and screen-reader activation has no drag, so it simply goes home.
  barHit.addEventListener('click', (event) => {
    if (event.detail === 0) requestClose();
  });

  // ------------------------------------------------------------ bookkeeping

  const presses = new Map();
  device.addEventListener(
    'pointerdown',
    (event) => {
      coach.activity();
      if (current) presses.set(event.pointerId, { x: event.clientX, y: event.clientY });
    },
    true,
  );
  const release = (event) => {
    const start = presses.get(event.pointerId);
    if (!start) return;
    presses.delete(event.pointerId);
    if (!current) return;
    // A cancelled pointer means the browser took over to scroll, which is a swipe.
    const moved = event.type === 'pointercancel' || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12;
    bump(moved ? 'swipes' : 'taps');
  };
  device.addEventListener('pointerup', release, true);
  device.addEventListener('pointercancel', release, true);

  const lastScroll = new WeakMap();
  device.addEventListener(
    'scroll',
    (event) => {
      const el = event.target;
      if (!current || !el || el.nodeType !== 1) return;
      const before = lastScroll.get(el);
      const now = { x: el.scrollLeft, y: el.scrollTop };
      lastScroll.set(el, now);
      if (!before) return;
      const distance = Math.abs(now.x - before.x) + Math.abs(now.y - before.y);
      if (distance > 0 && distance < 2000) {
        bump('scrollPx', distance);
        coach.activity();
      }
    },
    { capture: true, passive: true },
  );

  setInterval(() => {
    if (current && !document.hidden) bump('ms', 1000);
  }, 1000);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // Esc backs out one level at a time: sheet, then conversation, then the app.
      if (closeTopSheet()) return;
      if (current && apps[current].instance?.back?.()) return;
      if (current) requestClose();
      return;
    }
    if (current) coach.activity(); // typing in a text box is being busy too
    if (!current || sheetIsOpen() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.('input, textarea')) return;
    apps[current].instance?.onKey?.(event);
  });

  // A link or home-screen shortcut can start straight inside an app.
  const initial = window.location.hash.slice(1);
  if (apps[initial]) open(initial, { instant: true, push: false });

  return { open, goTo, requestClose, switchTo, current: () => current, warm: () => IDS.forEach(instance) };
}
