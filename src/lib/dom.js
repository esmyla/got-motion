// Tiny DOM helpers. No framework: the app is mostly gestures and canvases.

/**
 * h('div', { class: 'x', onClick: fn, style: { '--p': 1 } }, child, 'text', [more])
 * `text` sets textContent. `html` is only ever used with markup written in this repo
 * (icons), never with anything a person typed.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'style' && typeof value === 'object') setStyles(el, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
  }
  add(el, children);
  return el;
}

export function add(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function setStyles(el, styles) {
  for (const [key, value] of Object.entries(styles)) {
    if (key.startsWith('--')) el.style.setProperty(key, value);
    else el.style[key] = value;
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Colours the browser toolbar / status bar to match whatever is on screen. */
export function themeColor(color) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => motionQuery.matches;

/**
 * Runs a Web Animation and resolves with it once it ends (null when motion is reduced).
 * It holds its last frame, so the caller sets the real end state and then calls settle().
 */
export async function animate(el, keyframes, options) {
  if (reducedMotion()) return null;
  const animation = el.animate(keyframes, { fill: 'forwards', ...options });
  try {
    await animation.finished;
  } catch {
    /* cancelled mid-flight */
  }
  return animation;
}

export const settle = (animations) => {
  for (const animation of animations) animation?.cancel();
};

/** "4m 12s", "1h 03m", "38s" */
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export const formatInt = (n) => Math.round(n).toLocaleString('en-US');
