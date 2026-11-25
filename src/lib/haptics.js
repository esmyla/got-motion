import { settings } from './store.js';

export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** A very short buzz on phones that allow it. Silent everywhere else. */
export function tick(ms = 6) {
  if (!canVibrate || !settings.haptics) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* some browsers throw before the first user gesture */
  }
}
