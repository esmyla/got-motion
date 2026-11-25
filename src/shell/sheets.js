// The three sheets reachable from the home screen: performance report, settings, field guide.

import { segmented, switchRow } from '../lib/controls.js';
import { formatDuration, formatInt, h } from '../lib/dom.js';
import { canVibrate } from '../lib/haptics.js';
import { ui } from '../lib/icons.js';
import { openSheet } from '../lib/sheet.js';
import {
  ACHIEVEMENTS,
  metersScrolled,
  rank,
  recentDays,
  resetAll,
  setSetting,
  settings,
  state,
  stats,
  today,
} from '../lib/store.js';

function distanceRemark(meters) {
  if (meters < 1) return 'Barely a stretch.';
  if (meters < 5.5) return 'Not yet one giraffe.';
  if (meters < 18) return `About ${(meters / 5.5).toFixed(1)} giraffes, stacked.`;
  if (meters < 30) return 'Longer than a bowling lane.';
  if (meters < 42.2) return 'One blue whale, nose to tail.';
  if (meters < 93) return 'A marathon, at 1:1000 scale.';
  if (meters < 300) return 'Taller than the Statue of Liberty.';
  return 'You could have walked somewhere by now.';
}

const statRow = (title, desc, value) =>
  h(
    'div',
    { class: 'row' },
    h('span', { class: 'row-text' }, h('span', { class: 'row-title', text: title }), h('span', { class: 'row-desc', text: desc })),
    h('span', { class: 'stat-value', text: value }),
  );

export function openReport() {
  const day = today();
  const days = recentDays(7);
  const peak = Math.max(60_000, ...days.map((d) => d.ms));
  const meters = metersScrolled();
  const earned = ACHIEVEMENTS.filter((a) => state.achieved[a.id]).length;

  openSheet({
    title: 'Performance Review',
    subtitle: 'A full accounting of time well pretended.',
    className: 'is-tall',
    body: [
      h(
        'div',
        { class: 'perf-hero' },
        h(
          'div',
          null,
          h('div', { class: 'perf-time', text: formatDuration(day.ms) }),
          h('div', { class: 'perf-sub', text: 'spent looking busy today' }),
        ),
        h(
          'div',
          { class: 'report-bars', 'aria-hidden': 'true' },
          days.map((d, i) =>
            h(
              'span',
              { class: `report-bar${i === days.length - 1 ? ' is-today' : ''}` },
              h('i', { style: { height: `${Math.max(5, (d.ms / peak) * 100)}%` } }),
              h('b', { text: d.label }),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'perf-rank' },
        h('span', { html: ui.trophy }),
        h(
          'div',
          null,
          h('div', { class: 'perf-rank-title', text: rank() }),
          h('div', { class: 'perf-rank-sub', text: `Current rank, after ${formatDuration(stats.ms)} in total.` }),
        ),
      ),
      h('p', { class: 'section-label', text: 'Career totals' }),
      h(
        'div',
        { class: 'rows' },
        statRow('Taps', 'Each one deliberate.', formatInt(stats.taps)),
        statRow('Swipes', 'With purpose.', formatInt(stats.swipes)),
        statRow('Distance scrolled', distanceRemark(meters), `${meters < 10 ? meters.toFixed(1) : formatInt(meters)} m`),
        statRow('Weather refreshes', 'Times the weather had changed: 0', formatInt(stats.refreshes)),
        statRow('Calculations', 'Times one was needed: 0', formatInt(stats.calcs)),
        statRow('Texts sent', 'Replies from real people: 0', formatInt(stats.texts || 0)),
        statRow('App switches', 'Nobody busy uses just one.', formatInt(stats.switches)),
      ),
      h('p', { class: 'section-label', text: `Achievements · ${earned} of ${ACHIEVEMENTS.length}` }),
      h(
        'div',
        { class: 'badges' },
        ACHIEVEMENTS.map((a) => {
          const got = Boolean(state.achieved[a.id]);
          return h(
            'div',
            { class: `badge${got ? ' is-earned' : ''}` },
            h('div', { class: 'badge-name' }, got ? h('span', { html: ui.check }) : null, a.name),
            h('div', { class: 'badge-desc', text: a.desc }),
          );
        }),
      ),
      h('p', {
        class: 'sheet-note',
        text: 'Nothing here leaves your phone. There is, to be clear, nothing here.',
      }),
    ],
  });
}

export function openSettings() {
  let armed = false;
  const erase = h('button', {
    class: 'text-button is-danger',
    type: 'button',
    text: 'Erase performance history',
    onClick: () => {
      if (armed) {
        resetAll();
        return;
      }
      armed = true;
      erase.textContent = 'Tap again to erase everything';
      setTimeout(() => {
        armed = false;
        erase.textContent = 'Erase performance history';
      }, 3500);
    },
  });

  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  openSheet({
    title: 'Settings',
    className: 'is-tall',
    body: [
      h(
        'div',
        { class: 'rows' },
        switchRow({
          title: 'Stage directions',
          desc: 'Acting notes that drop in while you perform. “Frown slightly.” That kind of thing.',
          checked: settings.coach,
          onChange: (value) => setSetting('coach', value),
        }),
        switchRow({
          title: 'Over-the-shoulder mode',
          desc: 'Hides every joke so all three apps pass inspection. Hold the bar at the bottom of any app for a second to flip it without looking.',
          checked: settings.legit,
          onChange: (value) => setSetting('legit', value),
        }),
        switchRow({
          title: 'Incoming texts',
          desc: 'People who do not exist text you while you are in Weather or Calculator.',
          checked: settings.alerts !== false,
          onChange: (value) => setSetting('alerts', value),
        }),
        canVibrate
          ? switchRow({
              title: 'Key buzz',
              desc: 'A tiny vibration on each calculator key.',
              checked: settings.haptics,
              onChange: (value) => setSetting('haptics', value),
            })
          : null,
        h(
          'div',
          { class: 'row' },
          h(
            'span',
            { class: 'row-text' },
            h('span', { class: 'row-title', text: 'Temperature' }),
            h('span', { class: 'row-desc', text: 'Switching units is, itself, a way to look busy.' }),
          ),
          segmented(
            [
              { value: 'F', label: '°F' },
              { value: 'C', label: '°C' },
            ],
            settings.unit,
            (value) => setSetting('unit', value),
            { label: 'Temperature unit' },
          ),
        ),
      ),
      h('p', { class: 'section-label', text: 'For the full effect' }),
      h('div', {
        class: 'install',
        html: standalone
          ? 'Installed. It now opens full screen and works with no signal, which is most elevators.'
          : 'Add this to your Home Screen: on iPhone tap <b>Share</b>, then <b>Add to Home Screen</b>. On Android open the browser menu and choose <b>Install app</b>. It then opens full screen and works with no signal, which is most elevators.',
      }),
      h('div', { class: 'sheet-actions' }, erase),
      h('p', { class: 'sheet-note', text: 'Got Motion 0.2. No accounts, no tracking, no actual weather, no actual friends.' }),
    ],
  });
}

const GUIDE = [
  ['Open any app with confidence', 'Hesitation reads as idle. Idle people get talked to.'],
  ['Swipe between locations', 'As though comparing them. You are not going to any of them.'],
  ['Pull down to refresh', 'Nothing will have changed. Refresh again to be sure.'],
  ['Tap any card for a chart', 'Drag a finger along it. This is the busiest a person can look.'],
  ['In the calculator, hit anything', 'Mash mode types impressive numbers for you. Switch to Math if you ever need a real one.'],
  ['In Messages, hit anything', 'Open a conversation and mash the keyboard: a text writes itself and they answer. Switch to Type to say your own piece.'],
  ['Swipe the bottom bar sideways', 'It flips between the three apps. Swipe it up to come back here.'],
  ['If someone reads over your shoulder', 'Hold the bottom bar for one second. Every joke disappears. Hold again to bring them back.'],
  ['Every twenty seconds, exhale through your nose', 'This is what sells it.'],
];

export function openGuide() {
  openSheet({
    title: 'Field Guide',
    subtitle: 'How to look occupied, in nine steps.',
    className: 'is-tall',
    body: h(
      'ol',
      { class: 'guide' },
      GUIDE.map(([title, text]) =>
        h('li', null, h('div', null, h('div', { class: 'guide-title', text: title }), h('div', { class: 'guide-text', text }))),
      ),
    ),
  });
}
