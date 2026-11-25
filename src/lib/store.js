// Everything that persists: settings, the busyness stats, saved situations, the calculator tape.
// One JSON blob in localStorage. If storage is blocked the app still works, it just forgets.

const KEY = 'gotmotion:v1';
const PX_TO_METERS = 0.000264583; // one CSS pixel is 1/96 inch

const dayKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const emptyDay = () => ({ ms: 0, taps: 0, swipes: 0 });

function defaults() {
  return {
    settings: { coach: true, legit: false, haptics: true, alerts: true, unit: 'F' },
    stats: {
      ms: 0,
      taps: 0,
      swipes: 0,
      scrollPx: 0,
      refreshes: 0,
      calcs: 0,
      mashKeys: 0,
      switches: 0,
      radarOpens: 0,
      scrubs: 0,
      nice: 0,
      texts: 0,
      trifecta: 0,
      placesSeen: {},
    },
    days: {},
    achieved: {},
    seen: {},
    weather: { places: ['elevator', 'party', 'meeting', 'thanksgiving', 'grocery'], custom: [], index: 0 },
    calc: { tape: [], mode: 'mash', sci: false },
    chat: { mode: 'mash', threads: {} },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const key of Object.keys(base)) {
    const b = base[key];
    const s = saved[key];
    if (s == null) continue;
    if (Array.isArray(b)) {
      if (Array.isArray(s)) base[key] = s;
    } else if (b && typeof b === 'object') {
      // Free-form maps (days, achieved, seen, placesSeen) are taken whole.
      base[key] = Object.keys(b).length ? merge(b, s) : typeof s === 'object' ? s : b;
    } else if (typeof s === typeof b) {
      base[key] = s;
    }
  }
  return base;
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export const state = merge(defaults(), load());

// Keep two weeks of daily history, which is all the report shows.
{
  const keep = new Set();
  const cursor = new Date();
  for (let i = 0; i < 14; i++) {
    keep.add(dayKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  for (const key of Object.keys(state.days)) if (!keep.has(key)) delete state.days[key];
}

let saveTimer = 0;
let frozen = false; // set while wiping, so the unload handler does not write the old state back
export function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (frozen) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or full storage: carry on without persistence */
  }
}
export function save() {
  if (!saveTimer) saveTimer = setTimeout(flush, 1200);
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flush();
});

// --- tiny event bus -------------------------------------------------------

const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of [...set]) fn(payload);
}

// --- settings -------------------------------------------------------------

export const settings = state.settings;
export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  save();
  emit('settings', key);
}

/** Picks the joke or the straight version of a string, depending on over-the-shoulder mode. */
export const pick = (joke, legit) => (settings.legit ? legit : joke);

// --- stats ----------------------------------------------------------------

export const stats = state.stats;

export function today() {
  const key = dayKey();
  if (!state.days[key]) state.days[key] = emptyDay();
  return state.days[key];
}

/** Last `count` days, oldest first, as { key, label, ms, taps, swipes }. */
export function recentDays(count = 7) {
  const out = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (count - 1));
  for (let i = 0; i < count; i++) {
    const key = dayKey(cursor);
    out.push({
      key,
      label: cursor.toLocaleDateString('en-US', { weekday: 'narrow' }),
      ...(state.days[key] || emptyDay()),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function bump(name, amount = 1) {
  stats[name] = (stats[name] || 0) + amount;
  const day = today();
  if (name in day) day[name] += amount;
  // The clock ticks every second; writing it to storage every ten is plenty.
  if (name !== 'ms' || stats.ms % 10_000 === 0) save();
  checkAchievements();
}

export function markPlaceSeen(id) {
  if (stats.placesSeen[id]) return;
  stats.placesSeen[id] = 1;
  save();
  checkAchievements();
}

export const metersScrolled = () => stats.scrollPx * PX_TO_METERS;

// --- achievements ---------------------------------------------------------

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Opening Night', desc: 'Your first tap. Very convincing.', test: (s) => s.taps >= 1 },
  { id: 'brow', name: 'Furrowed Brow', desc: 'One full minute of looking busy.', test: (s) => s.ms >= 60_000 },
  {
    id: 'meteo',
    name: 'Amateur Meteorologist',
    desc: 'Refreshed the weather 10 times. It did not change.',
    test: (s) => s.refreshes >= 10,
  },
  { id: 'radar', name: 'Storm Chaser', desc: 'Opened the radar. Squinted at it.', test: (s) => s.radarOpens >= 1 },
  {
    id: 'travel',
    name: 'Frequent Flyer',
    desc: 'Checked 5 situations. Attended none.',
    test: (s) => Object.keys(s.placesSeen).length >= 5,
  },
  { id: 'crunch', name: 'Number Cruncher', desc: '25 calculations. Zero needed.', test: (s) => s.calcs >= 25 },
  {
    id: 'mash',
    name: 'Concert Pianist',
    desc: '500 keys mashed with total confidence.',
    test: (s) => s.mashKeys >= 500,
  },
  { id: 'agent', name: 'Double Agent', desc: 'Switched apps 10 times. Very dynamic.', test: (s) => s.switches >= 10 },
  { id: 'detail', name: 'Fine Print', desc: 'Dragged through a chart like it mattered.', test: (s) => s.scrubs >= 1 },
  {
    id: 'scroll',
    name: 'Marathon',
    desc: 'Scrolled 42.2 meters. Technically a marathon.',
    test: (s) => s.scrollPx * PX_TO_METERS >= 42.2,
  },
  { id: 'nice', name: 'Nice.', desc: 'You know what you calculated.', test: (s) => s.nice >= 1 },
  {
    id: 'texter',
    name: 'Great Communicator',
    desc: '25 texts sent to people who do not exist.',
    test: (s) => s.texts >= 25,
  },
  {
    id: 'motion',
    name: 'Got Motion',
    desc: 'Weather, calculator and texting in one sitting.',
    test: (s) => s.trifecta >= 1,
  },
  {
    id: 'pro',
    name: 'Seasoned Professional',
    desc: 'Thirty minutes of total busyness.',
    test: (s) => s.ms >= 30 * 60_000,
  },
];

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (state.achieved[a.id] || !a.test(stats)) continue;
    state.achieved[a.id] = Date.now();
    save();
    emit('achievement', a);
  }
}

export const RANKS = [
  { under: 60_000, title: 'Understudy' },
  { under: 5 * 60_000, title: 'Convincing Extra' },
  { under: 15 * 60_000, title: 'Manager Between Meetings' },
  { under: 30 * 60_000, title: 'Day Trader, Bad Day' },
  { under: 60 * 60_000, title: 'Air Traffic Controller' },
  { under: Infinity, title: 'Too Busy To Be Disturbed' },
];
export const rank = () => RANKS.find((r) => stats.ms < r.under).title;

// --- one-time hints -------------------------------------------------------

export function firstTime(key) {
  if (state.seen[key]) return false;
  state.seen[key] = 1;
  save();
  return true;
}

export function resetAll() {
  frozen = true;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.location.reload();
}
