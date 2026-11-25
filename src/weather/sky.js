// The moving part of the sky: rain, snow, drifting cloud, stars, lightning.
// The gradient itself is plain CSS behind this canvas; this only draws what moves.

import { clamp, reducedMotion } from '../lib/dom.js';

const TAU = Math.PI * 2;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** A soft round sprite, drawn once and reused for every cloud puff and glow. */
function makeBlob(rgb, size = 128) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const c = sprite.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.45, `rgba(${rgb},0.55)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return sprite;
}

const sprites = {};
const blob = (rgb) => (sprites[rgb] ||= makeBlob(rgb));

// Each layer: make(w, h, options) -> state, then draw(ctx, state, env) every frame.
// env = { w, h, dt, t, gust, alpha }
const LAYERS = {
  clouds: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, () => ({
        x: rand(-0.2, 1.1) * w,
        y: rand(0.02, o.low ? 0.75 : 0.5) * h,
        r: rand(0.45, 0.95) * w,
        v: rand(4, 11) * (o.speed || 1),
        a: rand(0.6, 1) * o.alpha,
      })),
    draw(ctx, puffs, env, o) {
      const sprite = blob(o.dark ? '20,24,36' : '255,255,255');
      for (const p of puffs) {
        p.x += (p.v + env.gust * 160) * env.dt;
        if (p.x - p.r > env.w) p.x = -p.r;
        ctx.globalAlpha = env.alpha * p.a;
        ctx.drawImage(sprite, p.x - p.r, p.y - p.r * 0.32, p.r * 2, p.r * 0.64);
      }
    },
  },

  bands: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, (_, i) => ({
        x: rand(-0.5, 0.8) * w,
        y: ((i + 0.6) / o.count) * h * 0.9,
        r: rand(0.9, 1.5) * w,
        v: rand(5, 13) * (i % 2 ? 1 : -1),
        a: rand(0.5, 1) * o.alpha,
      })),
    draw(ctx, bands, env) {
      const sprite = blob('255,255,255');
      for (const b of bands) {
        b.x += (b.v + env.gust * 120) * env.dt;
        if (b.x - b.r > env.w) b.x = -b.r;
        if (b.x + b.r < 0) b.x = env.w + b.r;
        ctx.globalAlpha = env.alpha * b.a;
        ctx.drawImage(sprite, b.x - b.r, b.y - b.r * 0.14, b.r * 2, b.r * 0.28);
      }
    },
  },

  rain: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, () => ({
        x: rand(-0.2, 1.2) * w,
        y: rand(0, 1) * h,
        len: rand(10, 22) * (o.speed / 900),
        v: rand(0.8, 1.2) * o.speed,
        a: rand(0.4, 1),
      })),
    draw(ctx, drops, env, o) {
      const slant = o.slant + env.gust * 0.5;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      for (const d of drops) {
        d.y += d.v * env.dt;
        d.x += d.v * slant * env.dt;
        if (d.y > env.h + 20) {
          d.y = -20;
          d.x = rand(-0.3, 1.1) * env.w;
        }
        ctx.globalAlpha = env.alpha * o.alpha * d.a;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * slant, d.y - d.len);
        ctx.stroke();
      }
    },
  },

  snow: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, () => ({
        x: rand(0, 1) * w,
        y: rand(0, 1) * h,
        r: rand(1, 3.2),
        v: rand(22, 60),
        phase: rand(0, TAU),
      })),
    draw(ctx, flakes, env) {
      ctx.fillStyle = '#fff';
      for (const f of flakes) {
        f.y += f.v * env.dt;
        f.x += (Math.sin(env.t * 0.9 + f.phase) * 14 + env.gust * 260) * env.dt;
        if (f.y > env.h + 6) {
          f.y = -6;
          f.x = rand(0, 1) * env.w;
        }
        if (f.x > env.w + 6) f.x = -6;
        ctx.globalAlpha = env.alpha * clamp(f.r / 3.4, 0.35, 0.9);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.fill();
      }
    },
  },

  stars: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, () => ({
        x: rand(0, 1) * w,
        y: rand(0, 0.72) * h,
        r: rand(0.5, 1.5),
        speed: rand(0.6, 2.2),
        phase: rand(0, TAU),
      })),
    draw(ctx, stars, env) {
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        const fade = 1 - s.y / (env.h * 0.78);
        ctx.globalAlpha = env.alpha * fade * (0.45 + 0.4 * Math.sin(env.t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
    },
  },

  // Out-of-focus string lights, for the party.
  bokeh: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, (_, i) => ({
        x: rand(0, 1) * w,
        y: rand(0.05, 0.6) * h,
        r: rand(26, 70),
        vx: rand(-6, 6),
        phase: rand(0, TAU),
        rgb: ['255,170,120', '255,120,190', '170,140,255', '255,215,130'][i % 4],
      })),
    draw(ctx, lights, env) {
      for (const l of lights) {
        l.x += (l.vx + env.gust * 30) * env.dt;
        if (l.x - l.r > env.w) l.x = -l.r;
        if (l.x + l.r < 0) l.x = env.w + l.r;
        ctx.globalAlpha = env.alpha * (0.1 + 0.07 * Math.sin(env.t * 0.7 + l.phase));
        ctx.drawImage(blob(l.rgb), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
    },
  },

  sun: {
    make: () => ({ pulse: 0 }),
    draw(ctx, state, env, o) {
      state.pulse = Math.max(0, state.pulse - env.dt * 1.4, env.gust);
      const x = o.x * env.w;
      const y = o.y * env.h;
      const r = o.r * env.w * (1 + state.pulse * 0.14);
      ctx.globalAlpha = env.alpha * (0.5 + state.pulse * 0.2);
      ctx.drawImage(blob(o.rgb), x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = env.alpha * 0.85;
      ctx.drawImage(blob(o.rgb), x - r * 0.28, y - r * 0.28, r * 0.56, r * 0.56);
      if (!o.rays) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(env.t * 0.035);
      ctx.fillStyle = `rgb(${o.rgb})`;
      for (let i = 0; i < 10; i++) {
        ctx.rotate(TAU / 10);
        ctx.globalAlpha = env.alpha * (i % 2 ? 0.035 : 0.06);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 2.4, -r * 0.2);
        ctx.lineTo(r * 2.4, r * 0.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  },

  moon: {
    make: () => ({}),
    draw(ctx, _state, env, o) {
      const x = o.x * env.w;
      const y = o.y * env.h;
      ctx.globalAlpha = env.alpha * 0.35;
      ctx.drawImage(blob('214,224,255'), x - 90, y - 90, 180, 180);
      ctx.globalAlpha = env.alpha * 0.95;
      ctx.fillStyle = '#f3ecd4';
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = env.alpha * 0.1;
      ctx.fillStyle = '#6d6a80';
      ctx.beginPath();
      ctx.arc(x - 5, y - 4, 4, 0, TAU);
      ctx.arc(x + 6, y + 5, 3, 0, TAU);
      ctx.fill();
    },
  },

  streaks: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, () => ({
        x: rand(-0.4, 1) * w,
        y: rand(0.04, 0.9) * h,
        len: rand(50, 150),
        v: rand(240, 520),
        bend: rand(-10, 10),
        a: rand(0.12, 0.34),
      })),
    draw(ctx, lines, env) {
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.4;
      for (const l of lines) {
        l.x += l.v * (1 + env.gust * 1.6) * env.dt;
        if (l.x - l.len > env.w) {
          l.x = -rand(20, 200);
          l.y = rand(0.04, 0.9) * env.h;
        }
        ctx.globalAlpha = env.alpha * l.a;
        ctx.beginPath();
        ctx.moveTo(l.x - l.len, l.y);
        ctx.quadraticCurveTo(l.x - l.len / 2, l.y + l.bend, l.x, l.y);
        ctx.stroke();
      }
    },
  },

  haze: {
    make: (w, h, o) =>
      Array.from({ length: o.count }, () => ({
        x: rand(0, 1) * w,
        y: rand(0.2, 1.1) * h,
        r: rand(0.35, 0.7) * w,
        v: rand(8, 20),
      })),
    draw(ctx, puffs, env) {
      const sprite = blob('255,240,200');
      for (const p of puffs) {
        p.y -= p.v * env.dt;
        if (p.y + p.r < 0) p.y = env.h + p.r;
        ctx.globalAlpha = env.alpha * 0.09;
        ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    },
  },

  lightning: {
    make: () => ({ wait: rand(2.5, 6), flash: 0, bolt: null }),
    strike(state, env, at) {
      const x0 = at ?? rand(0.15, 0.85) * env.w;
      const points = [[x0, -10]];
      let x = x0;
      let y = -10;
      const end = rand(0.4, 0.62) * env.h;
      while (y < end) {
        y += rand(18, 46);
        x += rand(-30, 30);
        points.push([x, y]);
      }
      const fork = Math.floor(points.length * rand(0.3, 0.6));
      const branch = [points[fork]];
      let [bx, by] = points[fork];
      for (let i = 0; i < 4; i++) {
        by += rand(16, 34);
        bx += rand(8, 34) * (x0 < env.w / 2 ? 1 : -1);
        branch.push([bx, by]);
      }
      state.bolt = { points, branch, life: 0.22 };
      state.flash = 1;
      state.wait = rand(4, 9);
    },
    draw(ctx, state, env) {
      state.wait -= env.dt;
      if (state.wait <= 0) this.strike(state, env);
      if (state.flash > 0) {
        // A quick double pulse reads as lightning; a single fade reads as a camera flash.
        const pulse = state.flash > 0.55 ? 1 : state.flash > 0.4 ? 0.25 : state.flash / 0.4;
        ctx.globalAlpha = env.alpha * 0.34 * pulse;
        ctx.fillStyle = '#eef2ff';
        ctx.fillRect(0, 0, env.w, env.h);
        state.flash = Math.max(0, state.flash - env.dt * 2.6);
      }
      if (state.bolt) {
        const b = state.bolt;
        ctx.globalAlpha = env.alpha * clamp(b.life / 0.12, 0, 1);
        ctx.strokeStyle = '#fff';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(190,210,255,0.9)';
        ctx.shadowBlur = 14;
        for (const [path, width] of [
          [b.points, 2.2],
          [b.branch, 1.2],
        ]) {
          ctx.lineWidth = width;
          ctx.beginPath();
          path.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        b.life -= env.dt;
        if (b.life <= 0) state.bolt = null;
      }
    },
  },

  meteors: {
    make: () => ({ wait: rand(3, 7), m: null }),
    strike(state, env, at) {
      state.m = { x: at ?? rand(0.2, 0.9) * env.w, y: rand(0.04, 0.3) * env.h, life: 0.7 };
      state.wait = rand(6, 12);
    },
    draw(ctx, state, env) {
      state.wait -= env.dt;
      if (state.wait <= 0) this.strike(state, env);
      const m = state.m;
      if (!m) return;
      m.x -= 420 * env.dt;
      m.y += 190 * env.dt;
      m.life -= env.dt;
      const tail = ctx.createLinearGradient(m.x, m.y, m.x + 90, m.y - 41);
      tail.addColorStop(0, 'rgba(255,255,255,0.95)');
      tail.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = env.alpha * clamp(m.life / 0.25, 0, 1);
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + 90, m.y - 41);
      ctx.stroke();
      if (m.life <= 0) state.m = null;
    },
  },
};

const SCENES = {
  fog: [['bands', { count: 6, alpha: 0.17 }]],
  night: [
    ['stars', { count: 55 }],
    ['bokeh', { count: 9 }],
  ],
  cloudy: [['clouds', { count: 6, alpha: 0.2, low: true }]],
  overcast: [['clouds', { count: 8, alpha: 0.17, low: true }]],
  storm: [
    ['clouds', { count: 5, alpha: 0.5, dark: true }],
    ['rain', { count: 120, speed: 1250, slant: 0.2, alpha: 0.5 }],
    ['lightning', {}],
  ],
  rain: [
    ['clouds', { count: 4, alpha: 0.13 }],
    ['rain', { count: 70, speed: 820, slant: 0.08, alpha: 0.34 }],
  ],
  sunset: [
    ['sun', { x: 0.74, y: 0.66, r: 0.62, rgb: '255,196,128' }],
    ['clouds', { count: 3, alpha: 0.12 }],
  ],
  sunny: [
    ['sun', { x: 0.86, y: 0.09, r: 0.7, rgb: '255,246,208', rays: true }],
    ['clouds', { count: 2, alpha: 0.14 }],
  ],
  hot: [
    ['sun', { x: 0.5, y: 0.06, r: 0.85, rgb: '255,238,176', rays: true }],
    ['haze', { count: 6 }],
  ],
  wind: [
    ['clouds', { count: 3, alpha: 0.12, speed: 4 }],
    ['streaks', { count: 16 }],
  ],
  snow: [
    ['clouds', { count: 3, alpha: 0.12 }],
    ['snow', { count: 90 }],
  ],
  stars: [
    ['stars', { count: 120 }],
    ['moon', { x: 0.8, y: 0.13 }],
    ['meteors', {}],
  ],
};

export function createSky(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let type = null;
  let layers = [];
  let alpha = 1;
  let gust = 0;
  let running = false;
  let frame = 0;
  let last = 0;
  let t = 0;

  function build() {
    layers = (SCENES[type] || []).map(([name, options]) => ({
      kind: LAYERS[name],
      options,
      state: LAYERS[name].make(w, h, options),
    }));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (rect.width === w && rect.height === h && canvas.width === Math.round(w * dpr)) return;
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (type) build();
    if (!running) draw(0);
  }

  function draw(dt) {
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    if (alpha <= 0.01) return;
    t += dt;
    gust = Math.max(0, gust - dt * 1.1);
    const env = { w, h, dt, t, gust, alpha };
    for (const layer of layers) {
      layer.kind.draw(ctx, layer.state, env, layer.options);
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    draw(dt);
    frame = requestAnimationFrame(loop);
  }

  return {
    resize,
    setScene(next) {
      if (next === type) return;
      type = next;
      gust = 0;
      if (w) build();
      if (!running) draw(0);
    },
    /** 0..1, used to fade the particles out and back in while swiping between places. */
    setAlpha(value) {
      alpha = clamp(value, 0, 1);
    },
    /** A tap on the sky: lightning in a storm, a shooting star at night, a gust otherwise. */
    poke(x) {
      const env = { w, h };
      let special = false;
      for (const layer of layers) {
        if (layer.kind.strike) {
          layer.kind.strike(layer.state, env, x);
          special = true;
        }
      }
      if (!special) gust = 1;
      if (!running) draw(0.016);
    },
    start() {
      resize();
      if (running || reducedMotion()) {
        if (!running) draw(0);
        return;
      }
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
  };
}
