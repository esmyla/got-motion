// Mash mode: whatever key you hit, the calculator types the next key of one of these.
// Each script is a believable little calculation with a caption that only makes sense up close.
// Numbers are re-rolled every time, and the results are really computed by the engine.

import { random, shuffleBag } from '../lib/rng.js';

const { int, pick } = random;
const money = (lo, hi) => random.range(lo, hi).toFixed(2);

// Compact notation -> key ids. Digits, ".", "(", ")", "%" and "=" pass through.
const KEYMAP = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '^': 'xʸ',
  q: 'x²',
  r: '√',
  '!': 'x!',
  p: 'π',
  s: 'sin',
  c: 'cos',
  t: 'tan',
  l: 'ln',
  g: 'log',
  C: 'AC',
};
const toKeys = (text) => [...text].map((ch) => KEYMAP[ch] || ch);

// Each entry returns steps of [keys, caption]. A step that starts with an operator
// carries on from the previous answer, the way a person would.
const BASIC = [
  () => {
    const n = int(4, 9);
    return [[`${money(96, 420)}/${n}=`, `Dinner, split ${n} ways. Kyle had the lobster.`]];
  },
  () => [
    [`${money(4.25, 7.95)}*365=`, 'Annual latte spend. Do not show anyone.'],
    ['/12=', 'Per month. Still bad.'],
  ],
  () => [
    [`${int(1, 4)}*24+${int(1, 9)}=`, 'Hours until Friday at five.'],
    ['*60=', 'In minutes. That did not help.'],
  ],
  () => [[`${int(1150, 2900)}/${int(3100, 6400)}*100=`, 'Rent as a percent of income. They recommend 30.']],
  () => [[`${int(22, 41)}*7=`, 'My age in dog years. I feel it.']],
  () => [[`${money(180, 640)}/${int(2, 4)}=`, 'Cost per wear of the leather jacket.']],
  () => [[`${int(9, 38)}*2.5=`, 'Feet to the exit, at 2.5 feet per step.']],
  () => [
    [
      `${money(9.99, 17.99)}+${money(4.99, 11.99)}+${money(12.99, 22.99)}+${money(5.99, 14.99)}=`,
      'Subscriptions I forgot to cancel.',
    ],
    ['*12=', 'Per year. For things I do not watch.'],
  ],
  () => [[`${money(38, 164)}*0.2=`, 'A 20% tip, calculated visibly so everyone knows.']],
  () => [[`24-${int(15, 18)}.${pick(['25', '5', '75'])}=`, 'Hours of sleep if I leave right now.']],
  () => [[`${int(150, 190)}*${int(12, 48)}=`, 'Words Greg has said so far. Estimated.']],
  () => [[`8*${int(2, 4)}/${int(3, 6)}=`, 'Slices per person. Someone had five.']],
  () => [[`${int(385, 925)}000*0.0${int(61, 74)}/12=`, 'Monthly interest on a house I toured once.']],
  () => [
    [`(67-${int(23, 44)})*52=`, 'Weeks until retirement.'],
    ['*5=', 'In workdays. I should not have checked.'],
  ],
  () => [[`${int(1200, 9800)}*${int(1200, 9800)}=`, 'Two large numbers, multiplied. No reason.']],
  () => [[`${int(12, 34)}*${money(1.5, 4.5)}=`, 'Minutes of phone battery left to hide behind.']],
  () => [[`${money(14, 31)}*${pick(['1.8', '2.3', '3.1'])}=`, 'Cost of a ride home right now. Worth it.']],
  () => [[`3*${int(8, 12)}*${int(15, 45)}=`, 'Pounds lifted today. Includes the water bottle.']],
  () => [[`${int(2400, 18800)}+${int(12, 96)}=`, 'Unread emails, updated.']],
  () => [[`140*${int(4, 9)}=`, 'Calories in the free breadsticks so far.']],
  () => [
    [`${int(6, 14)}*${int(38, 95)}*${pick(['1', '1.5', '2'])}=`, 'What this meeting costs in salaries.'],
    ['*52=', 'Per year, for the weekly version of it.'],
  ],
  () => [[`1/${int(28, 64)}*100=`, 'Percent of this party I actually know.']],
  () => [[`${int(11, 19)}*${int(14, 26)}=`, 'Ceiling tiles in this room. I counted two sides.']],
  () => [[`${int(3, 9)}*60+${int(10, 55)}=`, 'Seconds since anyone here spoke to me.']],
  () => [[`${money(60, 150)}*2-${int(40, 120)}=`, 'Wedding gift, minus what the plate is worth.']],
  () => [[`${int(6, 11)}*${int(180, 320)}=`, 'Steps saved by leaving through the kitchen.']],
  () => [[`365*${int(2, 6)}+${int(20, 300)}=`, 'Days since I said I would start Monday.']],
  () => [[`${money(18, 42)}+${money(6, 14)}+${money(3, 9)}=`, 'What I owe on Venmo. Requested twice.']],
  () => [[`${int(40, 95)}/60*${int(18, 34)}=`, 'Miles away I could be by the time this ends.']],
  () => [[`100-${int(61, 93)}=`, 'Percent chance I say something normal next.']],
  () => [[`${int(2, 6)}*${money(11, 16)}+${money(7, 19)}=`, 'Tonight so far. Not counting the coat check.']],
  () => [[`${int(31, 58)}*${int(4, 11)}/${int(2, 5)}=`, 'A number I will now look at seriously.']],
];

// Used some of the time when the extra function keys are showing.
const SCIENTIFIC = [
  () => [[`(${int(12, 31)}q+${int(12, 31)}q)r=`, 'Distance to the door, by Pythagoras.']],
  () => [[`${int(4, 9)}!=`, 'Possible seating orders for this table. All bad.']],
  () => [[`p*${int(5, 9)}q=`, 'Area of the pizza, for fairness.'], [`/${int(3, 7)}=`, 'Square inches each. I am owed two.']],
  () => [[`${int(52, 74)}t*${int(8, 22)}=`, 'Height of that guy, by trigonometry.']],
  () => [
    [`1.07^${int(12, 38)}=`, 'What one dollar becomes if I had started investing.'],
    [`*${int(2, 9)}000=`, 'With real money. Painful.'],
  ],
  () => [[`${int(200, 9800)}r=`, 'A square root, for the look of it.']],
  () => [[`2^${int(10, 24)}=`, 'Times I have refreshed my email today. Roughly.']],
  () => [[`${int(2, 9)}00l*${int(3, 12)}=`, 'A natural logarithm. Nobody will ask.']],
  () => [[`${int(15, 75)}s*${int(40, 180)}=`, 'The angle of my lean toward the exit, times something.']],
  () => [[`(${int(3, 9)}+${int(2, 8)})q/p=`, 'This one has pi in it, so it looks important.']],
];

const nextBasic = shuffleBag(BASIC);
const nextScientific = shuffleBag(SCIENTIFIC);

/** -> { steps: [{ keys: string[], label: string }] } */
export function nextScript({ scientific = false } = {}) {
  const build = scientific && random.chance(0.5) ? nextScientific() : nextBasic();
  return { steps: build().map(([keys, label]) => ({ keys: toKeys(keys), label })) };
}

const GENERAL_QUIPS = [
  'Looks right.',
  'Confident. Excellent.',
  'Nobody will check this.',
  'Math has occurred.',
  'Correct, probably.',
  'Say “hm” and move on.',
  'A number. Good.',
];
const nextQuip = shuffleBag(GENERAL_QUIPS);

/** A dry remark for a calculation the person actually typed themselves, or null. */
export function quipFor({ value, expr }) {
  if (value === 69) return 'Nice.';
  if (value === 420) return 'Sure. Why not.';
  if ([80085, 58008, 5318008, 8008135].includes(value)) return 'A classic. Now turn the phone upside down.';
  if (value === 42) return 'The answer. The question remains unclear.';
  if (value === 1337) return 'Leet. As the kids said, once.';
  if (value === 0) return 'Zero. Relatable.';
  if (/^\d [+−] \d$/.test(expr)) return 'You opened a calculator for that. Respect.';
  if (Math.abs(value) >= 1e9) return 'A very big number. Nod slowly.';
  if (value < 0) return 'Negative. Like the mood in here.';
  if (!Number.isInteger(value) && String(value).replace(/^-?\d+\./, '').length >= 8) {
    return 'So many decimals. Nobody will check them.';
  }
  return random.chance(0.45) ? nextQuip() : null;
}

export const ERROR_QUIP = 'Undefined. Like your reason for standing here.';
