// Tap a card, get a sheet: day tabs, a 24-hour chart you can drag a finger along,
// and a paragraph explaining the metric with a completely straight face.

import { clamp, h } from '../lib/dom.js';
import { tick } from '../lib/haptics.js';
import { openSheet } from '../lib/sheet.js';
import { bump, pick } from '../lib/store.js';
import { coach } from '../shell/coach.js';
import { cardLine, formatValue, metricAbout, metricLabel, placeName, series, summaryText } from './forecast.js';

const W = 230; // chart coordinate space; the SVG stretches to fit
const H = 100;
const SVG_NS = 'http://www.w3.org/2000/svg';
const hourName = (hour) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'AM' : 'PM'}`;

const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};

/** Smooth path through points (Catmull-Rom, drawn as cubic Béziers). */
function smoothPath(points) {
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

const CAPTIONS = {
  exit: ['odds of a clean getaway', 'of peak daylight'],
};

export function openDetail(place, key, forecast) {
  let day = 0;
  let data = series(place, key, day);
  let points = [];
  let scrubbing = false;
  let restoreTimer = 0;

  const readout = h('div', { class: 'detail-value' });
  const caption = h('div', { class: 'detail-caption' });

  const gradientId = `chart-fill-${Math.random().toString(36).slice(2, 8)}`;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'chart-svg', 'aria-hidden': 'true' });
  const defs = svgEl('defs', {});
  const gradient = svgEl('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(
    svgEl('stop', { offset: '0', 'stop-color': '#3ee08f', 'stop-opacity': '0.42' }),
    svgEl('stop', { offset: '1', 'stop-color': '#3ee08f', 'stop-opacity': '0' }),
  );
  defs.append(gradient);
  svg.append(defs);
  for (const y of [20, 50, 80]) {
    svg.append(svgEl('line', { x1: 0, x2: W, y1: y, y2: y, class: 'chart-grid', 'vector-effect': 'non-scaling-stroke' }));
  }
  const area = svgEl('path', { fill: `url(#${gradientId})` });
  const line = svgEl('path', { class: 'chart-line', 'vector-effect': 'non-scaling-stroke' });
  svg.append(area, line);

  const nowDot = h('i', { class: 'chart-now' });
  const cursor = h('div', { class: 'chart-cursor' }, h('i'));
  const yMax = h('span', { class: 'chart-y chart-y-max' });
  const yMin = h('span', { class: 'chart-y chart-y-min' });
  const plot = h('div', { class: 'chart-plot' }, svg, yMax, yMin, nowDot, cursor);
  const axis = h(
    'div',
    { class: 'chart-axis', 'aria-hidden': 'true' },
    ['12AM', '6AM', '12PM', '6PM', ''].map((label) => h('span', { text: label })),
  );

  const tabs = h('div', { class: 'detail-tabs', 'data-hscroll': true });
  const dayButtons = forecast.daily.slice(0, 7).map((d, i) =>
    h('button', {
      type: 'button',
      class: 'detail-tab',
      text: d.label,
      'aria-pressed': String(i === 0),
      onClick: () => {
        if (day === i) return;
        day = i;
        dayButtons.forEach((button, j) => button.setAttribute('aria-pressed', String(j === i)));
        data = series(place, key, day);
        tick();
        draw();
      },
    }),
  );
  tabs.append(...dayButtons);

  const suffix = () => (CAPTIONS[key] ? ` · ${pick(...CAPTIONS[key])}` : '');

  function showResting() {
    const values = data.values;
    if (data.nowIndex >= 0) {
      readout.textContent = formatValue(key, values[data.nowIndex]);
      caption.textContent = `Now${suffix()}`;
    } else {
      const peak = values.indexOf(Math.max(...values));
      readout.textContent = formatValue(key, values[peak]);
      caption.textContent = `Peak at ${hourName(peak)}${suffix()}`;
    }
  }

  function draw() {
    const values = data.values;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.02, 0.05);
    const min = lo - pad;
    const max = hi + pad;
    points = values.map((v, hour) => [(hour / 23) * W, ((max - v) / (max - min)) * H]);
    const d = smoothPath(points);
    line.setAttribute('d', d);
    area.setAttribute('d', `${d}L${W} ${H}L0 ${H}Z`);
    yMax.textContent = formatValue(key, hi);
    yMin.textContent = formatValue(key, lo);
    yMax.style.top = `${(points[values.indexOf(hi)][1] / H) * 100}%`;
    yMin.style.top = `${(points[values.indexOf(lo)][1] / H) * 100}%`;
    yMin.hidden = hi - lo < 1e-9;
    if (data.nowIndex >= 0) {
      nowDot.hidden = false;
      nowDot.style.left = `${(points[data.nowIndex][0] / W) * 100}%`;
      nowDot.style.top = `${(points[data.nowIndex][1] / H) * 100}%`;
    } else {
      nowDot.hidden = true;
    }
    if (!scrubbing) showResting();
  }

  function scrubTo(clientX) {
    const rect = plot.getBoundingClientRect();
    const hour = Math.round(clamp((clientX - rect.left) / rect.width, 0, 1) * 23);
    cursor.style.left = `${(points[hour][0] / W) * 100}%`;
    cursor.firstElementChild.style.top = `${(points[hour][1] / H) * 100}%`;
    readout.textContent = formatValue(key, data.values[hour]);
    caption.textContent = `${hourName(hour)}${suffix()}`;
  }

  // touch-action: pan-y in CSS lets the sheet still scroll vertically; sideways drags are ours.
  let pointer = null;
  plot.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointer = event.pointerId;
    try {
      plot.setPointerCapture(pointer);
    } catch {
      /* already released */
    }
    clearTimeout(restoreTimer);
    if (!scrubbing) {
      scrubbing = true;
      plot.classList.add('is-scrubbing');
      bump('scrubs');
      coach.event('scrub', { chance: 0.4, minGap: 15_000 });
    }
    scrubTo(event.clientX);
  });
  plot.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointer) scrubTo(event.clientX);
  });
  const release = (event) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    restoreTimer = setTimeout(() => {
      scrubbing = false;
      plot.classList.remove('is-scrubbing');
      showResting();
    }, 900);
  };
  plot.addEventListener('pointerup', release);
  plot.addEventListener('pointercancel', release);

  const now = key === 'temp' ? summaryText(place) : cardLine(place, key, forecast);

  openSheet({
    title: metricLabel(key),
    subtitle: placeName(place),
    className: 'is-tall wx-detail',
    onClose: () => clearTimeout(restoreTimer),
    body: [
      tabs,
      h('div', { class: 'detail-readout' }, readout, caption),
      h('div', { class: 'chart', 'data-nodrag': true }, plot, axis),
      h('h3', { class: 'detail-heading', text: pick('Right now', 'Daily Summary') }),
      h('p', { class: 'detail-text', text: now }),
      h('h3', { class: 'detail-heading', text: `About ${metricLabel(key)}` }),
      h('p', { class: 'detail-text', text: metricAbout(key) }),
    ],
  });

  draw();
}
