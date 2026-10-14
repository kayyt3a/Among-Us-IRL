/**
 * Host-adjustable round timings. Shared so the lobby steppers and the
 * server's clamping agree on the same limits.
 */
export interface TimerLimit {
  min: number;
  max: number;
  step: number;
  default: number;
}

export const TIMER_LIMITS = {
  /** Length of the shared game clock, in minutes. */
  gameMinutes: { min: 5, max: 60, step: 5, default: 20 },
  /** Meeting discussion, in seconds. */
  discussionSeconds: { min: 15, max: 180, step: 15, default: 60 },
  /** Meeting vote, in seconds. */
  votingSeconds: { min: 15, max: 120, step: 15, default: 30 },
  /** Impostor kill cooldown after each kill, in seconds. */
  killCooldownSeconds: { min: 15, max: 120, step: 5, default: 45 },
} satisfies Record<string, TimerLimit>;

export type TimerSetting = keyof typeof TIMER_LIMITS;

/** Clamps a host-supplied value onto its allowed range and step. */
export function clampTimer(setting: TimerSetting, value: number): number {
  const { min, max, step } = TIMER_LIMITS[setting];
  const snapped = Math.round(value / step) * step;
  return Math.max(min, Math.min(max, snapped));
}
