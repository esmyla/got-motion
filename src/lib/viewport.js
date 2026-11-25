// Keeps the app above the phone's on-screen keyboard.
//
// When a keyboard opens, phones do not shrink the page: they shrink the "visual viewport"
// and slide the page up underneath it, which would push the top of a chat off screen and
// leave the message box wherever it lands. This watches the visual viewport and hands its
// size to CSS (--vv-h, --vv-top), so the whole app is resized to the part still visible and
// the message box sits right on top of the keyboard.

import { emit } from './store.js';

const isEditable = (el) => Boolean(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable));

export function trackKeyboard(device) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let tallest = window.innerHeight;
  let width = window.innerWidth;
  let open = false;

  const sync = () => {
    // Rotating the phone changes what "full height" means.
    if (window.innerWidth !== width) {
      width = window.innerWidth;
      tallest = window.innerHeight;
    }
    tallest = Math.max(tallest, window.innerHeight);
    // Browser toolbars come and go by a few dozen pixels; a keyboard takes far more.
    const now = tallest - viewport.height > 140 && isEditable(document.activeElement);
    if (now) {
      root.style.setProperty('--vv-h', `${Math.round(viewport.height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(viewport.offsetTop)}px`);
    } else {
      root.style.removeProperty('--vv-h');
      root.style.removeProperty('--vv-top');
    }
    device.classList.toggle('is-typing', now);
    if (now !== open) {
      open = now;
      emit('keyboard', open);
    } else if (now) {
      emit('keyboard', true);
    }
  };

  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync);
  // Focus changes do not always resize anything (a hardware keyboard, for one).
  window.addEventListener('focusin', () => setTimeout(sync, 60));
  window.addEventListener('focusout', () => setTimeout(sync, 60));
}
