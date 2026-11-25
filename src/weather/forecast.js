// Turns a situation into the numbers a weather app shows: hourly strip, 10-day list,
// and a 24-hour curve for each metric. Seeded, so a place looks the same all day.

import { clamp } from '../lib/dom.js';
import { seeded, smoothNoise } from '../lib/rng.js';
import { pick, settings, state } from '../lib/store.js';
import { CATALOG, makeCustomPlace, SKIES } from './situations.js';

// --------------------------------------------------------------- the places

/** Saved places in order, resolving ids against the catalog and any custom ones. */
export function savedPlaces() {
  const custom = new Map(state.weather.custom.map((entry) => [entry.id, entry]));
  const places = [];
  for (const id of state.weather.places) {
    const builtIn = CATALOG.find((place) => place.id === id);
    if (builtIn) places.push(builtIn);
    else if (custom.has(id)) places.push(makeCustomPlace(custom.get(id).name));
  }
  return places.length ? places : [CATALOG[0]];
}

export const placeName = (place) => pick(place.name, place.city);
export const placeCondition = (place) => pick(place.cond, SKIES[place.sky].legit);

/** The sentence at the top of the hourly card. */
export function summaryText(place) {
  const wind = place.cards.air[0];
  const lead = `${SKIES[place.sky].adjective} conditions will continue for the rest of the day.`;
  return pick(place.summary, wind >= 12 ? `${lead} Wind gusts are up to ${Math.round(wind * 1.5 + 3)} mph.` : lead);
}

// ------------------------------------------------------------------- units

export const toUnit = (fahrenheit) => (settings.unit === 'C' ? ((fahrenheit - 32) * 5) / 9 : fahrenheit);
export const degrees = (fahrenheit) => `${Math.round(toUnit(fahrenheit))}°`;

// -------------------------------------------------------------------- time

const hourLabel = (hour) => {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'AM' : 'PM'}`;
};

export const clockLabel = (decimalHour) => {
  const h = Math.floor(decimalHour);
  const m = Math.round((decimalHour - h) * 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h < 12 ? 'AM' : 'PM'}`;
};

/** Rough sunrise and sunset (decimal hours) for a mid-latitude city on this date. */
export function sunTimes(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86_400_000);
  const season = Math.sin(((dayOfYear - 80) / 365) * Math.PI * 2);
  return { sunrise: 6.1 - season * 1.15, sunset: 18.1 + season * 1.6 };
}

const isNight = (hour, sun) => {
  const h = ((hour % 24) + 24) % 24;
  return h < Math.floor(sun.sunrise) || h > Math.floor(sun.sunset);
};

// ------------------------------------------------------------------- icons

const SKY_ICONS = {
  fog: { day: ['fog', 'fog', 'cloud'], night: ['fog', 'fog', 'cloud'] },
  night: { day: ['cloud-sun', 'sun'], night: ['moon', 'cloud-moon', 'moon'] },
  cloudy: { day: ['cloud', 'cloud-sun', 'cloud'], night: ['cloud', 'cloud-moon'] },
  storm: { day: ['storm', 'rain', 'storm'], night: ['storm', 'rain'] },
  rain: { day: ['drizzle', 'rain', 'cloud'], night: ['drizzle', 'rain', 'cloud'] },
  sunset: { day: ['sun', 'cloud-sun'], night: ['moon', 'cloud-moon'] },
  sunny: { day: ['sun', 'sun', 'cloud-sun'], night: ['moon', 'moon', 'cloud-moon'] },
  wind: { day: ['wind', 'cloud', 'wind'], night: ['wind', 'cloud-moon'] },
  snow: { day: ['snow', 'cloud', 'snow'], night: ['snow', 'cloud'] },
  hot: { day: ['sun', 'sun'], night: ['moon'] },
  stars: { day: ['sun', 'cloud-sun'], night: ['moon', 'moon'] },
  overcast: { day: ['cloud', 'cloud'], night: ['cloud', 'cloud'] },
};
const WET = new Set(['rain', 'drizzle', 'storm', 'snow']);

// ---------------------------------------------------------------- forecast

const dayCurve = (hour) => 0.5 - 0.5 * Math.cos(((hour - 3) / 24) * Math.PI * 2); // coolest 3AM, warmest 3PM
const swingOf = (place) => (place.swing == null ? 4 : place.swing);

/**
 * buildForecast(place, refreshes) -> { temp, hi, lo, hourly[], daily[], range: { min, max } }
 * `refreshes` nudges the current temperature by a degree at most, so pulling to refresh
 * feels alive while changing nothing that matters.
 */
export function buildForecast(place, refreshes = 0) {
  const now = new Date();
  const hour = now.getHours();
  const sun = sunTimes(now);
  const rand = seeded(`${place.id}:${now.toDateString()}`);
  const jitter = swingOf(place) && refreshes ? seeded(`${place.id}:r${refreshes}`).int(-1, 1) : 0;
  const temp = clamp(place.temp + jitter, place.lo, place.hi);
  const spread = place.hi - place.lo;
  const icons = SKY_ICONS[place.sky];
  const wobble = smoothNoise(`${place.id}:hours`);

  const hourly = [];
  for (let i = 0; i < 25; i++) {
    const h = hour + i;
    const night = isNight(h, sun);
    const set = night ? icons.night : icons.day;
    const icon = i === 0 ? set[0] : set[Math.floor(rand() * set.length)];
    const curved = temp + (dayCurve(h) - dayCurve(hour)) * spread + (wobble(i / 2.5) - 0.5) * Math.min(spread, 3);
    hourly.push({
      label: i === 0 ? 'Now' : hourLabel(h),
      icon,
      temp: i === 0 ? temp : clamp(Math.round(curved), place.lo, place.hi),
      pop: WET.has(icon) ? clamp(Math.round((40 + rand() * 50) / 10) * 10, 30, 90) : 0,
    });
    // Sunrise and sunset get their own slot, as they do in every weather app.
    const wrapped = h % 24;
    for (const [key, at] of [
      ['sunrise', sun.sunrise],
      ['sunset', sun.sunset],
    ]) {
      if (Math.floor(at) === wrapped && i < 24) {
        hourly.push({ label: clockLabel(at), icon: key, event: key === 'sunrise' ? 'Sunrise' : 'Sunset' });
      }
    }
  }

  const swing = swingOf(place);
  const trend = smoothNoise(`${place.id}:days`);
  const daily = [];
  for (let i = 0; i < 10; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const shift = i === 0 ? 0 : Math.round((trend(i / 2) - 0.5) * swing * 2.4);
    const icon = i === 0 ? icons.day[0] : icons.day[Math.floor(rand() * icons.day.length)];
    daily.push({
      label: i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      icon,
      hi: place.hi + shift + (i && swing ? rand.int(-1, 1) : 0),
      lo: place.lo + shift + (i && swing ? rand.int(-1, 1) : 0),
      pop: WET.has(icon) ? clamp(Math.round((35 + rand() * 55) / 10) * 10, 30, 90) : 0,
    });
  }
  const range = {
    min: Math.min(...daily.map((d) => d.lo)),
    max: Math.max(...daily.map((d) => d.hi)),
  };
  // A flat forecast (the elevator) still needs a bar to draw.
  if (range.max - range.min < 4) {
    range.min -= 2;
    range.max += 2;
  }
  // Where the sun sits on the little arc in the Sunset card: 0.16..0.84 is above the horizon.
  const clock = hour + now.getMinutes() / 60;
  const daylight = (clock - sun.sunrise) / (sun.sunset - sun.sunrise);
  const sunArc = daylight < 0 ? 0.07 : daylight > 1 ? 0.93 : 0.161 + daylight * 0.678;

  return { temp, hi: place.hi, lo: place.lo, hourly, daily, range, sun, sunArc, sunsetLabel: clockLabel(sun.sunset) };
}

// The ten-day list doubles as the long tail of getting over it. Tap a row to read one.
export const DAY_NOTES = [
  'You are here. Regrettably.',
  'You will think of the perfect thing to say. One day late.',
  'You will replay this in the shower.',
  'Still thinking about it.',
  'A coworker will say “crazy weather, huh.” You will agree.',
  'Clearing. You will have something new to be embarrassed about.',
  'A 3AM flashback advisory is in effect.',
  'You tell this story at brunch and it kills.',
  'Fully recovered, until you see them again.',
  'Long-range models suggest you will be fine.',
];

// ----------------------------------------------------------------- metrics

const UV_LEVELS = [
  [2, 'Low'],
  [5, 'Moderate'],
  [7, 'High'],
  [10, 'Very High'],
  [Infinity, 'Extreme'],
];
export const uvLevel = (value) => UV_LEVELS.find(([max]) => value <= max)[1];

const AQI_LEVELS = [
  [50, 'Good'],
  [100, 'Moderate'],
  [150, 'Unhealthy for Sensitive Groups'],
  [200, 'Unhealthy'],
  [Infinity, 'Very Unhealthy'],
];
export const aqiLevel = (value) => AQI_LEVELS.find(([max]) => value <= max)[1];

const MOON = [
  [3, 'New Moon'],
  [35, 'Waning Crescent'],
  [65, 'Third Quarter'],
  [96, 'Waning Gibbous'],
  [Infinity, 'Full Moon'],
];
export const moonPhase = (percent) => MOON.find(([max]) => percent <= max)[1];

const BATTERY = [
  [15, 'Critical'],
  [35, 'Low'],
  [65, 'Fair'],
  [Infinity, 'Charged'],
];
export const batteryLevel = (percent) => BATTERY.find(([max]) => percent <= max)[1];

const VISIBILITY = [
  [0.9, 'Poor'],
  [3.9, 'Reduced'],
  [7.9, 'Good'],
  [Infinity, 'Excellent'],
];
export const visLevel = (miles) => VISIBILITY.find(([max]) => miles <= max)[1];

const TREND = { up: 'Rising', down: 'Falling', steady: 'Steady' };
export const trendWord = (trend) => TREND[trend] || 'Steady';

/**
 * One entry per card. `joke` and `legit` are the two faces of the same card;
 * `about` is the deadpan explainer shown in the detail sheet.
 */
export const METRICS = {
  temp: {
    icon: 'thermo',
    joke: 'Temperature',
    legit: 'Temperature',
    about: [
      'The actual temperature, which has very little to do with how warm your face feels right now.',
      'The air temperature measured in the shade, about two meters above the ground.',
    ],
  },
  eye: {
    icon: 'eye',
    legitIcon: 'sun',
    joke: 'Eye Contact',
    legit: 'UV Index',
    about: [
      'The Eye Contact Index measures the risk of accidentally locking eyes with another person. At 8 or above, look at your phone. You are already doing this.',
      'The World Health Organization’s UV Index measures ultraviolet radiation. The higher the number, the faster skin and eyes can be damaged.',
    ],
  },
  exit: {
    icon: 'door',
    legitIcon: 'sunset',
    joke: 'Polite Exit',
    legit: 'Sunset',
    about: [
      'Polite Exit is the earliest moment you can leave without it becoming a whole thing. It is calculated from your arrival time, the host’s line of sight, and whether you have been seen eating.',
      'Sunset is when the upper edge of the sun disappears below the horizon. Twilight continues for roughly half an hour after.',
    ],
  },
  air: {
    icon: 'wind',
    joke: 'Hot Air',
    legit: 'Wind',
    about: [
      'Hot Air tracks the speed and direction of whoever is currently talking. Sustained speeds above 20 mph indicate a story with no ending.',
      'Wind speed is averaged over a short period. Gusts are sudden, brief increases above that average.',
    ],
  },
  talk: {
    icon: 'chat',
    legitIcon: 'drop',
    joke: 'Small Talk',
    legit: 'Precipitation',
    about: [
      'The chance that small talk will fall on you within the hour. Looking at a weather app reduces it by up to 60 percent, which is why you are here.',
      'The chance of measurable precipitation at this location during the given hour.',
    ],
  },
  feels: {
    icon: 'thermo',
    joke: 'Feels Like',
    legit: 'Feels Like',
    about: [
      'Feels Like adjusts the actual temperature for how aware you are of your own arms.',
      'Feels Like conveys how warm or cold it feels once humidity and wind are taken into account.',
    ],
  },
  palm: {
    icon: 'hand',
    legitIcon: 'drop',
    joke: 'Palm Humidity',
    legit: 'Humidity',
    about: [
      'The moisture of your palms, expressed as a percentage of a handshake you would apologize for.',
      'Relative humidity is the amount of moisture in the air compared with what the air can hold at this temperature.',
    ],
  },
  vis: {
    icon: 'visibility',
    joke: 'Visibility',
    legit: 'Visibility',
    about: [
      'How far away someone can spot you and start walking over.',
      'Visibility is how far away you can clearly see an object. It is reduced by fog, haze and precipitation.',
    ],
  },
  pressure: {
    icon: 'gauge',
    joke: 'Social Pressure',
    legit: 'Pressure',
    about: [
      'Social pressure is measured in inches of mercury because nobody has ever questioned it. Rising pressure means someone is about to ask you something.',
      'Significant, rapid changes in pressure are used to predict changes in the weather. Falling pressure often means rain is on the way.',
    ],
  },
  aqi: {
    icon: 'lungs',
    joke: 'Air Quality',
    legit: 'Air Quality',
    about: [
      'A composite of cologne, reheated food and tension. Above 100, breathe through your phone.',
      'The Air Quality Index reports how clean or polluted the air is, on a scale from 0 to 500.',
    ],
  },
  battery: {
    icon: 'battery',
    legitIcon: 'moon',
    joke: 'Social Battery',
    legit: 'Moon',
    about: [
      'Your remaining capacity to act delighted. It does not recharge in company.',
      'Illumination is the share of the moon’s visible face that is lit by the sun tonight.',
    ],
  },
};

export const metricLabel = (key) => pick(METRICS[key].joke, METRICS[key].legit);
export const metricIcon = (key) => pick(METRICS[key].icon, METRICS[key].legitIcon || METRICS[key].icon);
export const metricAbout = (key) => pick(METRICS[key].about[0], METRICS[key].about[1]);

/** The straight-faced sentence for a card, used when the jokes are hidden. */
export function legitLine(place, key, forecast) {
  const c = place.cards;
  switch (key) {
    case 'eye': {
      const v = c.eye[0];
      if (v <= 2) return 'Low for the rest of the day.';
      if (v <= 5) return 'Use sun protection until 4PM.';
      return 'Use sun protection 9AM to 5PM.';
    }
    case 'exit':
      return `Sunrise: ${clockLabel(forecast.sun.sunrise)}`;
    case 'air':
      return c.air[0] < 2 ? 'Calm conditions.' : `Gusts up to ${Math.round(c.air[0] * 1.5 + 3)} mph.`;
    case 'talk':
      return c.talk[0] >= 60 ? 'Rain is expected through the evening.' : 'Light rain is possible later today.';
    case 'feels': {
      const delta = c.feels[0] - place.temp;
      if (delta > 3) return 'Humidity is making it feel warmer.';
      if (delta < -3) return 'Wind is making it feel cooler.';
      return 'Similar to the actual temperature.';
    }
    case 'palm':
      return `The dew point is ${degrees(place.temp - (100 - c.palm[0]) / 5)} right now.`;
    case 'vis':
      return c.vis[0] >= 6 ? 'Perfectly clear view.' : c.vis[0] >= 2 ? 'Light haze is reducing visibility.' : 'Fog is reducing visibility.';
    case 'pressure':
      return `${trendWord(c.pressure[1])} over the last three hours.`;
    case 'aqi':
      return `Air quality index is ${c.aqi[0]}, similar to yesterday at about this time.`;
    case 'battery':
      return `Illumination ${c.battery[0]}%. Next full moon in ${Math.max(2, Math.round((100 - c.battery[0]) / 7))} days.`;
    default:
      return '';
  }
}

export const cardLine = (place, key, forecast) => {
  const values = place.cards[key];
  return pick(values[values.length - 1], legitLine(place, key, forecast));
};

// ---------------------------------------------------- 24-hour detail curves

const SERIES = {
  temp: { unit: '°', min: -20, max: 130 },
  eye: { unit: '', min: 0, max: 11, noise: 3 },
  talk: { unit: '%', min: 0, max: 100, noise: 34 },
  air: { unit: ' mph', min: 0, max: 80, noise: 9 },
  feels: { unit: '°', min: -20, max: 140 },
  palm: { unit: '%', min: 5, max: 100, noise: 18 },
  vis: { unit: ' mi', min: 0, max: 10, noise: 3, digits: 1 },
  pressure: { unit: ' inHg', min: 28.5, max: 32.5, noise: 0.5, digits: 2 },
  aqi: { unit: '', min: 0, max: 300, noise: 46 },
  battery: { unit: '%', min: 1, max: 100 },
  exit: { unit: '%', min: 0, max: 100 },
};

const baseValue = (place, key) => (key === 'temp' ? place.temp : place.cards[key][0]);

/**
 * series(place, key, dayIndex) -> { values: number[24], nowIndex }
 * Hour 0 is midnight. Today's curve passes through the card's value at the current hour.
 */
export function series(place, key, dayIndex = 0) {
  const info = SERIES[key];
  const hourNow = new Date().getHours();
  const base = typeof baseValue(place, key) === 'number' ? baseValue(place, key) : 0;
  const noise = smoothNoise(`${place.id}:${key}:${dayIndex}`);
  const drift = dayIndex ? (smoothNoise(`${place.id}:${key}:drift`)(dayIndex * 1.7) - 0.5) * (info.noise || 6) : 0;
  const values = [];
  for (let h = 0; h < 24; h++) {
    let v;
    if (key === 'temp' || key === 'feels') {
      const spread = Math.max(place.hi - place.lo, swingOf(place) ? 2 : 0);
      v = base + (dayCurve(h) - dayCurve(hourNow)) * spread + drift;
    } else if (key === 'exit') {
      // Joke: the odds of slipping out unnoticed, which improve as the night wears on.
      // Straight: how high the sun is, as a share of its midday peak.
      const sun = sunTimes();
      const daylight = Math.max(0, Math.sin(((h - sun.sunrise) / (sun.sunset - sun.sunrise)) * Math.PI)) * 100;
      const getaway = 100 / (1 + Math.exp(-(h - 19.5 + dayIndex * 0.4) * 0.75)) + (noise(h / 2.6) - 0.5) * 10;
      v = pick(getaway, daylight);
    } else if (key === 'battery') {
      // Charged in the morning, spent by night. Every day. No exceptions.
      const startOfDay = clamp(base + 34 + hourNow * 1.4, base, 100);
      const t = clamp((h - 7) / 16, 0, 1);
      const endOfDay = Math.max(2, base - (23 - hourNow) * 1.2);
      v = h < 7 ? startOfDay : startOfDay + (endOfDay - startOfDay) * t ** 0.85;
      if (dayIndex === 0) v += base - (startOfDay + (endOfDay - startOfDay) * clamp((hourNow - 7) / 16, 0, 1) ** 0.85);
    } else {
      const amount = (noise(h / 2.6) - 0.5) * 2 * info.noise;
      const anchor = dayIndex === 0 ? (noise(hourNow / 2.6) - 0.5) * 2 * info.noise : 0;
      v = base + amount - anchor + drift;
    }
    values.push(clamp(v, info.min, info.max));
  }
  return { values, nowIndex: dayIndex === 0 ? hourNow : -1 };
}

export function formatValue(key, value) {
  const info = SERIES[key];
  if (key === 'temp' || key === 'feels') return degrees(value);
  if (info.digits) return `${value.toFixed(info.digits)}${info.unit}`;
  return `${Math.round(value)}${info.unit}`;
}
