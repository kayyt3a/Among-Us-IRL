export type RoomType =
  | 'kitchen'
  | 'bathroom'
  | 'living-room'
  | 'bedroom'
  | 'outdoor'
  | 'any-room';

export interface Task {
  id: string;
  room: RoomType;
  text: string;
}

export interface PlayerTask {
  taskId: string;
  text: string;
  room: RoomType;
  done: boolean;
}

export type PlayerRole = 'crewmate' | 'impostor';
export type PlayerStatus = 'alive' | 'dead';
export type GamePhase = 'lobby' | 'playing' | 'meeting' | 'ended';
export type MeetingReason = 'report' | 'emergency';
export type MeetingPhase = 'discussion' | 'voting' | 'results';

/** Public player info sent to everyone (no role, no tasks). */
export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  /** Only meaningful once game has ended or player is revealed. */
  status: PlayerStatus;
}

/** Private payload sent only to the owning player's socket. */
export interface PrivateGameInfo {
  role: PlayerRole;
  tasks: PlayerTask[];
  /** Other impostors, only populated for impostors when there is more than one. */
  fellowImpostors?: { id: string; name: string }[];
}

export interface RoomSettings {
  tasksPerPlayer: number;
  impostorCount: number;
  /** Where players agree to physically gather when a meeting is called. Required to start. */
  meetingSpot: string;
}

export interface MeetingVoteTally {
  targetId: string | 'skip';
  count: number;
}

export interface MeetingState {
  calledBy: string;
  calledByName: string;
  reason: MeetingReason;
  phase: MeetingPhase;
  discussionEndsAt: number;
  votingEndsAt: number;
  /** Ids of players who have already cast a vote (not who they voted for). */
  votedPlayerIds: string[];
}

export interface MeetingResult {
  eliminatedId: string | null;
  eliminatedName: string | null;
  eliminatedRole: PlayerRole | null;
  tally: MeetingVoteTally[];
  wasTie: boolean;
}

export interface GameOverInfo {
  winner: 'crewmates' | 'impostors';
  players: { id: string; name: string; role: PlayerRole; status: PlayerStatus }[];
}

export interface RoomStateSummary {
  code: string;
  phase: GamePhase;
  settings: RoomSettings;
  players: PublicPlayer[];
  meeting: MeetingState | null;
  ventAvailable: boolean;
  ventEndsAt: number | null;
}

// ---- Socket.IO event payloads ----

export interface ServerToClientEvents {
  room_update: (state: RoomStateSummary) => void;
  joined: (payload: { playerId: string; code: string }) => void;
  game_started: (payload: PrivateGameInfo) => void;
  task_ack: (payload: { taskId: string }) => void;
  you_died: () => void;
  kill_result: (payload: { ok: boolean; message?: string }) => void;
  /** Sent only to the killer: start emitting this tone for windowMs. */
  kill_listen_start: (payload: { frequencyHz: number; windowMs: number }) => void;
  /** Sent only to the killer: how the attempt resolved. */
  kill_attempt_result: (payload: { ok: boolean; instant?: boolean; reason?: string }) => void;
  /** Sent only to the intended target: silently start listening for a matching tone. No UI should react to this. */
  begin_proximity_scan: (payload: { windowMs: number; candidateFrequencies: number[] }) => void;
  vent_triggered: (payload: { durationMs: number }) => void;
  meeting_called: (payload: MeetingState) => void;
  meeting_phase_changed: (payload: MeetingState) => void;
  meeting_result: (payload: MeetingResult) => void;
  game_over: (payload: GameOverInfo) => void;
  error_message: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  create_room: (
    payload: { name: string },
    cb: (res: { ok: true; code: string; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  join_room: (
    payload: { code: string; name: string },
    cb: (res: { ok: true; code: string; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  rejoin_room: (
    payload: { code: string; playerId: string },
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  update_settings: (payload: Partial<RoomSettings>) => void;
  start_game: () => void;
  complete_task: (payload: { taskId: string }) => void;
  /** Honor-code instant kill — no proximity check. Used as the fallback when the audio handshake fails or is unavailable. */
  kill_player: (payload: { targetId: string }) => void;
  /** Starts a proximity-verified kill attempt on a target. */
  attempt_kill: (payload: { targetId: string }) => void;
  cancel_kill_attempt: () => void;
  /** Sent by the target's client when it hears a matching tone. */
  tone_detected: (payload: { frequencyHz: number }) => void;
  report_mic_status: (payload: { available: boolean }) => void;
  trigger_vent: () => void;
  call_meeting: (payload: { reason: MeetingReason }) => void;
  cast_vote: (payload: { targetId: string | 'skip' }) => void;
  play_again: () => void;
}
