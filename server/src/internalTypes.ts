import { PlayerRole, PlayerStatus, PlayerTask, GamePhase, MeetingReason, MeetingPhase } from '@irl-impostor/shared';

export interface ServerPlayer {
  id: string;
  socketId: string | null;
  name: string;
  isHost: boolean;
  role: PlayerRole | null;
  status: PlayerStatus;
  tasks: PlayerTask[];
  connected: boolean;
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
  createdAt: number;
  lastActivity: number;
  meeting: ServerMeeting | null;
  ventAvailableUntil: number;
  meetingTimer: ReturnType<typeof setTimeout> | null;
  winner: 'crewmates' | 'impostors' | null;
}
