import { NUMBER_LOCK_MAX } from './types';

/**
 * The smallest and largest totals `players` people can make by each entering
 * a different number from 1 to NUMBER_LOCK_MAX.
 */
export function numberLockRange(players: number): { min: number; max: number } {
  const n = Math.max(1, Math.min(players, NUMBER_LOCK_MAX));
  const min = (n * (n + 1)) / 2;
  const max = n * NUMBER_LOCK_MAX - (n * (n - 1)) / 2;
  return { min, max };
}

/**
 * A target `players` people can actually hit. Where possible it's also
 * reachable with one fewer player, so a single kill mid-sabotage doesn't
 * force a new target, and it's kept within a dozen or so of the minimum so
 * the mental maths stays party-friendly.
 */
export function pickNumberLockTarget(players: number): number {
  const now = numberLockRange(players);
  const oneDown = players > 1 ? numberLockRange(players - 1) : now;
  let low = now.min;
  let high = Math.min(now.max, oneDown.max);
  if (high < low) high = now.max;
  high = Math.min(high, low + 12);
  // Never the bare minimum: 1 + 2 + 3... is too easy to be a puzzle.
  if (high > low + 2) low += 2;
  return low + Math.floor(Math.random() * (high - low + 1));
}
