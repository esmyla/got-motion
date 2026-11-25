// Weather glyphs, drawn on a 32x32 grid. Two-tone: white cloud, yellow sun, blue rain.

const SUN = '#ffd23f';
const MOON = '#f6e7b4';
const RAIN = '#6cc6ff';
const CLOUD_PATH = 'M9.5 24a5.5 5.5 0 0 1-.9-10.93A7.5 7.5 0 0 1 23 12.6 5.75 5.75 0 0 1 22.75 24z';

const wrap = (body) => `<svg class="wx-icon" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;

const rays = (cx, cy, inner, outer, width = 2.2) => {
  let out = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = (cx + Math.cos(a) * inner).toFixed(2);
    const y1 = (cy + Math.sin(a) * inner).toFixed(2);
    const x2 = (cx + Math.cos(a) * outer).toFixed(2);
    const y2 = (cy + Math.sin(a) * outer).toFixed(2);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  return `<g stroke="${SUN}" stroke-width="${width}" stroke-linecap="round">${out}</g>`;
};

const sun = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUN}"/>${rays(cx, cy, r + 2.6, r + 5.2, r > 5 ? 2.2 : 1.9)}`;
const moon = (transform = '') =>
  `<path transform="${transform}" d="M26 18.500A10.500 10.500 0 1 1 13.500 6a8.840 8.840 0 0 0 12.500 12.500z" fill="${MOON}"/>`;
const cloud = (transform = '', fill = '#fff') => `<path transform="${transform}" d="${CLOUD_PATH}" fill="${fill}"/>`;

const drops = (xs, y1, y2, slant = 1.6) =>
  `<g stroke="${RAIN}" stroke-width="2.200" stroke-linecap="round">${xs
    .map((x) => `<line x1="${x}" y1="${y1}" x2="${x - slant}" y2="${y2}"/>`)
    .join('')}</g>`;

const ICONS = {
  sun: wrap(sun(16, 16, 6)),
  moon: wrap(moon()),
  cloud: wrap(cloud('translate(0 1)')),
  'cloud-sun': wrap(`${sun(11.5, 11.5, 4.4)}${cloud('translate(5.200 7.400) scale(0.800)')}`),
  'cloud-moon': wrap(`${moon('translate(9.500 -1.500) scale(0.620)')}${cloud('translate(1.500 6.500) scale(0.840)')}`),
  rain: wrap(`${cloud('translate(0 -4.500)')}${drops([10.5, 16.5, 22.5], 23.5, 28.5)}`),
  drizzle: wrap(`${cloud('translate(0 -4.500)')}${drops([10.5, 16.5, 22.5], 24, 26.2, 0.7)}`),
  storm: wrap(
    `${cloud('translate(0 -5)', '#e8ecf2')}<path d="M17.200 17.500l-5.200 7h3.800l-1.600 6 6.400-8.200h-4l2.200-4.800z" fill="${SUN}"/>`,
  ),
  snow: wrap(
    `${cloud('translate(0 -4.500)')}<g fill="#fff"><circle cx="10" cy="25.500" r="1.500"/><circle cx="16" cy="27.500" r="1.500"/><circle cx="22" cy="25.500" r="1.500"/></g>`,
  ),
  fog: wrap(
    `<g stroke="#fff" stroke-width="2.400" stroke-linecap="round"><line x1="6" y1="10" x2="22" y2="10" opacity=".65"/><line x1="9" y1="15" x2="27" y2="15"/><line x1="5" y1="20" x2="21" y2="20" opacity=".85"/><line x1="11" y1="25" x2="25" y2="25" opacity=".55"/></g>`,
  ),
  wind: wrap(
    `<g fill="none" stroke="#fff" stroke-width="2.300" stroke-linecap="round"><path d="M4 12h13.500a3.300 3.300 0 1 0-3.100-4.400"/><path d="M4 17.500h20a3.500 3.500 0 1 1-3.300 4.700"/><path d="M4 23h9" opacity=".7"/></g>`,
  ),
  sunset: wrap(
    `<path d="M8.500 22a7.500 7.500 0 0 1 15 0z" fill="#ffb13d"/><g stroke="#fff" stroke-width="2.200" stroke-linecap="round" fill="none"><line x1="4" y1="22" x2="28" y2="22"/><line x1="8" y1="26.500" x2="24" y2="26.500" opacity=".6"/><path d="M16 4.500v6.500M13 8.300l3 3 3-3"/></g>`,
  ),
  sunrise: wrap(
    `<path d="M8.500 22a7.500 7.500 0 0 1 15 0z" fill="#ffb13d"/><g stroke="#fff" stroke-width="2.200" stroke-linecap="round" fill="none"><line x1="4" y1="22" x2="28" y2="22"/><line x1="8" y1="26.500" x2="24" y2="26.500" opacity=".6"/><path d="M16 11.500V5M13 7.700l3-3 3 3"/></g>`,
  ),
};

export const wxIcon = (name) => ICONS[name] || ICONS.cloud;
