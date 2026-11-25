import { h } from './dom.js';
import { tick } from './haptics.js';

/** Pill-shaped segmented control. Returns the element; call el.setValue(v) to move it from outside. */
export function segmented(options, value, onChange, { label } = {}) {
  const thumb = h('span', { class: 'seg-thumb' });
  const buttons = options.map((option) =>
    h('button', {
      type: 'button',
      text: option.label,
      'aria-pressed': String(option.value === value),
      onClick: () => {
        if (el.value === option.value) return;
        el.setValue(option.value);
        tick();
        onChange(option.value);
      },
    }),
  );
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': label, 'data-nodrag': true }, thumb, buttons);
  el.style.setProperty('--count', options.length);
  el.setValue = (next) => {
    el.value = next;
    const index = Math.max(0, options.findIndex((option) => option.value === next));
    el.style.setProperty('--index', index);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  };
  el.setValue(value);
  return el;
}

/** A settings row with a title, a description and a switch. */
export function switchRow({ title, desc, checked, onChange }) {
  const control = h('span', { class: 'switch', role: 'switch', 'aria-checked': String(checked) });
  const row = h(
    'button',
    {
      class: 'row',
      type: 'button',
      onClick: () => {
        const next = control.getAttribute('aria-checked') !== 'true';
        control.setAttribute('aria-checked', String(next));
        tick();
        onChange(next);
      },
    },
    h('span', { class: 'row-text' }, h('span', { class: 'row-title', text: title }), h('span', { class: 'row-desc', text: desc })),
    control,
  );
  row.setChecked = (value) => control.setAttribute('aria-checked', String(value));
  return row;
}
