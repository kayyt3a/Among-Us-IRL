import { NUMBER_LOCK_MAX } from './types';

/**
 * The keypad size for a lock with `players` people: 1 to 15 in small games,
 * growing with the player count (always 5 spare numbers) up to
 * NUMBER_LOCK_MAX, so there are always enough different numbers to go round
 * without a huge keypad in a small game.
 */
export function numberLockMaxFor(players: number): number {
  return Math.min(NUMBER_LOCK_MAX, Math.max(15, players + 5));
}

/**
 * The smallest and largest totals `players` people can make by each entering
 * a different number from 1 to numberLockMaxFor(players).
 */
export function numberLockRange(players: number): { min: number; max: number } {
  const top = numberLockMaxFor(players);
  const n = Math.max(1, Math.min(players, top));
  const min = (n * (n + 1)) / 2;
  const max = n * top - (n * (n - 1)) / 2;
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
