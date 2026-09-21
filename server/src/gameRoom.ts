import { randomUUID } from 'node:crypto';
import {
  ALL_TASKS,
  GameOverInfo,
  MeetingReason,
  MeetingResult,
  MeetingState,
  MeetingVoteTally,
  PlayerTask,
  RoomStateSummary,
} from '@irl-impostor/shared';
import {
  DEFAULT_TASKS_PER_PLAYER,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
  MIN_PLAYERS,
  VENT_WINDOW_MS,
} from './constants';
import { GameRoomState, ServerPlayer } from './internalTypes';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class GameRoom {
  state: GameRoomState;

  constructor(code: string) {
    this.state = {
      code,
      phase: 'lobby',
      players: new Map(),
      playerOrder: [],
      tasksPerPlayer: DEFAULT_TASKS_PER_PLAYER,
      impostorCount: 1,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      meeting: null,
      ventAvailableUntil: 0,
      meetingTimer: null,
      winner: null,
    };
  }

  touch() {
    this.state.lastActivity = Date.now();
  }

  addPlayer(name: string, isHost: boolean): ServerPlayer {
    const id = randomUUID();
    const player: ServerPlayer = {
      id,
      socketId: null,
      name: name.trim().slice(0, 24) || 'Player',
      isHost,
      role: null,
      status: 'alive',
      tasks: [],
      connected: true,
    };
    this.state.players.set(id, player);
    this.state.playerOrder.push(id);
    this.touch();
    return player;
  }

  get alivePlayers(): ServerPlayer[] {
    return this.state.playerOrder
      .map((id) => this.state.players.get(id)!)
      .filter((p) => p.status === 'alive');
  }

  get aliveImpostors(): ServerPlayer[] {
    return this.alivePlayers.filter((p) => p.role === 'impostor');
  }

  get aliveCrewmates(): ServerPlayer[] {
    return this.alivePlayers.filter((p) => p.role === 'crewmate');
  }

  updateSettings(tasksPerPlayer?: number, impostorCount?: number) {
    if (this.state.phase !== 'lobby') return;
    if (tasksPerPlayer) {
      this.state.tasksPerPlayer = Math.max(3, Math.min(8, Math.floor(tasksPerPlayer)));
    }
    if (impostorCount) {
      const maxImpostors = Math.max(1, Math.floor(this.state.playerOrder.length / 3));
      this.state.impostorCount = Math.max(1, Math.min(maxImpostors, Math.floor(impostorCount)));
    }
    this.touch();
  }

  canStart(): { ok: true } | { ok: false; error: string } {
    if (this.state.playerOrder.length < MIN_PLAYERS) {
      return { ok: false, error: `Need at least ${MIN_PLAYERS} players to start.` };
    }
    if (this.state.impostorCount >= this.state.playerOrder.length) {
      return { ok: false, error: 'Too many impostors for this many players.' };
    }
    return { ok: true };
  }

  /** Assigns roles and deals out unique tasks to every player. Returns per-player private info. */
  startGame(): Map<string, { role: 'crewmate' | 'impostor'; tasks: PlayerTask[] }> {
    const ids = shuffle(this.state.playerOrder);
    const impostorIds = new Set(ids.slice(0, this.state.impostorCount));

    const neededTasks = this.state.playerOrder.length * this.state.tasksPerPlayer;
    const pool = shuffle(ALL_TASKS).slice(0, Math.min(neededTasks, ALL_TASKS.length));

    let cursor = 0;
    const result = new Map<
      string,
      { role: 'crewmate' | 'impostor'; tasks: PlayerTask[]; fellowImpostors?: { id: string; name: string }[] }
    >();

    for (const id of this.state.playerOrder) {
      const player = this.state.players.get(id)!;
      const role = impostorIds.has(id) ? 'impostor' : 'crewmate';
      const slice: PlayerTask[] = [];
      for (let i = 0; i < this.state.tasksPerPlayer; i++) {
        const t = pool[cursor % pool.length];
        cursor++;
        slice.push({ taskId: `${id}:${t.id}:${i}`, text: t.text, room: t.room, done: false });
      }
      player.role = role;
      player.tasks = slice;
      player.status = 'alive';

      const fellowImpostors =
        role === 'impostor' && impostorIds.size > 1
          ? Array.from(impostorIds)
              .filter((otherId) => otherId !== id)
              .map((otherId) => ({ id: otherId, name: this.state.players.get(otherId)!.name }))
          : undefined;

      result.set(id, { role, tasks: slice, fellowImpostors });
    }

    this.state.phase = 'playing';
    this.state.winner = null;
    this.touch();
    return result;
  }

  getPrivateInfo(playerId: string): { role: 'crewmate' | 'impostor'; tasks: PlayerTask[]; fellowImpostors?: { id: string; name: string }[] } | null {
    const player = this.state.players.get(playerId);
    if (!player || !player.role) return null;
    const fellowImpostors =
      player.role === 'impostor'
        ? this.state.playerOrder
            .filter((id) => id !== playerId && this.state.players.get(id)!.role === 'impostor')
            .map((id) => ({ id, name: this.state.players.get(id)!.name }))
        : undefined;
    return {
      role: player.role,
      tasks: player.tasks,
      fellowImpostors: fellowImpostors && fellowImpostors.length > 0 ? fellowImpostors : undefined,
    };
  }

  completeTask(playerId: string, taskId: string): boolean {
    const player = this.state.players.get(playerId);
    if (!player || player.status !== 'alive') return false;
    const task = player.tasks.find((t) => t.taskId === taskId);
    if (!task) return false;
    task.done = true;
    this.touch();
    return true;
  }

  /** Returns the winner, if the kill ends the game. */
  killPlayer(
    killerId: string,
    targetId: string
  ): { ok: true; winner: GameOverInfo | null } | { ok: false; error: string } {
    const killer = this.state.players.get(killerId);
    const target = this.state.players.get(targetId);
    if (!killer || killer.role !== 'impostor' || killer.status !== 'alive') {
      return { ok: false, error: 'Only a living impostor can do that.' };
    }
    if (!target || target.status !== 'alive' || target.role === 'impostor') {
      return { ok: false, error: 'Invalid target.' };
    }
    target.status = 'dead';
    this.state.ventAvailableUntil = Date.now() + VENT_WINDOW_MS;
    this.touch();
    const winner = this.checkWinConditions();
    return { ok: true, winner };
  }

  isVentAvailable(): boolean {
    return Date.now() < this.state.ventAvailableUntil;
  }

  triggerVent(playerId: string): boolean {
    const player = this.state.players.get(playerId);
    if (!player || player.role !== 'impostor' || player.status !== 'alive') return false;
    if (!this.isVentAvailable()) return false;
    this.state.ventAvailableUntil = 0;
    this.touch();
    return true;
  }

  callMeeting(callerId: string, reason: MeetingReason): MeetingState | null {
    const caller = this.state.players.get(callerId);
    if (!caller || caller.status !== 'alive') return null;
    if (this.state.phase !== 'playing') return null;

    const now = Date.now();
    this.state.phase = 'meeting';
    this.state.meeting = {
      calledBy: callerId,
      calledByName: caller.name,
      reason,
      phase: 'discussion',
      discussionEndsAt: now + MEETING_DISCUSSION_MS,
      votingEndsAt: now + MEETING_DISCUSSION_MS + MEETING_VOTING_MS,
      votes: new Map(),
    };
    this.touch();
    return this.publicMeeting();
  }

  advanceMeetingToVoting(): MeetingState | null {
    if (!this.state.meeting || this.state.meeting.phase !== 'discussion') return null;
    this.state.meeting.phase = 'voting';
    this.touch();
    return this.publicMeeting();
  }

  castVote(voterId: string, targetId: string): boolean {
    if (!this.state.meeting || this.state.meeting.phase !== 'voting') return false;
    const voter = this.state.players.get(voterId);
    if (!voter || voter.status !== 'alive') return false;
    if (targetId !== 'skip' && !this.state.players.get(targetId)) return false;
    this.state.meeting.votes.set(voterId, targetId);
    this.touch();
    return true;
  }

  allAliveHaveVoted(): boolean {
    if (!this.state.meeting) return false;
    return this.alivePlayers.every((p) => this.state.meeting!.votes.has(p.id));
  }

  resolveMeeting(): { result: MeetingResult; winner: GameOverInfo | null } {
    const meeting = this.state.meeting!;
    const counts = new Map<string, number>();
    for (const target of meeting.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    const tally: MeetingVoteTally[] = Array.from(counts.entries()).map(([targetId, count]) => ({
      targetId: targetId as string | 'skip',
      count,
    }));

    let eliminatedId: string | null = null;
    let wasTie = false;
    if (tally.length > 0) {
      const max = Math.max(...tally.map((t) => t.count));
      const top = tally.filter((t) => t.count === max);
      if (top.length === 1 && top[0].targetId !== 'skip') {
        eliminatedId = top[0].targetId;
      } else {
        wasTie = top.length > 1;
      }
    }

    let eliminatedName: string | null = null;
    let eliminatedRole: 'crewmate' | 'impostor' | null = null;
    if (eliminatedId) {
      const p = this.state.players.get(eliminatedId);
      if (p) {
        p.status = 'dead';
        eliminatedName = p.name;
        eliminatedRole = p.role;
      }
    }

    meeting.phase = 'results';
    this.touch();

    const winner = this.checkWinConditions();

    return {
      result: { eliminatedId, eliminatedName, eliminatedRole, tally, wasTie },
      winner,
    };
  }

  closeMeeting() {
    this.state.meeting = null;
    if (this.state.phase === 'meeting') {
      this.state.phase = this.state.winner ? 'ended' : 'playing';
    }
    this.touch();
  }

  checkWinConditions(): GameOverInfo | null {
    const impostorsAlive = this.aliveImpostors.length;
    const crewmatesAlive = this.aliveCrewmates.length;

    let winner: 'crewmates' | 'impostors' | null = null;
    if (impostorsAlive === 0) {
      winner = 'crewmates';
    } else if (impostorsAlive >= crewmatesAlive) {
      winner = 'impostors';
    } else {
      const crewmatesDoneWithTasks = this.aliveCrewmates.every((p) =>
        p.tasks.every((t) => t.done)
      );
      if (crewmatesDoneWithTasks && this.aliveCrewmates.length > 0) {
        winner = 'crewmates';
      }
    }

    if (!winner) return null;

    this.state.winner = winner;
    this.state.phase = 'ended';
    return this.gameOverInfo(winner);
  }

  gameOverInfo(winner: 'crewmates' | 'impostors'): GameOverInfo {
    return {
      winner,
      players: this.state.playerOrder.map((id) => {
        const p = this.state.players.get(id)!;
        return { id: p.id, name: p.name, role: p.role ?? 'crewmate', status: p.status };
      }),
    };
  }

  resetToLobby() {
    for (const id of this.state.playerOrder) {
      const p = this.state.players.get(id)!;
      p.role = null;
      p.status = 'alive';
      p.tasks = [];
    }
    this.state.phase = 'lobby';
    this.state.meeting = null;
    this.state.ventAvailableUntil = 0;
    this.state.winner = null;
    this.touch();
  }

  removePlayer(playerId: string) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    if (this.state.phase === 'lobby') {
      this.state.players.delete(playerId);
      this.state.playerOrder = this.state.playerOrder.filter((id) => id !== playerId);
      if (player.isHost && this.state.playerOrder.length > 0) {
        this.state.players.get(this.state.playerOrder[0])!.isHost = true;
      }
    } else {
      player.connected = false;
      player.socketId = null;
    }
    this.touch();
  }

  publicMeeting(): MeetingState | null {
    if (!this.state.meeting) return null;
    const m = this.state.meeting;
    return {
      calledBy: m.calledBy,
      calledByName: m.calledByName,
      reason: m.reason,
      phase: m.phase,
      discussionEndsAt: m.discussionEndsAt,
      votingEndsAt: m.votingEndsAt,
      votedPlayerIds: Array.from(m.votes.keys()),
    };
  }

  publicState(): RoomStateSummary {
    return {
      code: this.state.code,
      phase: this.state.phase,
      settings: {
        tasksPerPlayer: this.state.tasksPerPlayer,
        impostorCount: this.state.impostorCount,
      },
      players: this.state.playerOrder
        .map((id) => this.state.players.get(id)!)
        .filter((p) => p.connected || this.state.phase !== 'lobby')
        .map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          // Ghost status stays hidden from everyone else during normal play so a glance
          // at the roster can't out who died; it's only revealed once a meeting is called.
          status:
            this.state.phase === 'meeting' || this.state.phase === 'ended' ? p.status : 'alive',
        })),
      meeting: this.publicMeeting(),
      ventAvailable: this.isVentAvailable(),
      ventEndsAt: this.state.ventAvailableUntil || null,
    };
  }
}
