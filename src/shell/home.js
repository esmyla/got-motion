// The home screen: backstage. The only place the app admits what it is.

import { lastAnswer } from '../calc/calc.js';
import { clamp, formatDuration, formatInt, h } from '../lib/dom.js';
import { ui } from '../lib/icons.js';
import { rank, recentDays, state, today } from '../lib/store.js';
import { buildForecast, degrees, placeCondition, placeName, savedPlaces } from '../weather/forecast.js';
import { skyGradient } from '../weather/situations.js';

export function createHome(el, { onOpen, onReport, onSettings, onGuide }) {
  // Weather tile: a miniature of whatever location was last on screen.
  const wxName = h('span', { class: 'mini-wx-name' });
  const wxTemp = h('span', { class: 'mini-wx-temp' });
  const wxCond = h('span', { class: 'mini-wx-cond' });
  const wxRange = h('span', { class: 'mini-wx-range' });
  const wxArt = h('span', { class: 'tile-art tile-art-weather' }, wxName, wxTemp, wxCond, wxRange);

  // Calculator tile: the last answer above a tiny keypad.
  const calcNumber = h('span', { class: 'mini-calc-number' });
  const keypad = h(
    'span',
    { class: 'mini-calc-keys', 'aria-hidden': 'true' },
    Array.from({ length: 16 }, (_, i) => h('i', { class: i % 4 === 3 ? 'is-op' : i < 3 ? 'is-fn' : '' })),
  );
  const calcArt = h('span', { class: 'tile-art tile-art-calc' }, calcNumber, keypad);

  const tile = (id, art, name, desc) =>
    h(
      'button',
      { class: 'tile', type: 'button', dataset: { app: id }, onClick: () => onOpen(id) },
      art,
      h('span', { class: 'tile-name', text: name }),
      h('span', { class: 'tile-desc', text: desc }),
    );

  // Performance card.
  const reportTime = h('span', { class: 'report-time' });
  const reportBars = h('span', { class: 'report-bars', 'aria-hidden': 'true' });
  const reportCounts = h('span', { class: 'report-counts' });
  const reportRank = h('span', { class: 'report-rank' });

  el.append(
    h(
      'div',
      { class: 'home' },
      h(
        'header',
        { class: 'home-head' },
        h('p', { class: 'home-status' }, h('span', { class: 'home-dot' }), 'Status: appears busy'),
        h('h1', { class: 'home-title' }, 'Got Motion', h('span', { class: 'home-title-dot', 'aria-hidden': 'true' })),
        h('p', {
          class: 'home-tag',
          text: 'Two very important apps for when there is nothing to look at.',
        }),
      ),
      h(
        'div',
        { class: 'home-tiles' },
        tile('weather', wxArt, 'Weather', 'Check conditions you can do nothing about.'),
        tile('calc', calcArt, 'Calculator', 'Perform math nobody asked for.'),
      ),
      h(
        'button',
        { class: 'report', type: 'button', onClick: onReport },
        h('span', { class: 'report-kicker' }, 'Today’s performance', h('span', { class: 'report-chevron', html: ui.chevronRight })),
        h('span', { class: 'report-row' }, h('span', { class: 'report-big' }, reportTime, h('span', { class: 'report-sub', text: 'spent looking busy' })), reportBars),
        h('span', { class: 'report-foot' }, reportCounts, reportRank),
      ),
      h(
        'footer',
        { class: 'home-foot' },
        h('button', { class: 'pill-button', type: 'button', onClick: onGuide }, h('span', { html: ui.book }), 'Field guide'),
        h('button', { class: 'pill-button', type: 'button', onClick: onSettings }, h('span', { html: ui.gear }), 'Settings'),
      ),
    ),
  );

  function refresh() {
    const places = savedPlaces();
    const place = places[clamp(state.weather.index, 0, places.length - 1)];
    const forecast = buildForecast(place);
    wxArt.style.background = skyGradient(place.sky);
    wxName.textContent = placeName(place);
    wxTemp.textContent = degrees(forecast.temp);
    wxCond.textContent = placeCondition(place);
    wxRange.textContent = `H:${degrees(forecast.hi)}  L:${degrees(forecast.lo)}`;

    calcNumber.textContent = lastAnswer();

    const day = today();
    reportTime.textContent = formatDuration(day.ms);
    reportCounts.textContent = `${formatInt(day.taps)} taps · ${formatInt(day.swipes)} swipes`;
    reportRank.textContent = rank();
    const days = recentDays(7);
    const peak = Math.max(60_000, ...days.map((d) => d.ms));
    reportBars.replaceChildren(
      ...days.map((d, i) =>
        h(
          'span',
          { class: `report-bar${i === days.length - 1 ? ' is-today' : ''}` },
          h('i', { style: { height: `${Math.max(6, (d.ms / peak) * 100)}%` } }),
          h('b', { text: d.label }),
        ),
      ),
    );
  }

  refresh();

  return {
    el,
    refresh,
    /** Screen rectangle of an app's tile artwork: where the app zooms from and back to. */
    tileRect: (id) => (id === 'weather' ? wxArt : calcArt).getBoundingClientRect(),
  };
}
