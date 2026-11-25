// The fake Calculator. Two modes:
//   Mash: hit anything, and it types a believable calculation for you (see scripts.js).
//   Math: an actual calculator, for the rare genuine emergency.

import { segmented } from '../lib/controls.js';
import { add, clear, h, themeColor } from '../lib/dom.js';
import { drag } from '../lib/gestures.js';
import { tick } from '../lib/haptics.js';
import { ui } from '../lib/icons.js';
import { openSheet } from '../lib/sheet.js';
import { bump, on, save, settings, state } from '../lib/store.js';
import { coach } from '../shell/coach.js';
import { Calculator } from './engine.js';
import { ERROR_QUIP, nextScript, quipFor } from './scripts.js';

const MAIN_KEYS = [
  ['AC', 'fn'],
  ['±', 'fn'],
  ['%', 'fn'],
  ['÷', 'op'],
  ['7', 'num'],
  ['8', 'num'],
  ['9', 'num'],
  ['×', 'op'],
  ['4', 'num'],
  ['5', 'num'],
  ['6', 'num'],
  ['−', 'op'],
  ['1', 'num'],
  ['2', 'num'],
  ['3', 'num'],
  ['+', 'op'],
  ['more', 'num'],
  ['0', 'num'],
  ['.', 'num'],
  ['=', 'op'],
];

const EXTRA_KEYS = ['(', ')', 'x²', '√', 'xʸ', 'sin', 'cos', 'tan', 'ln', 'log', 'π', 'e', 'x!', '1/x', 'Rand'];

const SPOKEN = {
  AC: 'All clear',
  '±': 'Plus minus',
  '%': 'Percent',
  '÷': 'Divide',
  '×': 'Multiply',
  '−': 'Minus',
  '+': 'Plus',
  '=': 'Equals',
  '.': 'Decimal point',
  more: 'More functions',
  'x²': 'Square',
  '√': 'Square root',
  'xʸ': 'Power',
  'x!': 'Factorial',
  '1/x': 'Reciprocal',
  Rand: 'Random number',
};

const KEYBOARD = {
  Enter: '=',
  '=': '=',
  Backspace: '⌫',
  Delete: 'AC',
  c: 'AC',
  C: 'AC',
  '+': '+',
  '-': '−',
  '*': '×',
  x: '×',
  X: '×',
  '/': '÷',
  '%': '%',
  '(': '(',
  ')': ')',
  '^': 'xʸ',
  '.': '.',
  ',': '.',
};

const TAPE_LIMIT = 60;
const timeOf = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function createCalc(root) {
  const engine = new Calculator();
  const saved = state.calc;
  let mode = saved.mode === 'math' ? 'math' : 'mash';
  let extraOpen = Boolean(saved.sci);
  let script = null;
  let stepIndex = 0;
  let keyIndex = 0;
  let label = null;

  // ------------------------------------------------------------------ DOM

  const keyEls = new Map();
  const makeKey = ([id, kind], extra = false) => {
    const el = h('button', {
      class: `key key-${kind}${extra ? ' key-extra' : ''}`,
      type: 'button',
      dataset: { key: id },
      'aria-label': SPOKEN[id] || id,
    });
    if (id === 'more') el.innerHTML = ui.functions;
    else el.textContent = id;
    keyEls.set(id, el);
    return el;
  };

  const modeControl = segmented(
    [
      { value: 'mash', label: 'Mash' },
      { value: 'math', label: 'Math' },
    ],
    mode,
    (next) => setMode(next),
    { label: 'Calculator mode' },
  );

  const tapeEl = h('button', { class: 'calc-tape', type: 'button', 'aria-label': 'Open the tape', onClick: openTape });
  const exprEl = h('div', { class: 'calc-expr', 'aria-hidden': 'true' });
  const mainText = h('span', { class: 'calc-main-text' });
  const mainEl = h('div', { class: 'calc-main', role: 'status', 'aria-live': 'polite' }, mainText);
  const toast = h('div', { class: 'calc-toast', 'aria-hidden': 'true' });
  const extraEl = h('div', { class: 'calc-extra' }, EXTRA_KEYS.map((id) => makeKey([id, 'sci'], true)));
  const keysEl = h('div', { class: 'calc-keys' }, MAIN_KEYS.map((key) => makeKey(key)));

  add(
    root,
    h(
      'div',
      { class: 'calc' },
      h(
        'div',
        { class: 'calc-top' },
        h('button', { class: 'calc-icon', type: 'button', 'aria-label': 'Tape', html: ui.tape, onClick: openTape }),
        modeControl,
        h('button', {
          class: 'calc-icon',
          type: 'button',
          'aria-label': 'Delete last digit',
          html: ui.backspace,
          onClick: () => pressKey('⌫'),
        }),
      ),
      h('div', { class: 'calc-display' }, tapeEl, exprEl, mainEl, toast),
      extraEl,
      keysEl,
    ),
  );

  // ------------------------------------------------------------- rendering

  function fit() {
    const available = mainEl.clientWidth;
    if (!available) return;
    mainText.style.transform = '';
    const needed = mainText.offsetWidth;
    mainText.style.transform = needed > available ? `scale(${available / needed})` : '';
  }

  function render() {
    mainText.textContent = engine.main;
    exprEl.textContent = engine.expr;
    const armed = engine.armed === '^' ? 'xʸ' : engine.armed;
    for (const [id, el] of keyEls) el.classList.toggle('is-armed', id === armed);
    fit();
  }

  function flash(el) {
    if (!el) return;
    el.classList.add('is-down');
    setTimeout(() => el.classList.remove('is-down'), 120);
  }

  function setExtra(open, { animate = true } = {}) {
    extraOpen = open;
    saved.sci = open;
    save();
    root.firstElementChild.classList.toggle('is-extra-open', open);
    keyEls.get('more').setAttribute('aria-expanded', String(open));
    extraEl.inert = !open;
    // The display changes height as the panel slides, so re-fit the number as it goes.
    if (animate) {
      const until = performance.now() + 380;
      const follow = () => {
        fit();
        if (performance.now() < until) requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    }
  }

  // ------------------------------------------------------------------ tape

  function tapeLine(entry, { fresh = false } = {}) {
    const el = h(
      'div',
      { class: `tape-line${fresh ? ' is-fresh' : ''}` },
      entry.label ? h('div', { class: 'tape-label', text: entry.label, 'data-joke': true }) : null,
      entry.expr ? h('div', { class: 'tape-math', text: `${entry.expr} = ${entry.text}` }) : null,
    );
    return el;
  }

  function printTape(entry) {
    tapeEl.append(tapeLine(entry, { fresh: true }));
    while (tapeEl.children.length > 5) tapeEl.firstElementChild.remove();
  }

  function restoreTape() {
    clear(tapeEl);
    for (const entry of saved.tape.slice(0, 3).reverse()) tapeEl.append(tapeLine(entry));
  }

  function record({ expr, value, text }, caption) {
    const entry = { expr, text, label: settings.legit ? null : caption || null, t: Date.now() };
    saved.tape.unshift(entry);
    if (saved.tape.length > TAPE_LIMIT) saved.tape.length = TAPE_LIMIT;
    save();
    bump('calcs');
    if (value === 69) bump('nice');
    printTape(entry);
    mainText.classList.remove('is-pop');
    void mainText.offsetWidth; // restart the little landing animation
    mainText.classList.add('is-pop');
    coach.event('equals', { chance: 0.1, minGap: 20_000 });
  }

  function note(text) {
    if (settings.legit || !text) return;
    printTape({ label: text });
  }

  function openTape() {
    const list = h('div', { class: 'tape-list' });
    const fill = () => {
      clear(list);
      if (!saved.tape.length) {
        list.append(
          h('p', {
            class: 'tape-empty',
            text: settings.legit ? 'No history yet.' : 'Nothing calculated yet. Suspicious.',
          }),
        );
        return;
      }
      for (const entry of saved.tape) {
        list.append(
          h(
            'button',
            {
              class: 'tape-item',
              type: 'button',
              onClick: () => {
                recall(entry);
                sheet.close();
              },
            },
            entry.label ? h('span', { class: 'tape-item-label', text: entry.label, 'data-joke': true }) : null,
            h('span', { class: 'tape-item-expr', text: entry.expr }),
            h('span', { class: 'tape-item-result', text: entry.text }),
            h('span', { class: 'tape-item-time', text: timeOf(entry.t) }),
          ),
        );
      }
    };
    fill();
    const sheet = openSheet({
      title: settings.legit ? 'History' : 'The Tape',
      subtitle: settings.legit ? '' : 'Everything you have calculated. None of it was needed.',
      className: 'is-tall',
      body: [
        list,
        h(
          'div',
          { class: 'tape-actions' },
          h('button', {
            class: 'text-button is-danger',
            type: 'button',
            text: settings.legit ? 'Clear history' : 'Destroy the evidence',
            onClick: () => {
              saved.tape.length = 0;
              save();
              fill();
              restoreTape();
            },
          }),
        ),
      ],
    });
  }

  function recall(entry) {
    const value = Number(entry.text.replace(/,/g, '').replace(/−/g, '-'));
    if (!Number.isFinite(value)) return;
    script = null;
    engine.clear();
    engine.entry = { v: value, s: entry.text };
    render();
  }

  // --------------------------------------------------------------- pressing

  function pressKey(id) {
    flash(keyEls.get(id));
    tick();
    const out = engine.press(id);
    if (out.evaluated) record(out.evaluated, mode === 'mash' ? label : quipFor(out.evaluated));
    else if (out.error) note(ERROR_QUIP);
    render();
  }

  /** Mash mode: ignore what was actually hit and type the next key of the script. */
  function mashNext() {
    if (!script || keyIndex >= script.steps[stepIndex].keys.length) {
      if (script && stepIndex + 1 < script.steps.length) stepIndex += 1;
      else {
        script = nextScript({ scientific: extraOpen });
        stepIndex = 0;
      }
      keyIndex = 0;
    }
    const step = script.steps[stepIndex];
    label = step.label;
    bump('mashKeys');
    pressKey(step.keys[keyIndex++]);
  }

  function setMode(next) {
    mode = next;
    saved.mode = next;
    save();
    script = null;
    engine.clear();
    root.firstElementChild.dataset.mode = next;
    note(next === 'mash' ? 'Mash mode. Hit anything. The math writes itself.' : 'Math mode. An actual calculator. Sorry.');
    render();
  }

  function onPadDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const keyEl = event.target.closest('.key');
    const id = keyEl?.dataset.key;
    if (id === 'more') {
      flash(keyEl);
      tick();
      setExtra(!extraOpen);
      return;
    }
    if (mode === 'mash') {
      mashNext();
      return;
    }
    if (id) pressKey(id);
  }
  keysEl.addEventListener('pointerdown', onPadDown);
  extraEl.addEventListener('pointerdown', onPadDown);

  // Keys pressed with Enter or Space while focused arrive as clicks with no pointer.
  const onPadClick = (event) => {
    if (event.detail !== 0) return;
    const id = event.target.closest('.key')?.dataset.key;
    if (!id) return;
    if (id === 'more') setExtra(!extraOpen);
    else if (mode === 'mash') mashNext();
    else pressKey(id);
  };
  keysEl.addEventListener('click', onPadClick);
  extraEl.addEventListener('click', onPadClick);

  // Swipe across the number to delete a digit; hold it to copy.
  let holdTimer = 0;
  drag(mainEl, {
    onStart: () => {
      clearTimeout(holdTimer);
      holdTimer = setTimeout(copyValue, 550);
      return true;
    },
    onMove: ({ dx, dy }) => {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(holdTimer);
    },
    onEnd: ({ dx, dy }) => {
      clearTimeout(holdTimer);
      if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) pressKey('⌫');
    },
  });

  function copyValue() {
    const text = engine.main;
    tick(14);
    navigator.clipboard?.writeText(text.replace(/,/g, '').replace(/−/g, '-')).catch(() => {});
    toast.textContent = settings.legit ? 'Copied' : 'Copied. Paste it somewhere important.';
    toast.classList.add('is-in');
    setTimeout(() => toast.classList.remove('is-in'), 1600);
  }

  // ------------------------------------------------------------- lifecycle

  root.firstElementChild.dataset.mode = mode;
  setExtra(extraOpen, { animate: false });
  restoreTape();
  render();

  on('settings', (key) => {
    if (key === 'legit') restoreTape();
  });
  window.addEventListener('resize', fit);

  return {
    show() {
      themeColor('#0a0b0d');
      requestAnimationFrame(fit);
    },
    hide() {},
    onKey(event) {
      if (event.key === 'Tab' || event.key === 'Shift' || event.key.startsWith('Arrow')) return;
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('button')) return;
      if (mode === 'mash') {
        if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace') {
          event.preventDefault();
          mashNext();
        }
        return;
      }
      const id = /^[0-9]$/.test(event.key) ? event.key : KEYBOARD[event.key];
      if (!id) return;
      event.preventDefault();
      pressKey(id);
    },
    /** What the home-screen tile shows. */
    preview: () => engine.main,
  };
}

/** The last answer on the tape, for the home-screen tile before the app has been opened. */
export function lastAnswer() {
  return state.calc.tape[0]?.text || '0';
}
