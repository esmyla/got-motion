// The stack of cards under the big temperature. Same layout as any weather app;
// the labels and sentences are what change between joke and over-the-shoulder mode.

import { clamp, h } from '../lib/dom.js';
import { ui } from '../lib/icons.js';
import { pick } from '../lib/store.js';
import {
  aqiLevel,
  batteryLevel,
  cardLine,
  DAY_NOTES,
  degrees,
  metricIcon,
  metricLabel,
  moonPhase,
  summaryText,
  trendWord,
  uvLevel,
  visLevel,
} from './forecast.js';
import { wxIcon } from './icons.js';

const UV_GRADIENT = 'linear-gradient(90deg,#54d06a 0%,#f2d53c 28%,#f39b3b 52%,#ef5350 74%,#b667e6 100%)';
const AQI_GRADIENT = 'linear-gradient(90deg,#4cd964 0%,#f7d94c 18%,#ff9f43 36%,#ff5e57 56%,#b55ad6 78%,#8a3350 100%)';

const TEMP_STOPS = [
  [20, [110, 190, 255]],
  [45, [120, 214, 222]],
  [60, [156, 224, 132]],
  [72, [245, 214, 76]],
  [84, [246, 160, 66]],
  [98, [239, 92, 62]],
];

/** A color for a temperature in °F, for the range bars. */
export function tempColor(f) {
  if (f <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1]})`;
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    const [t0, c0] = TEMP_STOPS[i - 1];
    if (f <= t1) {
      const k = (f - t0) / (t1 - t0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k))})`;
    }
  }
  return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1]})`;
}

const DIRECTION_DEGREES = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

const head = (iconMarkup, label) =>
  h('span', { class: 'wx-card-head' }, h('span', { class: 'wx-card-icon', html: iconMarkup }), h('span', { text: label }));

const meter = (fraction, gradient) =>
  h(
    'span',
    { class: 'wx-meter', style: { background: gradient } },
    h('i', { style: { left: `${clamp(fraction, 0.02, 0.98) * 100}%` } }),
  );

const ticks = (fraction, count = 12) =>
  h(
    'span',
    { class: 'wx-ticks', 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) => h('i', { class: i < Math.round(fraction * count) ? 'is-on' : '' })),
  );

function compass(direction, speed) {
  const angle = DIRECTION_DEGREES[direction] ?? 0;
  let marks = '';
  for (let i = 0; i < 36; i++) {
    const major = i % 9 === 0;
    marks += `<line x1="50" y1="${major ? 5 : 7}" x2="50" y2="${major ? 13 : 11}" transform="rotate(${i * 10} 50 50)" stroke="#fff" stroke-opacity="${major ? 0.9 : 0.32}" stroke-width="${major ? 1.800 : 1.100}" stroke-linecap="round"/>`;
  }
  return `<svg class="wx-compass" viewBox="0 0 100 100" aria-hidden="true">
    ${marks}
    <g fill="#fff" font-size="9.500" font-weight="700" text-anchor="middle" opacity=".7">
      <text x="50" y="29.500">N</text><text x="76" y="53.400">E</text><text x="50" y="78">S</text><text x="24" y="53.400">W</text>
    </g>
    <g class="wx-compass-needle" style="--angle:${angle}deg">
      <path d="M50 1.500l5.500 10.500h-11z" fill="#fff"/>
      <line x1="50" y1="11" x2="50" y2="15.500" stroke="#fff" stroke-width="2.400" stroke-linecap="round"/>
      <line x1="50" y1="86" x2="50" y2="91.500" stroke="#fff" stroke-width="2.400" stroke-linecap="round"/>
      <circle cx="50" cy="95" r="3" fill="none" stroke="#fff" stroke-width="2.200"/>
    </g>
    <text x="50" y="52" fill="#fff" font-size="19" font-weight="600" text-anchor="middle">${speed}</text>
    <text x="50" y="62.500" fill="#fff" font-size="8.500" font-weight="600" text-anchor="middle" opacity=".7">mph</text>
  </svg>`;
}

function gauge(inHg, trend) {
  const fraction = clamp((inHg - 29) / 3, 0, 1);
  const angle = -135 + fraction * 270;
  let marks = '';
  for (let i = 0; i <= 44; i++) {
    const a = -135 + (i / 44) * 270;
    const on = i / 44 <= fraction;
    marks += `<line x1="50" y1="6" x2="50" y2="15" transform="rotate(${a.toFixed(1)} 50 50)" stroke="#fff" stroke-opacity="${on ? 0.85 : 0.25}" stroke-width="1.500" stroke-linecap="round"/>`;
  }
  const arrow = trend === 'up' ? 'M50 44v-13M44.500 36.500l5.500-5.500 5.500 5.500' : trend === 'down' ? 'M50 31v13M44.500 38.500l5.500 5.500 5.500-5.500' : 'M43 35h14M43 41h14';
  return `<svg class="wx-gauge" viewBox="0 0 100 100" aria-hidden="true">
    ${marks}
    <line x1="50" y1="2.500" x2="50" y2="18" transform="rotate(${angle.toFixed(1)} 50 50)" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path d="${arrow}" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="62" fill="#fff" font-size="16" font-weight="600" text-anchor="middle">${inHg.toFixed(2)}</text>
    <text x="50" y="73" fill="#fff" font-size="8.500" font-weight="600" text-anchor="middle" opacity=".7">inHg</text>
    <text x="22" y="92" fill="#fff" font-size="8" font-weight="600" text-anchor="middle" opacity=".6">Low</text>
    <text x="78" y="92" fill="#fff" font-size="8" font-weight="600" text-anchor="middle" opacity=".6">High</text>
  </svg>`;
}

/**
 * The sun partway along its arc. `u` runs 0..1 across the whole curve; the stretch above the
 * horizon line is roughly 0.16 to 0.84 (see forecast.sunArc).
 */
function arc(u) {
  const t = clamp(u, 0.03, 0.97);
  const x = 6 + t * 108;
  const y = 27 + 17 * Math.cos(t * Math.PI * 2);
  return `<svg class="wx-arc" viewBox="0 0 120 52" aria-hidden="true" preserveAspectRatio="none">
    <path d="M6 44C30 44 38 10 60 10s30 34 54 34" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2.200" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <line x1="0" y1="36" x2="120" y2="36" stroke="#fff" stroke-opacity=".4" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg><i class="wx-arc-dot" style="left:${((x / 120) * 100).toFixed(1)}%;top:${((y / 52) * 100).toFixed(1)}%"></i>`;
}

function batteryGlyph(percent) {
  const width = clamp((percent / 100) * 40, 2.5, 40);
  const color = percent <= 20 ? '#ff6b5e' : percent <= 40 ? '#ffc94d' : '#6fe39a';
  return `<svg class="wx-battery" viewBox="0 0 56 28" aria-hidden="true">
    <rect x="1.500" y="1.500" width="46" height="25" rx="7.500" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
    <rect x="4.500" y="4.500" width="${width.toFixed(1)}" height="19" rx="4.500" fill="${color}"/>
    <path d="M50.500 9.500v9c2-.600 3.500-2.300 3.500-4.500s-1.500-3.900-3.500-4.500z" fill="#fff" fill-opacity=".55"/>
  </svg>`;
}

let moonCount = 0;
function moonGlyph(percent) {
  // A lit disc with the shadow sliding across it.
  const offset = (percent / 100) * 44;
  const id = `moon-clip-${moonCount++}`;
  return `<svg class="wx-moon" viewBox="0 0 48 48" aria-hidden="true">
    <defs><clipPath id="${id}"><circle cx="24" cy="24" r="21"/></clipPath></defs>
    <circle cx="24" cy="24" r="21" fill="#e9e3cd"/>
    <circle cx="${(24 - offset).toFixed(1)}" cy="24" r="22" fill="#1b2233" fill-opacity=".86" clip-path="url(#${id})"/>
  </svg>`;
}

/**
 * buildCards(place, forecast, { onMetric(key), onRadar(), drawRadarPreview(canvas) }) -> nodes
 */
export function buildCards(place, forecast, { onMetric, onRadar, drawRadarPreview }) {
  const c = place.cards;
  const nodes = [];

  // --- warning banner, where a situation has earned one
  if (place.alert) {
    nodes.push(
      h(
        'div',
        { class: 'wx-card is-wide wx-alert' },
        head(ui.alert, pick('Severe Awkwardness', 'Severe Weather')),
        h('div', { class: 'wx-alert-title', text: pick(place.alert.title, place.alert.legitTitle) }),
        h('p', { class: 'wx-line', text: pick(place.alert.body, place.alert.legitBody) }),
      ),
    );
  }

  // --- hourly
  const strip = h(
    'div',
    { class: 'wx-hours', 'data-hscroll': true },
    forecast.hourly.map((hour) =>
      h(
        'span',
        { class: `wx-hour${hour.event ? ' is-event' : ''}` },
        h('span', { class: 'wx-hour-label', text: hour.label }),
        h(
          'span',
          { class: 'wx-hour-icon' },
          h('span', { html: wxIcon(hour.icon) }),
          hour.pop ? h('span', { class: 'wx-pop', text: `${hour.pop}%` }) : null,
        ),
        h('span', { class: 'wx-hour-temp', text: hour.event || degrees(hour.temp) }),
      ),
    ),
  );
  nodes.push(
    h(
      'div',
      { class: 'wx-card is-wide wx-hourly' },
      h(
        'button',
        { class: 'wx-card-tap', type: 'button', onClick: () => onMetric('temp') },
        h('p', { class: 'wx-summary', text: summaryText(place) }),
      ),
      strip,
    ),
  );

  // --- ten days
  const span = forecast.range.max - forecast.range.min;
  const rows = forecast.daily.map((day, i) => {
    const left = ((day.lo - forecast.range.min) / span) * 100;
    const width = Math.max(((day.hi - day.lo) / span) * 100, 7);
    const note = h('p', { class: 'wx-day-note', text: DAY_NOTES[i], 'data-joke': true });
    const row = h(
      'div',
      { class: 'wx-day-row' },
      h(
        'button',
        {
          class: 'wx-day',
          type: 'button',
          'aria-expanded': 'false',
          onClick: () => {
            const open = !row.classList.contains('is-open');
            row.classList.toggle('is-open', open);
            row.firstElementChild.setAttribute('aria-expanded', String(open));
          },
        },
        h('span', { class: 'wx-day-name', text: day.label }),
        h(
          'span',
          { class: 'wx-day-icon' },
          h('span', { html: wxIcon(day.icon) }),
          day.pop ? h('span', { class: 'wx-pop', text: `${day.pop}%` }) : null,
        ),
        h('span', { class: 'wx-day-lo', text: degrees(day.lo) }),
        h(
          'span',
          { class: 'wx-day-bar' },
          h('i', {
            style: {
              left: `${Math.min(left, 100 - width)}%`,
              width: `${width}%`,
              background: `linear-gradient(90deg, ${tempColor(day.lo)}, ${tempColor(day.hi)})`,
            },
          }),
          i === 0
            ? h('b', { style: { left: `${clamp(((forecast.temp - forecast.range.min) / span) * 100, 2, 98)}%` } })
            : null,
        ),
        h('span', { class: 'wx-day-hi', text: degrees(day.hi) }),
      ),
      note,
    );
    return row;
  });
  nodes.push(h('div', { class: 'wx-card is-wide wx-daily' }, head(ui.calendar, '10-Day Forecast'), rows));

  // --- radar
  const preview = h('canvas', { class: 'wx-radar-canvas' });
  nodes.push(
    h(
      'button',
      { class: 'wx-card is-wide wx-radar-card', type: 'button', onClick: onRadar },
      head(ui.map, pick('Room Radar', 'Precipitation')),
      h('span', { class: 'wx-radar-frame' }, preview, h('i', { class: 'wx-you' })),
      h('span', {
        class: 'wx-line',
        text: pick('Three people are approaching. One has a clipboard.', 'Light rain is approaching from the west.'),
      }),
    ),
  );
  drawRadarPreview(preview);

  // --- air quality
  nodes.push(
    h(
      'button',
      { class: 'wx-card is-wide', type: 'button', onClick: () => onMetric('aqi') },
      head(ui[metricIcon('aqi')], metricLabel('aqi')),
      h('span', { class: 'wx-value-row' }, h('span', { class: 'wx-value', text: String(c.aqi[0]) }), h('span', { class: 'wx-level', text: aqiLevel(c.aqi[0]) })),
      meter(c.aqi[0] / 300, AQI_GRADIENT),
      h('span', { class: 'wx-line', text: cardLine(place, 'aqi', forecast) }),
    ),
  );

  const half = (key, ...body) =>
    h(
      'button',
      { class: `wx-card wx-card-${key}`, type: 'button', onClick: () => onMetric(key) },
      head(ui[metricIcon(key)], metricLabel(key)),
      ...body,
      h('span', { class: 'wx-line', text: cardLine(place, key, forecast) }),
    );

  // --- eye contact / UV
  nodes.push(
    half(
      'eye',
      h('span', { class: 'wx-value', text: String(c.eye[0]) }),
      h('span', { class: 'wx-level', text: uvLevel(c.eye[0]) }),
      meter(c.eye[0] / 11, UV_GRADIENT),
    ),
  );

  // --- polite exit / sunset
  nodes.push(
    half(
      'exit',
      h('span', { class: 'wx-value is-text', text: pick(c.exit[0], forecast.sunsetLabel) }),
      h('span', { class: 'wx-arc-wrap', html: arc(pick(0.66, forecast.sunArc)) }),
    ),
  );

  // --- hot air / wind
  nodes.push(half('air', h('span', { class: 'wx-dial', html: compass(c.air[1], c.air[0]) })));

  // --- small talk / precipitation
  nodes.push(
    half(
      'talk',
      h('span', { class: 'wx-value', text: `${c.talk[0]}%` }),
      h('span', { class: 'wx-level', text: pick('chance this hour', 'chance today') }),
      ticks(c.talk[0] / 100),
    ),
  );

  // --- feels like
  nodes.push(
    half(
      'feels',
      h('span', { class: 'wx-value', text: degrees(c.feels[0]) }),
      h('span', { class: 'wx-level', text: `Actual: ${degrees(forecast.temp)}` }),
    ),
  );

  // --- palm humidity
  nodes.push(half('palm', h('span', { class: 'wx-value', text: `${c.palm[0]}%` }), ticks(c.palm[0] / 100)));

  // --- visibility
  nodes.push(
    half(
      'vis',
      h('span', { class: 'wx-value', text: pick(c.vis[1] || `${c.vis[0]} mi`, `${c.vis[0]} mi`) }),
      h('span', { class: 'wx-level', text: visLevel(c.vis[0]) }),
      ticks(c.vis[0] / 10),
    ),
  );

  // --- pressure
  nodes.push(half('pressure', h('span', { class: 'wx-dial', html: gauge(c.pressure[0], c.pressure[1]) })));

  // --- social battery / moon
  nodes.push(
    h(
      'button',
      { class: 'wx-card is-wide wx-battery-card', type: 'button', onClick: () => onMetric('battery') },
      head(ui[metricIcon('battery')], metricLabel('battery')),
      h(
        'span',
        { class: 'wx-battery-row' },
        h(
          'span',
          { class: 'wx-battery-text' },
          h('span', { class: 'wx-value', text: pick(`${c.battery[0]}%`, moonPhase(c.battery[0])) }),
          h('span', { class: 'wx-level', text: pick(batteryLevel(c.battery[0]), `${trendWord('down')} tonight`) }),
        ),
        h('span', { class: 'wx-battery-art', html: pick(batteryGlyph(c.battery[0]), moonGlyph(c.battery[0])) }),
      ),
      h('span', { class: 'wx-line', text: cardLine(place, 'battery', forecast) }),
    ),
  );

  return nodes;
}
