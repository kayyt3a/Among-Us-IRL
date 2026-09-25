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
  /** Joined mid-round, watching this round. Becomes a normal player again next round. */
  isSpectator: boolean;
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
  createdAt: number;
  lastActivity: number;
  meeting: ServerMeeting | null;
  ventAvailableUntil: number;
  meetingTimer: ReturnType<typeof setTimeout> | null;
  winner: 'crewmates' | 'impostors' | null;
  pendingKill: PendingKillAttempt | null;
  nextMeetingAvailableAt: number;
  /** The shared game clock. Null until the game starts. */
  gameEndsAt: number | null;
  sabotageUsesRemaining: number;
  sabotageAvailableAt: number;
  /** The active sabotage puzzle, including the real words (never sent to clients until solved). */
  sabotagePuzzle: { words: [string, string]; scrambled: [string, string]; solved: [boolean, boolean] } | null;
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
