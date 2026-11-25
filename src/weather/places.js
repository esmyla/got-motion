// The location list: jump to a saved situation, add one from the catalog, or type your own.

import { segmented } from '../lib/controls.js';
import { clear, h } from '../lib/dom.js';
import { tick } from '../lib/haptics.js';
import { ui } from '../lib/icons.js';
import { openSheet } from '../lib/sheet.js';
import { pick, save, setSetting, settings, state } from '../lib/store.js';
import { buildForecast, degrees, placeCondition, placeName } from './forecast.js';
import { CATALOG, makeCustomPlace, skyGradient } from './situations.js';

const LIMIT = 12;

export function openPlaces({ places, current, onPick, onChange }) {
  let list = places;
  let editing = false;

  const input = h('input', {
    class: 'places-input',
    type: 'search',
    placeholder: pick('Search or invent a situation', 'Search for a city or airport'),
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'search',
    maxlength: '26',
    'aria-label': 'Search',
  });
  const results = h('div', { class: 'places-results' });
  const saved = h('div', { class: 'places-saved' });
  const more = h('div', { class: 'places-more' });
  const editButton = h('button', {
    class: 'text-button',
    type: 'button',
    text: 'Edit',
    onClick: () => {
      editing = !editing;
      editButton.textContent = editing ? 'Done' : 'Edit';
      saved.classList.toggle('is-editing', editing);
    },
  });

  const isSaved = (id) => state.weather.places.includes(id);
  const hasRoom = () => state.weather.places.length < LIMIT;

  function addPlace(place) {
    if (!hasRoom()) return;
    tick();
    if (place.custom && !state.weather.custom.some((entry) => entry.id === place.id)) {
      state.weather.custom.push({ id: place.id, name: place.name });
    }
    if (!isSaved(place.id)) state.weather.places.push(place.id);
    save();
    onChange(place.id);
    sheet.close();
  }

  function removePlace(place) {
    if (state.weather.places.length <= 1) return;
    tick();
    state.weather.places = state.weather.places.filter((id) => id !== place.id);
    state.weather.custom = state.weather.custom.filter((entry) => entry.id !== place.id);
    save();
    list = onChange(null);
    render();
  }

  const catalogRow = (place, { added = false } = {}) =>
    h(
      'button',
      {
        class: 'place-row',
        type: 'button',
        disabled: !added && !hasRoom(),
        onClick: () => {
          if (added) {
            onPick(list.findIndex((p) => p.id === place.id));
            sheet.close();
          } else addPlace(place);
        },
      },
      h('span', { class: 'place-row-swatch', style: { background: skyGradient(place.sky) } }),
      h(
        'span',
        { class: 'place-row-text' },
        h('span', { class: 'place-row-name', text: placeName(place) }),
        h('span', { class: 'place-row-sub', text: pick(`${place.cond} · ${place.where}`, placeCondition(place)) }),
      ),
      h('span', { class: 'place-row-action', html: added ? ui.chevronRight : ui.plus }),
    );

  function renderResults() {
    const query = input.value.trim();
    clear(results);
    const searching = query.length > 0;
    saved.hidden = searching;
    more.hidden = searching;
    editButton.hidden = searching;
    if (!searching) return;

    const q = query.toLowerCase();
    const hit = (place) =>
      [place.name, place.where, place.cond, place.city].some((text) => text.toLowerCase().includes(q));
    const matches = [...list.filter(hit), ...CATALOG.filter((place) => !isSaved(place.id) && hit(place))];
    for (const place of matches) results.append(catalogRow(place, { added: isSaved(place.id) }));

    const exact = matches.some((place) => placeName(place).toLowerCase() === q);
    if (!exact && query.length >= 2 && hasRoom()) {
      const custom = makeCustomPlace(query);
      results.append(
        h(
          'button',
          { class: 'place-row is-custom', type: 'button', onClick: () => addPlace(custom) },
          h('span', { class: 'place-row-swatch', style: { background: skyGradient(custom.sky) } }),
          h(
            'span',
            { class: 'place-row-text' },
            h('span', { class: 'place-row-name', text: `Add “${custom.name}”` }),
            h('span', {
              class: 'place-row-sub',
              text: pick('Wherever that is, it is probably awkward there too.', 'Add this location'),
            }),
          ),
          h('span', { class: 'place-row-action', html: ui.plus }),
        ),
      );
    } else if (!matches.length) {
      results.append(
        h('p', {
          class: 'places-empty',
          text: hasRoom()
            ? pick('Keep typing. Any situation will do.', 'No results.')
            : `That is ${LIMIT}. Remove one to add another.`,
        }),
      );
    }
  }

  function render() {
    clear(saved);
    list.forEach((place, i) => {
      const forecast = buildForecast(place);
      saved.append(
        h(
          'div',
          { class: `place-card${i === current ? ' is-current' : ''}`, style: { background: skyGradient(place.sky) } },
          h(
            'button',
            {
              class: 'place-main',
              type: 'button',
              onClick: () => {
                onPick(i);
                sheet.close();
              },
            },
            h(
              'span',
              { class: 'place-left' },
              h('span', { class: 'place-name', text: placeName(place) }),
              h('span', {
                class: 'place-where',
                text: pick(
                  place.where,
                  i === 0 ? 'My Location' : new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                ),
              }),
              h('span', { class: 'place-cond', text: placeCondition(place) }),
            ),
            h(
              'span',
              { class: 'place-right' },
              h('span', { class: 'place-temp', text: degrees(forecast.temp) }),
              h('span', { class: 'place-range', text: `H:${degrees(forecast.hi)}  L:${degrees(forecast.lo)}` }),
            ),
          ),
          list.length > 1
            ? h('button', {
                class: 'place-remove',
                type: 'button',
                'aria-label': `Remove ${placeName(place)}`,
                html: ui.minus,
                onClick: () => removePlace(place),
              })
            : null,
        ),
      );
    });

    clear(more);
    const rest = CATALOG.filter((place) => !isSaved(place.id));
    if (rest.length) {
      more.append(
        h('p', { class: 'section-label', text: pick('More situations', 'Suggested') }),
        h('div', { class: 'place-rows' }, rest.map((place) => catalogRow(place))),
      );
    }
    if (!hasRoom()) {
      more.append(h('p', { class: 'sheet-note', text: `That is ${LIMIT}. Remove one to add another.` }));
    }
    renderResults();
  }

  input.addEventListener('input', renderResults);

  const sheet = openSheet({
    title: pick('Situations', 'Weather'),
    className: 'is-tall wx-places',
    body: [
      h('div', { class: 'places-top' }, h('label', { class: 'places-search' }, h('span', { html: ui.search }), input), editButton),
      results,
      saved,
      more,
      h(
        'div',
        { class: 'places-unit' },
        h('span', { text: 'Temperature' }),
        segmented(
          [
            { value: 'F', label: '°F' },
            { value: 'C', label: '°C' },
          ],
          settings.unit,
          (value) => {
            setSetting('unit', value);
            render();
          },
          { label: 'Temperature unit' },
        ),
      ),
    ],
  });

  render();
}
