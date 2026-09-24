export const DEFAULT_TASKS_PER_PLAYER = 5;
export const MIN_TASKS_PER_PLAYER = 3;
export const MAX_TASKS_PER_PLAYER = 8;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 15;

export const MEETING_DISCUSSION_MS = 60_000;
export const MEETING_VOTING_MS = 30_000;

export const VENT_WINDOW_MS = 20_000; // how long vent stays available after a kill
export const VENT_DURATION_MS = 4_000; // how long the blackout lasts on every screen

export const KILL_COOLDOWN_MS = 45_000; // how long a killer waits before they can strike again

export const MAX_MEETINGS_PER_PLAYER = 1; // emergency meetings each player gets per game
export const MEETING_COOLDOWN_MS = 20_000; // how long after a meeting ends before another can be called

// The shared game clock: crew must finish tasks / catch the impostors before
// it runs out, or the impostors win by default. Sabotage cuts it down.
export const GAME_DURATION_MS = 20 * 60 * 1000;
export const SABOTAGE_MAX_USES = 3;
// Cooldown starts once a sabotage is solved (stopped), not when it's triggered.
export const SABOTAGE_COOLDOWN_MS = 45_000;
// While a sabotage puzzle is unsolved, the clock drains at this many extra
// seconds per real second, on top of the normal 1x tick — 0.5 extra makes the
// total drain rate 1.5x. Applied in small ticks so every client watches it happen live.
export const SABOTAGE_EXTRA_DRAIN_RATE = 0.5;
export const SABOTAGE_DRAIN_TICK_MS = 500;

export const ROOM_IDLE_CLEANUP_MS = 4 * 60 * 60 * 1000; // sweep rooms idle for 4h
