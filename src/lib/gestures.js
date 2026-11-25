// Pointer helpers shared by the home bar, sheets, charts and the radar.

/**
 * Follows one pointer from press to release.
 *   onStart(event) -> return false to ignore this press
 *   onMove({ dx, dy, x, y, event })
 *   onEnd({ dx, dy, vx, vy, cancelled, event })   velocities in px/ms
 */
export function drag(el, { onStart, onMove, onEnd }) {
  let active = null;

  const down = (event) => {
    if (active) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (onStart && onStart(event) === false) return;
    active = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      vx: 0,
      vy: 0,
    };
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already gone */
    }
  };

  const move = (event) => {
    if (!active || event.pointerId !== active.id) return;
    const dt = Math.max(1, event.timeStamp - active.t);
    active.vx = active.vx * 0.4 + ((event.clientX - active.x) / dt) * 0.6;
    active.vy = active.vy * 0.4 + ((event.clientY - active.y) / dt) * 0.6;
    active.x = event.clientX;
    active.y = event.clientY;
    active.t = event.timeStamp;
    onMove?.({ dx: active.x - active.x0, dy: active.y - active.y0, x: active.x, y: active.y, event });
  };

  const up = (event) => {
    if (!active || event.pointerId !== active.id) return;
    const done = active;
    active = null;
    // A finger that rests before lifting should not count as a flick.
    const stale = event.timeStamp - done.t > 90;
    onEnd?.({
      dx: done.x - done.x0,
      dy: done.y - done.y0,
      vx: stale ? 0 : done.vx,
      vy: stale ? 0 : done.vy,
      cancelled: event.type === 'pointercancel',
      event,
    });
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}

/**
 * Touch screens scroll by dragging; a mouse does not. This makes a mouse drag behave like a
 * finger inside `root`, so the app can be tried on a computer:
 *   - horizontal drags scroll the nearest [data-hscroll] (paged ones snap to a page on release)
 *   - vertical drags scroll the nearest [data-vscroll], or pull to refresh at the top
 * `pullFor(el)` may return a pull-to-refresh controller ({ move(dy), end() }) for a scroller.
 */
export function mouseDragScroll(root, { pullFor } = {}) {
  let s = null;

  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target.closest('input, textarea, select, [data-nodrag]')) return;
    const hEl = event.target.closest('[data-hscroll]');
    const vEl = event.target.closest('[data-vscroll]');
    if (!hEl && !vEl) return;
    s = {
      x: event.clientX,
      y: event.clientY,
      hEl,
      vEl,
      h0: hEl ? hEl.scrollLeft : 0,
      v0: vEl ? vEl.scrollTop : 0,
      axis: null,
      pull: null,
      lastX: event.clientX,
      vx: 0,
      t: event.timeStamp,
    };
  });

  window.addEventListener('pointermove', (event) => {
    if (!s || event.pointerType !== 'mouse') return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x' && !s.hEl) s.axis = 'y';
      if (s.axis === 'y' && !s.vEl) s.axis = 'x';
      if (s.axis === 'x' && s.hEl.hasAttribute('data-paged')) s.hEl.style.scrollSnapType = 'none';
      if (s.axis === 'y' && dy > 0 && s.v0 <= 0 && pullFor) s.pull = pullFor(s.vEl);
      root.classList.add('is-mouse-dragging');
    }
    const dt = Math.max(1, event.timeStamp - s.t);
    s.vx = s.vx * 0.4 + ((event.clientX - s.lastX) / dt) * 0.6;
    s.lastX = event.clientX;
    s.t = event.timeStamp;
    if (s.axis === 'x') s.hEl.scrollLeft = s.h0 - dx;
    else if (s.pull) s.pull.move(Math.max(0, dy));
    else s.vEl.scrollTop = s.v0 - dy;
  });

  const end = (event) => {
    if (!s || event.pointerType !== 'mouse') return;
    const done = s;
    s = null;
    root.classList.remove('is-mouse-dragging');
    if (!done.axis) return;
    // The click that follows a drag should not press whatever was under the cursor.
    const swallow = (click) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    if (done.pull) done.pull.end();
    if (done.axis === 'x' && done.hEl.hasAttribute('data-paged')) {
      const el = done.hEl;
      const width = el.clientWidth;
      const startPage = Math.round(done.h0 / width);
      const moved = el.scrollLeft - done.h0;
      let page = startPage;
      // A long drag or a quick flick turns the page. At either end `moved` stays near zero,
      // so a flick there goes nowhere instead of bouncing back a page.
      const flicked = Math.abs(done.vx) > 0.45 && Math.abs(moved) > 12;
      if (Math.abs(moved) > width * 0.22 || flicked) page += moved > 0 ? 1 : -1;
      const maxPage = Math.round((el.scrollWidth - width) / width);
      page = Math.min(maxPage, Math.max(0, page));
      el.scrollTo({ left: page * width, behavior: 'smooth' });
      setTimeout(() => {
        el.style.scrollSnapType = '';
      }, 450);
    }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
