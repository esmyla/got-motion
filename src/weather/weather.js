// The fake Weather app: one page per situation, swiped sideways, scrolled down, refreshed
// compulsively. Scrolling is native; only pull-to-refresh and the mouse are handled by hand.

import { add, clamp, clear, h, themeColor } from '../lib/dom.js';
import { mouseDragScroll } from '../lib/gestures.js';
import { tick } from '../lib/haptics.js';
import { ui } from '../lib/icons.js';
import { random } from '../lib/rng.js';
import { bump, markPlaceSeen, on, pick, save, state } from '../lib/store.js';
import { coach } from '../shell/coach.js';
import { buildCards } from './cards.js';
import { openDetail } from './detail.js';
import { buildForecast, degrees, placeCondition, placeName, savedPlaces } from './forecast.js';
import { openPlaces } from './places.js';
import { drawRadarPreview, openRadar } from './radar.js';
import { SKIES, skyGradient } from './situations.js';
import { createSky } from './sky.js';

const PULL_THRESHOLD = 68;

const REFRESH_LINES = [
  'Checked. Still awkward.',
  'Updated just now. Nothing changed.',
  'Refreshed. Conditions persist.',
  'Up to date. Unfortunately.',
  'Confirmed with a second source: you.',
];

export function createWeather(root) {
  let places = savedPlaces();
  let index = clamp(state.weather.index, 0, places.length - 1);
  let pages = [];
  let visible = false;
  let sceneIndex = -1;
  let builtHour = -1;
  const refreshCounts = new Map();

  const skies = h('div', { class: 'wx-skies', 'aria-hidden': 'true' });
  const canvas = h('canvas', { class: 'wx-fx', 'aria-hidden': 'true' });
  const pager = h('div', { class: 'wx-pager', 'data-hscroll': true, 'data-paged': true });
  const dots = h('div', { class: 'wx-dots' });
  const toolbar = h(
    'div',
    { class: 'wx-toolbar' },
    h('button', { class: 'wx-tool', type: 'button', 'aria-label': 'Radar', html: ui.map, onClick: () => showRadar() }),
    dots,
    h('button', { class: 'wx-tool', type: 'button', 'aria-label': 'Locations', html: ui.list, onClick: () => showPlaces() }),
  );
  add(root, h('div', { class: 'wx' }, skies, canvas, pager, toolbar));
  const sky = createSky(canvas);

  // -------------------------------------------------------------- a page

  function buildPage(place, position) {
    const where = h('p', { class: 'wx-where' });
    const name = h('h2', { class: 'wx-name' });
    const temp = h('p', { class: 'wx-temp' });
    const cond = h('p', { class: 'wx-cond' });
    const range = h('p', { class: 'wx-range' });
    const header = h('header', { class: 'wx-head' }, where, name, temp, cond, range);
    const cards = h('div', { class: 'wx-cards' });
    const foot = h('footer', { class: 'wx-foot' });
    const content = h('div', { class: 'wx-content' }, header, cards, foot);
    const spinner = h('div', { class: 'wx-pull', 'aria-hidden': 'true' }, h('i'));
    const scroller = h('div', { class: 'wx-page', 'data-vscroll': true }, spinner, content);
    const miniName = h('span', { class: 'wx-mini-name' });
    const miniLine = h('span', { class: 'wx-mini-line' });
    const mini = h('div', { class: 'wx-mini', 'aria-hidden': 'true' }, miniName, miniLine);
    const wrap = h('section', { class: 'wx-pagewrap', 'aria-label': placeName(place) }, mini, scroller);
    mini.style.setProperty('--sky', skyGradient(place.sky));

    let forecast = null;
    let statusTimer = 0;

    const whereText = () => pick(place.where, position === 0 ? 'My Location' : '');

    function render() {
      forecast = buildForecast(place, refreshCounts.get(place.id) || 0);
      where.textContent = whereText();
      name.textContent = placeName(place);
      temp.textContent = degrees(forecast.temp);
      cond.textContent = placeCondition(place);
      range.textContent = `H:${degrees(forecast.hi)}  L:${degrees(forecast.lo)}`;
      miniName.textContent = placeName(place);
      miniLine.textContent = `${degrees(forecast.temp)}  |  ${placeCondition(place)}`;
      clear(cards);
      add(
        cards,
        buildCards(place, forecast, {
          onMetric: (key) => openDetail(place, key, forecast),
          onRadar: () => showRadar(place),
          drawRadarPreview: (target) => drawRadarPreview(target, place),
        }),
      );
      clear(foot);
      add(
        foot,
        h('p', { text: pick(`Weather for ${place.name}`, `Weather for ${place.city}`) }),
        h('p', {
          text: pick('Data from nowhere. Accuracy: emotional.', 'Learn more about weather data and map data'),
        }),
      );
    }

    function status(text) {
      clearTimeout(statusTimer);
      where.textContent = text;
      where.classList.add('is-status');
      statusTimer = setTimeout(() => {
        where.textContent = whereText();
        where.classList.remove('is-status');
      }, 3200);
    }

    // Header fades and drifts as the cards scroll over it; a compact title takes its place.
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const y = scroller.scrollTop;
        header.style.opacity = String(clamp(1 - y / 170, 0, 1));
        header.style.transform = `translateY(${Math.max(0, y) * 0.32}px) scale(${clamp(1 - y / 1400, 0.86, 1)})`;
        mini.style.opacity = String(clamp((y - 150) / 50, 0, 1));
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });

    // Tap the sky for a little weather of your own.
    header.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      sky.poke(event.clientX - rect.left);
      tick(8);
    });

    // ---- pull to refresh
    let pulled = 0;
    let refreshing = false;
    const setPull = (distance, animated) => {
      pulled = distance;
      content.style.transition = animated ? 'transform 0.38s var(--ease-out)' : 'none';
      content.style.transform = distance ? `translateY(${distance}px)` : '';
      spinner.style.transition = animated ? 'opacity 0.3s, transform 0.38s var(--ease-out)' : 'none';
      spinner.style.opacity = String(clamp(distance / 46, 0, 1));
      spinner.style.transform = `translateY(${Math.min(distance, 90) * 0.55}px)`;
      spinner.style.setProperty('--turn', `${distance * 4}deg`);
      spinner.classList.toggle('is-armed', distance >= PULL_THRESHOLD);
    };
    const pull = {
      move(dy) {
        if (refreshing) return;
        const was = pulled >= PULL_THRESHOLD;
        setPull(150 * (1 - Math.exp(-Math.max(0, dy) / 190)), false);
        if (!was && pulled >= PULL_THRESHOLD) tick(10);
      },
      end() {
        if (refreshing) return;
        if (pulled < PULL_THRESHOLD) {
          setPull(0, true);
          return;
        }
        refreshing = true;
        setPull(54, true);
        spinner.classList.add('is-spinning');
        setTimeout(() => {
          refreshCounts.set(place.id, (refreshCounts.get(place.id) || 0) + 1);
          bump('refreshes');
          render();
          spinner.classList.remove('is-spinning');
          setPull(0, true);
          refreshing = false;
          const count = refreshCounts.get(place.id);
          status(
            pick(
              count > 2 && random.chance(0.35) ? `Refreshed ${count} times. Admirable.` : random.pick(REFRESH_LINES),
              'Updated just now',
            ),
          );
          coach.event('refresh', { chance: 0.5 });
        }, 900);
      },
    };

    let touch = null;
    scroller.addEventListener(
      'touchstart',
      (event) => {
        touch =
          event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY, top: scroller.scrollTop, decided: false, pulling: false }
            : null;
      },
      { passive: true },
    );
    scroller.addEventListener(
      'touchmove',
      (event) => {
        if (!touch || refreshing) return;
        const dx = event.touches[0].clientX - touch.x;
        const dy = event.touches[0].clientY - touch.y;
        if (!touch.decided) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          touch.decided = true;
          touch.pulling = touch.top <= 0 && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2;
        }
        if (!touch.pulling) return;
        if (event.cancelable) event.preventDefault();
        pull.move(dy);
      },
      { passive: false },
    );
    const touchEnd = () => {
      if (touch?.pulling) pull.end();
      touch = null;
    };
    scroller.addEventListener('touchend', touchEnd);
    scroller.addEventListener('touchcancel', touchEnd);

    render();
    return { place, wrap, scroller, render, pull, forecast: () => forecast };
  }

  // ------------------------------------------------------------- the set

  function build({ keepScroll = false } = {}) {
    const tops = keepScroll ? pages.map((page) => page.scroller.scrollTop) : [];
    clear(skies);
    clear(pager);
    clear(dots);
    pages = places.map((place, i) => {
      skies.append(h('div', { class: 'wx-sky', style: { background: skyGradient(place.sky) } }));
      const page = buildPage(place, i);
      pager.append(page.wrap);
      dots.append(
        h('button', {
          class: `wx-dot${i === 0 ? ' is-here' : ''}`,
          type: 'button',
          'aria-label': placeName(place),
          html: i === 0 ? ui.locate : '',
          onClick: () => goTo(i),
        }),
      );
      return page;
    });
    builtHour = new Date().getHours();
    index = clamp(index, 0, places.length - 1);
    sceneIndex = -1;
    snapToIndex();
    if (keepScroll) pages.forEach((page, i) => (page.scroller.scrollTop = tops[i] || 0));
  }

  /** Puts the pager on the current page without animating, and syncs everything to it. */
  function snapToIndex() {
    const width = pager.clientWidth;
    if (width) pager.scrollLeft = index * width;
    sync(index);
  }

  /** `f` is the pager position in pages, e.g. 1.5 is halfway between the 2nd and 3rd. */
  function sync(f) {
    const layers = skies.children;
    for (let i = 0; i < layers.length; i++) {
      layers[i].style.opacity = String(clamp(1 - Math.abs(f - i), 0, 1));
      pages[i]?.wrap.classList.toggle('is-far', Math.abs(f - i) > 1.5);
    }
    const nearest = clamp(Math.round(f), 0, places.length - 1);
    for (let i = 0; i < dots.children.length; i++) dots.children[i].classList.toggle('is-on', i === nearest);
    sky.setAlpha(1 - Math.abs(f - nearest) * 2.4);
    if (nearest !== sceneIndex) {
      sceneIndex = nearest;
      sky.setScene(places[nearest].sky);
      if (visible) themeColor(SKIES[places[nearest].sky].stops[0]);
    }
  }

  function goTo(i, smooth = true) {
    const target = clamp(i, 0, places.length - 1);
    pager.scrollTo({ left: target * pager.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
  }

  let queued = false;
  let settleTimer = 0;
  pager.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const width = pager.clientWidth;
        if (!width) return;
        const f = pager.scrollLeft / width;
        sync(f);
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => settle(clamp(Math.round(f), 0, places.length - 1)), 140);
      });
    },
    { passive: true },
  );

  function settle(i) {
    if (i === index) return;
    index = i;
    state.weather.index = i;
    save();
    markPlaceSeen(places[i].id);
    coach.event('place', { chance: 0.22, minGap: 14_000 });
  }

  // ------------------------------------------------------------- sheets

  function showRadar(place = places[index]) {
    bump('radarOpens');
    openRadar(place);
    coach.event('radar', { chance: 0.7 });
  }

  function showPlaces() {
    openPlaces({
      places,
      current: index,
      onPick(i) {
        index = i;
        state.weather.index = i;
        save();
        markPlaceSeen(places[i].id);
        snapToIndex();
      },
      onChange(focusId) {
        places = savedPlaces();
        const found = places.findIndex((p) => p.id === focusId);
        index = found >= 0 ? found : clamp(index, 0, places.length - 1);
        state.weather.index = index;
        save();
        build();
        return places;
      },
    });
  }

  // ---------------------------------------------------------- lifecycle

  mouseDragScroll(root, { pullFor: (el) => pages.find((page) => page.scroller === el)?.pull });

  on('settings', (key) => {
    if (key === 'legit' || key === 'unit') build({ keepScroll: true });
  });

  window.addEventListener('resize', () => {
    if (!visible) return;
    sky.resize();
    snapToIndex();
  });

  document.addEventListener('visibilitychange', () => {
    if (!visible) return;
    if (document.hidden) sky.stop();
    else sky.start();
  });

  build();

  return {
    show() {
      visible = true;
      themeColor(SKIES[places[index].sky].stops[0]);
      // Rebuild when the hour has rolled over, so "Now" is still now.
      if (builtHour !== new Date().getHours()) build({ keepScroll: true });
      snapToIndex();
      sky.start();
      markPlaceSeen(places[index].id);
      // Sizes are only real once the app is on screen.
      requestAnimationFrame(() => {
        if (!visible) return;
        sky.resize();
        snapToIndex();
      });
    },
    hide() {
      visible = false;
      sky.stop();
    },
    onKey(event) {
      if (event.key === 'ArrowRight') goTo(index + 1);
      else if (event.key === 'ArrowLeft') goTo(index - 1);
    },
  };
}
