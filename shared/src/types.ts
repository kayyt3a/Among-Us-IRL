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
  /** A visual task is something a bystander could actually see you do — a stronger alibi. */
  visual: boolean;
}

export interface PlayerTask {
  taskId: string;
  text: string;
  room: RoomType;
  done: boolean;
  visual: boolean;
  /** True for the one task every player (crew and impostor) is dealt this game. */
  common: boolean;
}

export type PlayerRole = 'crewmate' | 'impostor';
export type PlayerStatus = 'alive' | 'dead';
export type GamePhase = 'lobby' | 'playing' | 'meeting' | 'ended';
export type MeetingReason = 'report' | 'emergency';
export type MeetingPhase = 'discussion' | 'voting' | 'results';
/** Optional extra crewmate roles, layered on top of the base crewmate/impostor split. */
export type SpecialRole = 'judge' | 'guardian-angel' | 'sheriff' | 'engineer';

/** Public player info sent to everyone (no role, no tasks). */
export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  /** Only meaningful once game has ended or player is revealed. */
  status: PlayerStatus;
  /** Joined mid-round — watching this round, will play from the next one. */
  isSpectator: boolean;
  /** Rounds this player has won in this room, across the whole session. */
  wins: number;
}

/** Private payload sent only to the owning player's socket. */
export interface PrivateGameInfo {
  role: PlayerRole;
  tasks: PlayerTask[];
  /** Other impostors, only populated for impostors when there is more than one. */
  fellowImpostors?: { id: string; name: string }[];
  /** Set if this crewmate was dealt the Judge or was the one designated eligible for Guardian Angel. Guardian Angel only activates once they've died. */
  specialRole?: SpecialRole;
}

export interface RoomSettings {
  tasksPerPlayer: number;
  impostorCount: number;
  /** Where players agree to physically gather when a meeting is called. Required to start. */
  meetingSpot: string;
  /** One crewmate can force-eject once during a vote; a wrong call ejects them instead. */
  judgeEnabled: boolean;
  /** The first crewmate to die can shield one living player from the next kill, once. */
  guardianAngelEnabled: boolean;
  /** One crewmate can shoot a suspected impostor once; shooting an innocent kills the Sheriff instead. */
  sheriffEnabled: boolean;
  /** One crewmate can trigger a decoy blackout vent once, for misdirection. */
  engineerEnabled: boolean;
  /** Extra tasks the host typed in, mixed into the pool alongside the built-in ones. */
  customTasks: string[];
  /** If true (default), anyone who joins after a round has started gets dropped in as a crewmate immediately instead of spectating. */
  lateJoinersPlayNow: boolean;
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
  /** Set when the Judge overruled the vote instead of it resolving normally. */
  overruledByName?: string;
  /** Set when the Judge's overrule misfired (target wasn't the impostor) and the Judge was ejected instead. */
  judgeMisfired?: boolean;
}

export interface GameOverInfo {
  winner: 'crewmates' | 'impostors';
  players: { id: string; name: string; role: PlayerRole; status: PlayerStatus }[];
  /** Crewmate task completion at the moment the game ended (a ghost's tasks count too). */
  tasksCompleted: number;
  tasksTotal: number;
  /** How long the match ran for, from start_game to the win. */
  durationMs: number;
}

export interface RoomStateSummary {
  code: string;
  phase: GamePhase;
  settings: RoomSettings;
  players: PublicPlayer[];
  meeting: MeetingState | null;
  ventAvailable: boolean;
  ventEndsAt: number | null;
  /** The shared game clock — when it runs out, the impostors win by default. Null before the game starts. */
  gameEndsAt: number | null;
  /** Aggregate crew task completion, visible to everyone (including the impostor) — same info the classic task bar gives. */
  crewTaskProgress: { done: number; total: number };
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
  /** Impostor-only: current sabotage charges and when the next one is available. */
  sabotage_status: (payload: { usesRemaining: number; availableAt: number }) => void;
  /** Broadcast to everyone the instant a sabotage lands, so the clock jump has a beat to it. */
  sabotage_triggered: () => void;
  /** Sent to a crewmate the moment they become the Guardian Angel (i.e. right after they die, if the role is on). */
  guardian_angel_assigned: () => void;
  /** Private confirmation to the Guardian Angel that their shield just saved someone. */
  guardian_protection_used: () => void;
  /** Result of a Sheriff shot or an Engineer's fake vent, sent only to the player who used it. */
  ability_result: (payload: { ok: boolean; message?: string }) => void;
  /** Sent only to a player the host just removed from the room. */
  kicked: () => void;
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
  /** Impostor-only: spend a sabotage charge to cut the shared game clock. */
  trigger_sabotage: () => void;
  /** The Judge's one-time vote overrule. */
  judge_overrule: (payload: { targetId: string }) => void;
  /** The Guardian Angel's one-time shield. */
  guardian_protect: (payload: { targetId: string }) => void;
  /** The Sheriff's one-time shot — hits the impostor, or backfires and kills the Sheriff. */
  sheriff_shoot: (payload: { targetId: string }) => void;
  /** The Engineer's one-time decoy blackout vent. */
  engineer_vent: () => void;
  /** Host-only: removes a player from the room. Lobby only. */
  kick_player: (payload: { targetId: string }) => void;
  /** Host-only: hands host powers to another connected player. */
  transfer_host: (payload: { targetId: string }) => void;
}
