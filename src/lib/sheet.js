// Bottom sheets: slide up, drag the header down (or tap outside, or press Esc) to dismiss.

import { h } from './dom.js';
import { drag } from './gestures.js';
import { ui } from './icons.js';

const stack = [];
const host = () => document.getElementById('overlays');
const behind = () => document.querySelectorAll('#home, .app, #homebar');

function setBehindInert(on) {
  for (const el of behind()) el.inert = on;
}

export const sheetIsOpen = () => stack.length > 0;
export const closeTopSheet = () => {
  const top = stack[stack.length - 1];
  if (top) top.close();
  return Boolean(top);
};
export const closeAllSheets = () => {
  for (const sheet of [...stack].reverse()) sheet.close(true);
};

/**
 * Lets a full-screen overlay that is not a sheet (the radar) take part in the same stack, so
 * Esc, the back gesture and leaving the app all close it. Returns a function to call once closed.
 */
export function registerOverlay(close) {
  const entry = { close };
  stack.push(entry);
  setBehindInert(true);
  return () => {
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) setBehindInert(false);
  };
}

/**
 * openSheet({ title, subtitle, body, className, onClose }) -> { el, body, close, setTitle }
 * `body` is a node (or list of nodes) placed in the scrolling area.
 */
export function openSheet({ title, subtitle, body, className = '', onClose }) {
  const returnFocus = document.activeElement;
  const titleEl = h('h2', { class: 'sheet-title', text: title });
  const subtitleEl = h('p', { class: 'sheet-subtitle', text: subtitle || '' });
  const head = h(
    'div',
    { class: 'sheet-head' },
    h('span', { class: 'sheet-grab' }),
    h(
      'div',
      { class: 'sheet-titlebar' },
      h('div', { class: 'sheet-titles' }, titleEl, subtitleEl),
      h('button', {
        class: 'sheet-close',
        type: 'button',
        'aria-label': 'Close',
        html: ui.close,
        'data-nodrag': true,
        onClick: () => api.close(),
      }),
    ),
  );
  subtitleEl.hidden = !subtitle;
  const bodyEl = h('div', { class: 'sheet-body', 'data-vscroll': true }, body);
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: () => api.close() });
  const el = h(
    'div',
    { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    head,
    bodyEl,
  );

  let closed = false;
  const api = {
    el,
    body: bodyEl,
    setTitle(text, sub) {
      titleEl.textContent = text;
      subtitleEl.textContent = sub || '';
      subtitleEl.hidden = !sub;
      el.setAttribute('aria-label', text);
    },
    close(instant = false) {
      if (closed) return;
      closed = true;
      const index = stack.indexOf(api);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) setBehindInert(false);
      el.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      el.style.transform = '';
      const remove = () => {
        el.remove();
        backdrop.remove();
      };
      if (instant) remove();
      else setTimeout(remove, 380);
      onClose?.();
      if (returnFocus && returnFocus.isConnected && !stack.length) returnFocus.focus?.({ preventScroll: true });
    },
  };

  host().append(backdrop, el);
  stack.push(api);
  setBehindInert(true);
  // Two frames so the starting position is painted before the transition begins.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (closed) return;
      el.classList.add('is-open');
      backdrop.classList.add('is-open');
      el.focus({ preventScroll: true });
    }),
  );

  drag(head, {
    onStart: (event) => !event.target.closest('[data-nodrag]'),
    onMove: ({ dy }) => {
      el.style.transition = 'none';
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      backdrop.style.transition = 'none';
      backdrop.style.opacity = String(Math.max(0.15, 1 - Math.max(0, dy) / 500));
    },
    onEnd: ({ dy, vy }) => {
      el.style.transition = '';
      backdrop.style.transition = '';
      backdrop.style.opacity = '';
      if (dy > 120 || vy > 0.55) api.close();
      else el.style.transform = '';
    },
  });

  return api;
}
