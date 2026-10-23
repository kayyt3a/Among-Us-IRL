export const DEFAULT_TASKS_PER_PLAYER = 5;
export const MIN_TASKS_PER_PLAYER = 3;
export const MAX_TASKS_PER_PLAYER = 8;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 50;
/** Room updates within this window are bundled into one send per room. Short enough that nobody notices. */
export const ROOM_UPDATE_BATCH_MS = 40;


// Vent and kill are both available the instant a round starts; each only
// goes on cooldown after its own first use, independently of the other.
export const VENT_COOLDOWN_MS = 45_000;
export const VENT_DURATION_MS = 4_000; // how long the blackout lasts on every screen


export const MAX_MEETINGS_PER_PLAYER = 1; // emergency meetings each player gets per game
export const MEETING_COOLDOWN_MS = 20_000; // how long after a meeting ends before another can be called

// The shared game clock: crew must finish tasks / catch the impostors before
// it runs out, or the impostors win by default. Sabotage cuts it down.
export const SABOTAGE_MAX_USES = 3;
// Cooldown starts once a sabotage is solved (stopped), not when it's triggered.
export const SABOTAGE_COOLDOWN_MS = 45_000;
// While a sabotage puzzle is unsolved, the clock drains at this many extra
// seconds per real second, on top of the normal 1x tick. 0.5 extra makes the
// total drain rate 1.5x. Applied in small ticks so every client watches it happen live.
export const SABOTAGE_EXTRA_DRAIN_RATE = 0.5;
export const SABOTAGE_DRAIN_TICK_MS = 500;

export const ROOM_IDLE_CLEANUP_MS = 4 * 60 * 60 * 1000; // sweep rooms idle for 4h

// Task-proof photos are downscaled client-side before they're sent, but this
// caps how much of a data URL string the server will hold per photo, so a
// stray oversized upload can't balloon a room's in-memory footprint.
export const MAX_TASK_PHOTO_CHARS = 500_000;

// Abuse protection. Generous on purpose: a whole campus can share one IP.
export const MAX_SOCKET_MESSAGE_BYTES = 640_000; // a bit above the biggest photo, so oversized uploads get cut off early
export const MAX_ROOMS = 500;
export const MAX_CONNECTIONS_PER_IP = 120;
export const ROOM_CREATES_PER_IP_PER_MINUTE = 10;
export const FAILED_JOINS_PER_IP_PER_MINUTE = 20; // wrong room codes, so codes can't be brute-forced
export const SOCKET_EVENT_BURST = 40; // events a single connection can send at once
export const SOCKET_EVENTS_PER_SECOND = 15; // sustained, far above any real player
export const MAX_ROOM_PHOTO_CHARS = 25_000_000; // about 25 MB of photos per room per round
export const MAX_TOTAL_PHOTO_CHARS = 150_000_000; // across every room, to stay inside a small server's memory
export const ROOM_EMPTY_CLEANUP_MS = 15 * 60 * 1000; // a room nobody is connected to is dropped after 15 min

// Game clock, meeting and kill cooldown lengths are host settings now: see TIMER_LIMITS in shared.
export const REPORT_RETRY_MS = 15_000; // wait after a report that didn't point at an unfound body
