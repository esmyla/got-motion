// The radar. A made-up street map with weather cells drifting across it; pan, pinch, scrub
// the timeline. With the jokes on, every storm cell is a person heading your way.

import { segmented } from '../lib/controls.js';
import { clamp, h, reducedMotion } from '../lib/dom.js';
import { tick } from '../lib/haptics.js';
import { ui } from '../lib/icons.js';
import { seeded } from '../lib/rng.js';
import { registerOverlay } from '../lib/sheet.js';
import { pick, settings } from '../lib/store.js';
import { placeName } from './forecast.js';

const WORLD = 1700; // half-width of the map, in map units. You are at 0,0.
const TAU = Math.PI * 2;

const PEOPLE = [
  'Man explaining crypto',
  'Someone you sort of know',
  'Person with a clipboard',
  'Coworker who “should grab coffee”',
  'Loud laugher',
  'Guy with a guitar',
  'A former classmate',
  'Close talker',
  'Someone filming a video',
  'The host',
  'Group forming a circle',
  'Person who remembers your name',
  'Your landlord',
  'A dog (friendly)',
];

const DIRECTION_ANGLE = { N: -90, NE: -45, E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135 };

// ------------------------------------------------------------------ scene

const scenes = new Map();

function sceneFor(place) {
  if (scenes.has(place.id)) return scenes.get(place.id);
  const r = seeded(`radar:${place.id}`);

  const lines = (step, wobble) => {
    const out = [];
    for (let v = -WORLD; v <= WORLD; v += step) out.push(v + r.range(-wobble, wobble));
    return out;
  };
  const minor = { xs: lines(130, 16), ys: lines(130, 16) };
  const major = { xs: lines(520, 60), ys: lines(520, 60) };
  const avenues = [0, 1].map(() => {
    const angle = r.range(0.25, Math.PI - 0.25);
    const offset = r.range(-700, 700);
    return { angle, offset };
  });

  const riverAngle = r.range(-0.5, 0.5);
  const riverShift = r.pick([-1, 1]) * r.range(520, 900);
  const p1 = r.range(0, TAU);
  const p2 = r.range(0, TAU);
  const river = [];
  for (let x = -WORLD * 1.5; x <= WORLD * 1.5; x += 90) {
    const y = riverShift + Math.sin(x / 430 + p1) * 170 + Math.sin(x / 170 + p2) * 46;
    river.push([x * Math.cos(riverAngle) - y * Math.sin(riverAngle), x * Math.sin(riverAngle) + y * Math.cos(riverAngle)]);
  }

  const parks = Array.from({ length: 8 }, () => ({
    x: r.range(-WORLD, WORLD) * 0.9,
    y: r.range(-WORLD, WORLD) * 0.9,
    w: r.range(120, 330),
    h: r.range(100, 260),
  }));

  const labels = PEOPLE.slice();
  for (let i = labels.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  const cells = labels.slice(0, 6).map((label, i) => {
    const angle = (i / 6) * TAU + r.range(-0.4, 0.4);
    const distance = r.range(430, 1250);
    const aim = angle + Math.PI + r.range(-0.55, 0.55);
    // Fast enough to arrive (or pass) within the hour the timeline covers.
    const speed = distance / r.range(7, 52); // map units per minute
    const size = r.range(140, 290);
    const power = r.range(0.6, 1.1);
    return {
      label,
      x0: Math.cos(angle) * distance,
      y0: Math.sin(angle) * distance,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      size,
      blobs: Array.from({ length: r.int(4, 7) }, () => ({
        dx: r.range(-0.75, 0.75) * size,
        dy: r.range(-0.6, 0.6) * size,
        r: r.range(0.5, 1) * size,
        w: r.range(0.45, 1) * power,
      })),
    };
  });

  const wind = ((DIRECTION_ANGLE[place.cards.air[1]] ?? 0) * Math.PI) / 180;
  const scene = { minor, major, avenues, river, parks, cells, wind, speed: place.cards.air[0] };
  scenes.set(place.id, scene);
  return scene;
}

// ------------------------------------------------------------------ noise

const hash2 = (x, y) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// --------------------------------------------------------------- palettes

function makeLut(stops) {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 1;
    while (k < stops.length - 1 && v > stops[k][0]) k++;
    const [v0, c0] = stops[k - 1];
    const [v1, c1] = stops[k];
    const t = clamp((v - v0) / (v1 - v0 || 1), 0, 1);
    for (let j = 0; j < 4; j++) lut[i * 4 + j] = c0[j] + (c1[j] - c0[j]) * t;
  }
  return lut;
}

const LUTS = {
  rain: makeLut([
    [0, [70, 190, 120, 0]],
    [0.1, [70, 190, 120, 0]],
    [0.17, [72, 196, 124, 150]],
    [0.3, [40, 165, 86, 188]],
    [0.44, [30, 126, 62, 208]],
    [0.56, [238, 220, 70, 222]],
    [0.7, [245, 150, 50, 232]],
    [0.84, [228, 62, 52, 238]],
    [1, [190, 64, 192, 244]],
  ]),
  heat: makeLut([
    [0, [58, 104, 228, 112]],
    [0.28, [56, 184, 204, 112]],
    [0.46, [112, 206, 116, 118]],
    [0.62, [240, 212, 72, 130]],
    [0.8, [245, 142, 52, 148]],
    [1, [226, 62, 52, 166]],
  ]),
  faint: makeLut([
    [0, [255, 255, 255, 0]],
    [0.14, [255, 255, 255, 0]],
    [0.5, [200, 230, 255, 46]],
    [1, [220, 240, 255, 96]],
  ]),
};

// -------------------------------------------------------------- rendering

function drawMap(ctx, scene, view, w, h) {
  ctx.fillStyle = '#18202c';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.x, -view.y);

  ctx.fillStyle = '#1b3a31';
  for (const p of scene.parks) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, TAU);
    ctx.fill();
  }

  const path = (points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#132b47';
  ctx.lineWidth = 120;
  path(scene.river);
  ctx.stroke();
  ctx.strokeStyle = '#16335a';
  ctx.lineWidth = 70;
  ctx.stroke();

  const grid = (set, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const x of set.xs) {
      ctx.moveTo(x, -WORLD * 1.4);
      ctx.lineTo(x, WORLD * 1.4);
    }
    for (const y of set.ys) {
      ctx.moveTo(-WORLD * 1.4, y);
      ctx.lineTo(WORLD * 1.4, y);
    }
    ctx.stroke();
  };
  // Side streets disappear when zoomed far out, the way they do on a real map.
  if (view.scale > 0.2) grid(scene.minor, '#232d3c', Math.max(3, 1.2 / view.scale));
  grid(scene.major, '#2f3b4f', Math.max(8, 2 / view.scale));
  ctx.strokeStyle = '#374660';
  ctx.lineWidth = Math.max(10, 2.4 / view.scale);
  ctx.beginPath();
  for (const a of scene.avenues) {
    const nx = Math.cos(a.angle + Math.PI / 2) * a.offset;
    const ny = Math.sin(a.angle + Math.PI / 2) * a.offset;
    ctx.moveTo(nx - Math.cos(a.angle) * WORLD * 2.2, ny - Math.sin(a.angle) * WORLD * 2.2);
    ctx.lineTo(nx + Math.cos(a.angle) * WORLD * 2.2, ny + Math.sin(a.angle) * WORLD * 2.2);
  }
  ctx.stroke();

  // Range rings around you.
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.2 / view.scale;
  ctx.setLineDash([7 / view.scale, 7 / view.scale]);
  for (const radius of [300, 600, 900]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** Fills a low-resolution buffer with the weather field and stretches it over the map. */
function drawField(ctx, scene, view, w, h, minutes, layer, buffer, cell) {
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  if (buffer.canvas.width !== cols || buffer.canvas.height !== rows) {
    buffer.canvas.width = cols;
    buffer.canvas.height = rows;
    buffer.image = buffer.ctx.createImageData(cols, rows);
  }
  const data = buffer.image.data;

  // Flatten every blob to its position at this minute.
  const blobs = [];
  for (const c of scene.cells) {
    const cx = c.x0 + c.vx * minutes;
    const cy = c.y0 + c.vy * minutes;
    for (const b of c.blobs) blobs.push(cx + b.dx, cy + b.dy, b.r * b.r, b.w);
  }

  const lut = layer === 'heat' ? LUTS.heat : layer === 'wind' ? LUTS.faint : LUTS.rain;
  const step = cell / view.scale;
  const left = view.x - w / 2 / view.scale + step / 2;
  const top = view.y - h / 2 / view.scale + step / 2;
  const drift = minutes * 0.9;
  let p = 0;
  for (let row = 0; row < rows; row++) {
    const wy = top + row * step;
    for (let col = 0; col < cols; col++) {
      const wx = left + col * step;
      let sum = 0;
      for (let i = 0; i < blobs.length; i += 4) {
        const dx = wx - blobs[i];
        const dy = wy - blobs[i + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 < blobs[i + 2]) {
          const k = 1 - d2 / blobs[i + 2];
          sum += blobs[i + 3] * k * k;
        }
      }
      sum *= 0.5; // most of a cell reads green and yellow; only the core goes red
      let value;
      if (layer === 'heat') {
        value = 0.26 + noise2(wx / 520 + 3.1, wy / 520 - drift / 300) * 0.34 + sum * 0.8;
      } else {
        const grain = noise2((wx + drift * 6) / 95, wy / 95);
        value = sum * (0.66 + grain * 0.7) - (1 - grain) * 0.05;
      }
      const index = (value <= 0 ? 0 : value >= 1 ? 255 : (value * 255) | 0) * 4;
      data[p++] = lut[index];
      data[p++] = lut[index + 1];
      data[p++] = lut[index + 2];
      data[p++] = lut[index + 3];
    }
  }
  buffer.ctx.putImageData(buffer.image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(buffer.canvas, 0, 0, cols, rows, 0, 0, cols * cell, rows * cell);
}

const makeBuffer = () => {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d'), image: null };
};

/** Static picture for the card on the weather page. */
export function drawRadarPreview(canvas, place) {
  const w = 680;
  const hgt = 300;
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  const scene = sceneFor(place);
  const view = { x: 0, y: 0, scale: 0.36 };
  drawMap(ctx, scene, view, w, hgt);
  drawField(ctx, scene, view, w, hgt, 0, 'rain', makeBuffer(), 8);
}

// ------------------------------------------------------------ full screen

function cellStatus(cell, minutes) {
  const speed2 = cell.vx * cell.vx + cell.vy * cell.vy;
  const closest = -(cell.x0 * cell.vx + cell.y0 * cell.vy) / speed2;
  const missBy = Math.hypot(cell.x0 + cell.vx * closest, cell.y0 + cell.vy * closest);
  const reaches = missBy < cell.size * 0.95;
  const remaining = Math.round(closest - minutes);
  if (remaining > 0) return reaches ? `arrives in ${remaining} min` : `passes by in ${remaining} min`;
  if (reaches && remaining > -7) return 'has arrived. Act natural.';
  return 'moving away';
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function openRadar(place) {
  const scene = sceneFor(place);
  const host = document.getElementById('overlays');
  const canvas = h('canvas', { class: 'radar-canvas' });
  const you = h('i', { class: 'radar-you' });
  const timeLabel = h('span', { class: 'radar-time' });
  const slider = h('input', {
    class: 'radar-slider',
    type: 'range',
    min: '-60',
    max: '60',
    step: '1',
    value: '0',
    'aria-label': 'Timeline',
  });
  const playButton = h('button', { class: 'radar-play', type: 'button', 'aria-label': 'Play', html: ui.play });

  let layer = 'rain';
  const layers = segmented(
    [
      { value: 'rain', label: pick('Small talk', 'Rain') },
      { value: 'heat', label: pick('Eye contact', 'Temp') },
      { value: 'wind', label: pick('Hot air', 'Wind') },
    ],
    layer,
    (next) => {
      layer = next;
      legendLow.textContent = LEGEND[next][0];
      legendHigh.textContent = LEGEND[next][1];
      legendBar.dataset.layer = next;
      invalidate();
    },
    { label: 'Map layer' },
  );

  const LEGEND = {
    rain: pick(['Chatty', 'Cornered'], ['Light', 'Extreme']),
    heat: pick(['Ignored', 'Stared at'], ['Cool', 'Hot']),
    wind: pick(['Mumble', 'Monologue'], ['Calm', 'Strong']),
  };
  const legendLow = h('span', { text: LEGEND.rain[0] });
  const legendHigh = h('span', { text: LEGEND.rain[1] });
  const legendBar = h('i', { class: 'radar-legend-bar', dataset: { layer: 'rain' } });

  const el = h(
    'div',
    { class: 'radar', role: 'dialog', 'aria-modal': 'true', 'aria-label': pick('Room radar', 'Radar map') },
    canvas,
    you,
    h(
      'div',
      { class: 'radar-top' },
      h('button', { class: 'radar-pill', type: 'button', text: 'Done', onClick: () => close() }),
      h(
        'div',
        { class: 'radar-title' },
        h('strong', { text: pick('Room Radar', 'Precipitation') }),
        h('span', { text: placeName(place) }),
      ),
      h('button', {
        class: 'radar-pill is-icon',
        type: 'button',
        'aria-label': 'Center on me',
        html: ui.locate,
        onClick: () => flyTo(0, 0, home.scale),
      }),
    ),
    h('div', { class: 'radar-layers' }, layers),
    h(
      'div',
      { class: 'radar-bottom' },
      h('div', { class: 'radar-legend' }, legendLow, legendBar, legendHigh),
      h('div', { class: 'radar-timeline' }, playButton, slider, timeLabel),
    ),
  );
  host.append(el);

  const ctx = canvas.getContext('2d');
  const buffer = makeBuffer();
  let w = 0;
  let hgt = 0;
  const view = { x: 0, y: 0, scale: 0.25 };
  const home = { scale: 0.25 };
  let minutes = 0;
  let playing = false;
  let dirty = true;
  let frame = 0;
  let last = 0;
  let alive = true;
  let fly = null;
  const inertia = { vx: 0, vy: 0 };
  const particles = [];

  const invalidate = () => {
    dirty = true;
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const first = !w;
    w = rect.width;
    hgt = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    home.scale = w / 1500;
    if (first) view.scale = home.scale;
    invalidate();
  }

  const minScale = () => Math.max(w, hgt) / (WORLD * 2.6);
  const toScreen = (x, y) => [(x - view.x) * view.scale + w / 2, (y - view.y) * view.scale + hgt / 2];

  function clampView() {
    view.scale = clamp(view.scale, minScale(), 3.6);
    view.x = clamp(view.x, -WORLD * 0.9, WORLD * 0.9);
    view.y = clamp(view.y, -WORLD * 0.9, WORLD * 0.9);
  }

  function zoomAt(sx, sy, factor) {
    const before = view.scale;
    view.scale = clamp(view.scale * factor, minScale(), 3.6);
    const k = 1 / before - 1 / view.scale;
    view.x += (sx - w / 2) * k;
    view.y += (sy - hgt / 2) * k;
    clampView();
    invalidate();
  }

  function flyTo(x, y, scale) {
    fly = { x0: view.x, y0: view.y, s0: view.scale, x, y, scale, t: 0 };
    tick();
  }

  function setMinutes(value) {
    minutes = clamp(value, -60, 60);
    const rounded = Math.round(minutes);
    slider.value = String(rounded);
    const at = new Date(Date.now() + rounded * 60_000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    timeLabel.textContent = rounded === 0 ? 'Now' : at;
    invalidate();
  }

  function setPlaying(next) {
    playing = next;
    playButton.innerHTML = next ? ui.pause : ui.play;
    playButton.setAttribute('aria-label', next ? 'Pause' : 'Play');
  }

  function drawLabels() {
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    for (const cell of scene.cells) {
      const [sx, sy] = toScreen(cell.x0 + cell.vx * minutes, cell.y0 + cell.vy * minutes);
      if (sx < -60 || sx > w + 60 || sy < 150 || sy > hgt - 110) continue;
      const status = cellStatus(cell, minutes);
      const width = Math.max(ctx.measureText(cell.label).width, ctx.measureText(status).width) + 20;
      const x = clamp(sx - width / 2, 8, w - width - 8);
      const y = sy - 62; // sits above the cell, so its core stays visible
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, y + 40);
      ctx.lineTo(sx, sy - 5);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(12,16,24,0.82)';
      roundedRect(ctx, x, y, width, 40, 11);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(cell.label, x + 10, y + 13);
      ctx.fillStyle = 'rgba(255,255,255,0.66)';
      ctx.fillText(status, x + 10, y + 28);
    }
  }

  function drawWind(dt) {
    const want = 110;
    const halfW = w / 2 / view.scale;
    const halfH = hgt / 2 / view.scale;
    while (particles.length < want) {
      particles.push({ x: view.x + (Math.random() * 2 - 1) * halfW, y: view.y + (Math.random() * 2 - 1) * halfH, life: Math.random() * 2.2 });
    }
    ctx.strokeStyle = 'rgba(225,244,255,0.75)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const pace = (60 + scene.speed * 9) / Math.sqrt(view.scale * 4);
    for (const p of particles) {
      const bend = (noise2(p.x / 380, p.y / 380) - 0.5) * 2.2;
      const angle = scene.wind + bend;
      const nx = p.x + Math.cos(angle) * pace * dt;
      const ny = p.y + Math.sin(angle) * pace * dt;
      const [x1, y1] = toScreen(p.x, p.y);
      const [x2, y2] = toScreen(nx + Math.cos(angle) * 14 / view.scale, ny + Math.sin(angle) * 14 / view.scale);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      p.x = nx;
      p.y = ny;
      p.life -= dt;
      if (p.life <= 0 || Math.abs(p.x - view.x) > halfW * 1.1 || Math.abs(p.y - view.y) > halfH * 1.1) {
        p.x = view.x + (Math.random() * 2 - 1) * halfW;
        p.y = view.y + (Math.random() * 2 - 1) * halfH;
        p.life = 1 + Math.random() * 1.8;
      }
    }
    ctx.stroke();
  }

  function render(dt) {
    drawMap(ctx, scene, view, w, hgt);
    drawField(ctx, scene, view, w, hgt, minutes, layer, buffer, 5);
    if (layer === 'wind') drawWind(dt);
    if (!settings.legit) drawLabels();
    const [yx, yy] = toScreen(0, 0);
    you.style.transform = `translate(${yx}px, ${yy}px)`;
  }

  function loop(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (playing) setMinutes(minutes >= 60 ? -60 : minutes + dt * 14);
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 0.36);
      const e = 1 - (1 - fly.t) ** 3;
      view.x = fly.x0 + (fly.x - fly.x0) * e;
      view.y = fly.y0 + (fly.y - fly.y0) * e;
      view.scale = fly.s0 * (fly.scale / fly.s0) ** e;
      if (fly.t >= 1) fly = null;
      invalidate();
    }
    if (Math.abs(inertia.vx) > 4 || Math.abs(inertia.vy) > 4) {
      view.x -= (inertia.vx * dt) / view.scale;
      view.y -= (inertia.vy * dt) / view.scale;
      inertia.vx *= 0.92;
      inertia.vy *= 0.92;
      clampView();
      invalidate();
    }
    if (w && (dirty || layer === 'wind')) {
      dirty = false;
      render(dt);
    }
    frame = requestAnimationFrame(loop);
  }

  // ---- gestures: one finger pans, two pinch, double tap zooms in
  const pointers = new Map();
  let lastTap = { t: 0, x: 0, y: 0 };
  let moved = 0;
  let downAt = 0;
  let pinch = null;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already gone */
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, t: event.timeStamp, vx: 0, vy: 0 });
    inertia.vx = inertia.vy = 0;
    fly = null;
    moved = 0;
    downAt = event.timeStamp;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    const dt = Math.max(1, event.timeStamp - p.t);
    p.vx = p.vx * 0.5 + (dx / dt) * 500;
    p.vy = p.vy * 0.5 + (dy / dt) * 500;
    p.x = event.clientX;
    p.y = event.clientY;
    p.t = event.timeStamp;
    moved += Math.abs(dx) + Math.abs(dy);
    const rect = canvas.getBoundingClientRect();
    if (pointers.size === 1) {
      view.x -= dx / view.scale;
      view.y -= dy / view.scale;
      clampView();
      invalidate();
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      // Each finger moves the map by half its own travel, so the midpoint stays under the fingers.
      view.x -= dx / 2 / view.scale;
      view.y -= dy / 2 / view.scale;
      zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, distance / pinch.distance);
      pinch.distance = distance;
    }
  });

  const pointerEnd = (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    pointers.delete(event.pointerId);
    pinch = null;
    if (pointers.size) return;
    const rect = canvas.getBoundingClientRect();
    const tap = moved < 8 && event.timeStamp - downAt < 300;
    if (tap) {
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (event.timeStamp - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
        const target = clamp(view.scale * 1.8, minScale(), 3.6);
        const k = 1 / view.scale - 1 / target;
        flyTo(view.x + (x - w / 2) * k, view.y + (y - hgt / 2) * k, target);
        lastTap = { t: 0, x: 0, y: 0 };
      } else {
        lastTap = { t: event.timeStamp, x, y };
      }
    } else if (event.timeStamp - p.t < 80 && event.type !== 'pointercancel') {
      inertia.vx = p.vx;
      inertia.vy = p.vy;
    }
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0016));
    },
    { passive: false },
  );

  slider.addEventListener('input', () => {
    setPlaying(false);
    setMinutes(Number(slider.value));
  });
  playButton.addEventListener('click', () => {
    setPlaying(!playing);
    tick();
  });

  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  let unregister = () => {};
  function close(instant = false) {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
    unregister();
    el.classList.remove('is-open');
    if (instant) el.remove();
    else setTimeout(() => el.remove(), 300);
  }
  unregister = registerOverlay(close);

  setMinutes(0);
  requestAnimationFrame(() => {
    resize();
    el.classList.add('is-open');
    last = performance.now();
    if (reducedMotion()) render(0);
    frame = requestAnimationFrame(loop);
  });
}
