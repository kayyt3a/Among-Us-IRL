import {
  PlayerRole,
  PlayerStatus,
  PlayerTask,
  GamePhase,
  MeetingReason,
  MeetingPhase,
  SpecialRole,
  Task,
  TaskPhoto,
} from '@irl-impostor/shared';

export interface ServerPlayer {
  id: string;
  socketId: string | null;
  name: string;
  isHost: boolean;
  role: PlayerRole | null;
  status: PlayerStatus;
  tasks: PlayerTask[];
  connected: boolean;
  /** Whether this player's client has confirmed mic access for the proximity handshake. Optimistic until told otherwise. */
  micAvailable: boolean;
  /** Judge or Guardian Angel, if the room has those roles enabled. */
  specialRole: SpecialRole | null;
  /** Judge: has their one-time overrule been spent. Guardian Angel: has their one-time shield been spent. */
  specialRoleUsed: boolean;
  /** How many meetings this player has personally called this game. */
  meetingsCalled: number;
  /** Set after a kill; this player (as killer) can't attempt another until then. */
  killCooldownUntil: number;
  /** Set after using Vent; this player can't trigger it again until then. Independent of killCooldownUntil. */
  ventCooldownUntil: number;
  /** Joined mid-round, watching this round. Becomes a normal player again next round. */
  isSpectator: boolean;
  /** Dead and already found: reported, or seen by everyone at a meeting. Can't be reported again. */
  bodyFound: boolean;
  /** After a report that didn't point at an unfound body, this player can't report again until then. */
  reportBlockedUntil: number;
}

export interface PendingKillAttempt {
  killerId: string;
  targetId: string;
  frequencyHz: number;
  expiresAt: number;
}

export interface ServerMeeting {
  calledBy: string;
  calledByName: string;
  reason: MeetingReason;
  phase: MeetingPhase;
  discussionEndsAt: number;
  votingEndsAt: number;
  votes: Map<string, string>; // voterId -> targetId | 'skip'
  /** For a body report: whose body was found. */
  bodyId: string | null;
}

export interface GameRoomState {
  code: string;
  phase: GamePhase;
  players: Map<string, ServerPlayer>;
  playerOrder: string[];
  tasksPerPlayer: number;
  impostorCount: number;
  meetingSpot: string;
  judgeEnabled: boolean;
  guardianAngelEnabled: boolean;
  sheriffEnabled: boolean;
  engineerEnabled: boolean;
  customTasks: string[];
  lateJoinersPlayNow: boolean;
  photoProofEnabled: boolean;
  gameMinutes: number;
  discussionSeconds: number;
  votingSeconds: number;
  killCooldownSeconds: number;
  revealRoleOnEject: boolean;
  createdAt: number;
  lastActivity: number;
  meeting: ServerMeeting | null;
  meetingTimer: ReturnType<typeof setTimeout> | null;
  winner: 'crewmates' | 'impostors' | null;
  pendingKill: PendingKillAttempt | null;
  nextMeetingAvailableAt: number;
  /** The shared game clock. Null until the game starts. */
  gameEndsAt: number | null;
  sabotageUsesRemaining: number;
  sabotageAvailableAt: number;
  /** The active sabotage puzzle, including the real words (never sent to clients until solved). */
  sabotagePuzzle:
    | { kind: 'words'; words: [string, string]; scrambled: [string, string]; solved: [boolean, boolean] }
    // A plain object rather than a Map so it saves to Redis as is.
    | { kind: 'numbers'; target: number; entries: Record<string, number> }
    | null;
  sabotageStartedAt: number | null;
  judgeId: string | null;
  guardianAngelId: string | null;
  sheriffId: string | null;
  engineerId: string | null;
  /** The one living player the Guardian Angel has shielded from the next kill. */
  protectedPlayerId: string | null;
  /** When the current match started, for the end-of-game duration stat. */
  gameStartedAt: number | null;
  /** Rounds won per player id, persisted across resetToLobby for the life of the room. */
  wins: Map<string, number>;
  /** This round's shared common task, kept around so a late joiner can be dealt the same one. */
  commonTask: Task | null;
  /** Submitted task photos for this round, taskId -> the full record, for the end-of-game recap. */
  taskPhotos: Map<string, TaskPhoto>;
}
