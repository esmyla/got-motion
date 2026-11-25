// Seeded randomness, so a "forecast" stays put between visits instead of reshuffling.

export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 with a few conveniences hung off the function. */
export function seeded(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
}

/** Unseeded helpers for things that should differ every time (coach lines, mash scripts). */
export const random = {
  range: (lo, hi) => lo + Math.random() * (hi - lo),
  int: (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)),
  pick: (list) => list[Math.floor(Math.random() * list.length)],
  chance: (p) => Math.random() < p,
};

/** Returns a function that deals items in shuffled order and never repeats back to back. */
export function shuffleBag(items) {
  let pile = [];
  let last = null;
  return () => {
    if (!pile.length) {
      pile = items.slice();
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      if (pile.length > 1 && pile[pile.length - 1] === last) {
        [pile[0], pile[pile.length - 1]] = [pile[pile.length - 1], pile[0]];
      }
    }
    last = pile.pop();
    return last;
  };
}

/** Smooth 1D value noise in [0, 1], for curves that should look measured rather than random. */
export function smoothNoise(seed) {
  const rand = seeded(seed);
  const table = Array.from({ length: 64 }, () => rand());
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[((i % 64) + 64) % 64];
    const b = table[(((i + 1) % 64) + 64) % 64];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}
