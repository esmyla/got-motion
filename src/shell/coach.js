// The Director: drops in like a notification with stage directions for looking busier.
// Also announces achievements. Entirely silent in over-the-shoulder mode.

import { h } from '../lib/dom.js';
import { drag } from '../lib/gestures.js';
import { shuffleBag, random } from '../lib/rng.js';
import { on, settings } from '../lib/store.js';

const LINES = {
  general: [
    'Frown slightly. Good. Hold it.',
    'Nod once, slowly, as if this confirms something.',
    'Exhale through your nose. You have seen numbers like this before.',
    'Glance up, then back down. You are needed here.',
    'Tilt the phone five degrees. Very technical.',
    'Mouth the word “interesting.”',
    'Pinch the bridge of your nose. Tough day in the data.',
    'Raise one eyebrow. Only one.',
    'Shake your head a little. Unbelievable. (It is nothing.)',
    'Check your wrist. There is no watch. Does not matter.',
    'Bring the phone two inches closer. Squint.',
    'Whisper “okay, okay” to no one.',
  ],
  weather: [
    'Scroll down like the answer is further down.',
    'Swipe to another location. Compare them. You are going to neither.',
    'Pull down to refresh. Conditions may have developed.',
    'Open the radar. Zoom in on nothing in particular.',
    'Tap a number. Any number. Demand details.',
    'Say “huh” quietly at the humidity.',
    'Scroll the hourly forecast all the way right. Then back. Thorough.',
    'Tap the sky. Sometimes it does something.',
  ],
  calc: [
    'Type faster. The deadline is imaginary but pressing.',
    'Pause. Look at the ceiling. Carry the one.',
    'Clear everything and start over. Perfectionist.',
    'Count something on your fingers, then enter it.',
    'Hit equals with authority.',
    'Open the tape. Review your work. Impeccable.',
    'Swipe the number to delete a digit. Precision matters.',
    'Open the extra functions. Press “sin.” Nobody will ask.',
  ],
  chat: [
    'Type with both thumbs. Urgency.',
    'Smile slightly at the screen. Someone said something.',
    'Sigh, then type faster.',
    'Stop. Delete all of it. Start again.',
    'Laugh once through your nose, then reply.',
    'Look up, think, look down, send.',
    'Check another conversation. You are in demand.',
    'Hold the phone closer. This one is private.',
  ],
  sent: ['Sent. Now watch the screen like it owes you something.', 'Good. Put the phone down. Pick it straight back up.'],
  idle: [
    'You have stopped moving. Statues attract conversation.',
    'No input for twelve seconds. People are starting to look.',
    'Do something. Anything. Tap something.',
    'A still thumb is a guilty thumb.',
    'You are just holding a phone now. Swipe.',
  ],
  refresh: [
    'Refreshed. Nothing changed. Refresh again to be sure.',
    'Up to the second. You are practically on the news.',
    'Good. Now stare at it like it is bad news.',
  ],
  switch: [
    'Switching apps. Nobody busy uses just one.',
    'Cross-referencing. Very thorough.',
    'Back and forth. Classic multitasker.',
  ],
  radar: ['Radar open. Squint. Trace a storm with one finger.', 'Pinch to zoom. Zoom back out. Nod.'],
  scrub: ['Dragging through the data. Peak performance.', 'Hold on one point. Consider it. Move on.'],
  place: [
    'Checking another place you will never visit.',
    'Thorough. A lesser person would check one location.',
  ],
  equals: ['Strong finish. Now look mildly disappointed by the result.', 'Write that down. (Do not write that down.)'],
  jokesBack: ['Jokes restored. The coast is clear.'],
};

const bags = Object.fromEntries(Object.entries(LINES).map(([key, lines]) => [key, shuffleBag(lines)]));

const host = () => document.getElementById('banners');

let current = null;
let pending = null;
let lastShownAt = 0;
let lastInputAt = Date.now();
let nudged = 0;
let context = null;
let nextAmbientGap = 26_000;
let quietUntil = 0;

function dismiss(banner = current) {
  if (!banner) return;
  clearTimeout(banner.timer);
  banner.el.classList.remove('is-in');
  setTimeout(() => banner.el.remove(), 420);
  if (current === banner) current = null;
  if (pending) {
    const next = pending;
    pending = null;
    setTimeout(() => show(next), 380);
  }
}

function show(options) {
  if (current) {
    // One banner at a time. Awards wait their turn; coach lines are simply dropped.
    if (options.kind === 'award' || options.keep) pending = options;
    return;
  }
  const { label = 'Stage direction', text, sub, kind = 'coach', ms = 4600, onTap } = options;
  const el = h(
    'button',
    { class: 'banner', type: 'button', dataset: { kind }, 'aria-label': `${label}: ${text}` },
    h('div', { class: 'banner-top' }, h('span', { text: label }), h('time', { text: 'now' })),
    h('div', { class: 'banner-text', text }),
    sub ? h('div', { class: 'banner-sub', text: sub }) : null,
  );
  const banner = { el, timer: 0 };
  host().append(el);
  current = banner;
  lastShownAt = Date.now();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  banner.timer = setTimeout(() => dismiss(banner), ms);

  drag(el, {
    onMove: ({ dy }) => {
      el.style.transition = 'none';
      el.style.transform = `translateY(${Math.min(0, dy)}px)`;
    },
    onEnd: ({ dy }) => {
      el.style.transition = '';
      el.style.transform = '';
      const tapped = Math.abs(dy) < 6;
      if (dy < -14 || tapped) dismiss(banner);
      if (tapped) onTap?.();
    },
  });
}

const muted = () => settings.legit || !settings.coach;

export const coach = {
  /** A stage direction for something that just happened. Rate limited so it never nags. */
  event(name, { chance = 0.35, minGap = 9000, force = false } = {}) {
    if (muted() || !bags[name]) return;
    if (!force && (Date.now() - lastShownAt < minGap || !random.chance(chance))) return;
    show({ text: bags[name]() });
  },

  /** A one-off practical hint (how to exit, what mash mode is). Shown even with the coach off. */
  tip(text, { ms = 6200 } = {}) {
    if (settings.legit) return;
    show({ label: 'Tip', text, ms, keep: true });
  },

  /**
   * A notification that belongs to the cover story, such as an incoming text. Unlike stage
   * directions it still shows in over-the-shoulder mode. Tapping it runs `onTap`.
   */
  notify({ label, text, onTap, ms = 4200, keep = false }) {
    // `keep` queues it behind whatever banner is showing instead of dropping it.
    show({ label, text, kind: 'message', ms, onTap, keep });
  },

  /** Which fake app is on screen ('weather' | 'calc' | 'chat'), or null on the home screen. */
  setContext(next) {
    context = next;
    lastInputAt = Date.now();
    nudged = 0;
    // Let someone settle in before the first unprompted note.
    quietUntil = Date.now() + 16_000;
    if (!next && current && current.el.dataset.kind === 'coach') dismiss();
  },

  /** Call on every tap, swipe or scroll. */
  activity() {
    lastInputAt = Date.now();
    nudged = 0;
  },

  clear() {
    pending = null;
    dismiss();
  },
};

setInterval(() => {
  if (!context || document.hidden || muted() || current) return;
  const now = Date.now();
  const idleFor = now - lastInputAt;
  if (idleFor > 12_000 + nudged * 16_000 && nudged < 3) {
    nudged += 1;
    show({ text: bags.idle() });
    return;
  }
  if (idleFor < 5000 && now > quietUntil && now - lastShownAt > nextAmbientGap) {
    nextAmbientGap = random.range(22_000, 34_000);
    show({ text: random.chance(0.55) ? bags[context]() : bags.general() });
  }
}, 1000);

on('achievement', (achievement) => {
  if (settings.legit) return;
  show({ label: 'Achievement unlocked', text: achievement.name, sub: achievement.desc, kind: 'award', ms: 5400 });
});

on('settings', (key) => {
  if (key === 'legit' && settings.legit) coach.clear();
});
