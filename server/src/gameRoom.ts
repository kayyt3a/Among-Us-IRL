import { randomUUID } from 'node:crypto';
import {
  ALL_TASKS,
  buildCustomTasks,
  COMMON_TASKS,
  GameOverInfo,
  MAX_CUSTOM_TASK_LENGTH,
  MAX_CUSTOM_TASKS,
  MeetingReason,
  MeetingResult,
  MeetingState,
  MeetingVoteTally,
  PlayerRole,
  PlayerTask,
  PROXIMITY_FREQUENCIES_HZ,
  PROXIMITY_WINDOW_MS,
  RoomSettings,
  RoomStateSummary,
  SpecialRole,
} from '@irl-impostor/shared';
import {
  DEFAULT_TASKS_PER_PLAYER,
  GAME_DURATION_MS,
  KILL_COOLDOWN_MS,
  MAX_MEETINGS_PER_PLAYER,
  MEETING_COOLDOWN_MS,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
  MIN_PLAYERS,
  SABOTAGE_COOLDOWN_MS,
  SABOTAGE_MAX_USES,
  SABOTAGE_TIME_PENALTY_MS,
  VENT_WINDOW_MS,
} from './constants';
import { GameRoomState, ServerPlayer } from './internalTypes';

type PrivateInfo = {
  role: 'crewmate' | 'impostor';
  tasks: PlayerTask[];
  fellowImpostors?: { id: string; name: string }[];
  specialRole?: SpecialRole;
};

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
      meetingSpot: '',
      judgeEnabled: false,
      guardianAngelEnabled: false,
      sheriffEnabled: false,
      engineerEnabled: false,
      customTasks: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      meeting: null,
      ventAvailableUntil: 0,
      meetingTimer: null,
      winner: null,
      pendingKill: null,
      nextMeetingAvailableAt: 0,
      gameEndsAt: null,
      sabotageUsesRemaining: SABOTAGE_MAX_USES,
      sabotageAvailableAt: 0,
      judgeId: null,
      guardianAngelId: null,
      sheriffId: null,
      engineerId: null,
      protectedPlayerId: null,
      gameStartedAt: null,
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
      micAvailable: true,
      specialRole: null,
      specialRoleUsed: false,
      meetingsCalled: 0,
      killCooldownUntil: 0,
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

  get allCrewmates(): ServerPlayer[] {
    return this.state.playerOrder
      .map((id) => this.state.players.get(id)!)
      .filter((p) => p.role === 'crewmate');
  }

  updateSettings(partial: Partial<RoomSettings>) {
    // The meeting spot is just a label, not something that affects role/task
    // assignment, so the host can change it any time — including mid-game, if
    // the agreed spot stops working out.
    if (partial.meetingSpot !== undefined) {
      this.state.meetingSpot = partial.meetingSpot.trim().slice(0, 40);
      this.touch();
    }

    if (this.state.phase !== 'lobby') return;
    if (partial.tasksPerPlayer) {
      this.state.tasksPerPlayer = Math.max(3, Math.min(8, Math.floor(partial.tasksPerPlayer)));
    }
    if (partial.impostorCount) {
      const maxImpostors = Math.max(1, Math.floor(this.state.playerOrder.length / 3));
      this.state.impostorCount = Math.max(1, Math.min(maxImpostors, Math.floor(partial.impostorCount)));
    }
    if (partial.judgeEnabled !== undefined) this.state.judgeEnabled = partial.judgeEnabled;
    if (partial.guardianAngelEnabled !== undefined) {
      this.state.guardianAngelEnabled = partial.guardianAngelEnabled;
    }
    if (partial.sheriffEnabled !== undefined) this.state.sheriffEnabled = partial.sheriffEnabled;
    if (partial.engineerEnabled !== undefined) this.state.engineerEnabled = partial.engineerEnabled;
    if (partial.customTasks !== undefined) {
      this.state.customTasks = partial.customTasks
        .map((t) => t.trim().slice(0, MAX_CUSTOM_TASK_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_CUSTOM_TASKS);
    }
    this.touch();
  }

  canStart(): { ok: true } | { ok: false; error: string } {
    if (this.state.playerOrder.length < MIN_PLAYERS) {
      return { ok: false, error: `Need at least ${MIN_PLAYERS} players to start.` };
    }
    if (!this.state.meetingSpot.trim()) {
      return { ok: false, error: 'Set a meeting spot before starting.' };
    }
    if (this.state.impostorCount >= this.state.playerOrder.length) {
      return { ok: false, error: 'Too many impostors for this many players.' };
    }
    return { ok: true };
  }

  /** Assigns roles, special roles, and deals out unique tasks (plus the one shared common task) to every player. */
  startGame(): Map<string, PrivateInfo> {
    const ids = shuffle(this.state.playerOrder);
    const impostorIds = new Set(ids.slice(0, this.state.impostorCount));
    const crewmateIds = this.state.playerOrder.filter((id) => !impostorIds.has(id));

    // Each special role, when enabled, goes to a distinct crewmate — falling back to
    // reusing the pool only if there aren't enough crewmates to go around.
    const assigned = new Set<string>();
    const pickSpecial = (enabled: boolean): string | null => {
      if (!enabled || crewmateIds.length === 0) return null;
      const candidates = crewmateIds.filter((id) => !assigned.has(id));
      const pool = candidates.length > 0 ? candidates : crewmateIds;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      assigned.add(pick);
      return pick;
    };
    const judgeId = pickSpecial(this.state.judgeEnabled);
    const guardianAngelId = pickSpecial(this.state.guardianAngelEnabled);
    const sheriffId = pickSpecial(this.state.sheriffEnabled);
    const engineerId = pickSpecial(this.state.engineerEnabled);
    this.state.judgeId = judgeId;
    this.state.guardianAngelId = guardianAngelId;
    this.state.sheriffId = sheriffId;
    this.state.engineerId = engineerId;

    const taskPool = ALL_TASKS.concat(buildCustomTasks(this.state.customTasks));
    const neededTasks = this.state.playerOrder.length * this.state.tasksPerPlayer;
    const pool = shuffle(taskPool).slice(0, Math.min(neededTasks, taskPool.length));
    const commonTask = COMMON_TASKS[Math.floor(Math.random() * COMMON_TASKS.length)];

    let cursor = 0;
    const result = new Map<string, PrivateInfo>();

    for (const id of this.state.playerOrder) {
      const player = this.state.players.get(id)!;
      const role = impostorIds.has(id) ? 'impostor' : 'crewmate';
      const slice: PlayerTask[] = [];
      for (let i = 0; i < this.state.tasksPerPlayer; i++) {
        const t = pool[cursor % pool.length];
        cursor++;
        slice.push({
          taskId: `${id}:${t.id}:${i}`,
          text: t.text,
          room: t.room,
          done: false,
          visual: t.visual,
          common: false,
        });
      }
      slice.push({
        taskId: `${id}:${commonTask.id}`,
        text: commonTask.text,
        room: commonTask.room,
        done: false,
        visual: commonTask.visual,
        common: true,
      });

      player.role = role;
      player.tasks = slice;
      player.status = 'alive';
      player.specialRole =
        id === judgeId
          ? 'judge'
          : id === guardianAngelId
            ? 'guardian-angel'
            : id === sheriffId
              ? 'sheriff'
              : id === engineerId
                ? 'engineer'
                : null;
      player.specialRoleUsed = false;
      player.meetingsCalled = 0;
      player.killCooldownUntil = 0;

      const fellowImpostors =
        role === 'impostor' && impostorIds.size > 1
          ? Array.from(impostorIds)
              .filter((otherId) => otherId !== id)
              .map((otherId) => ({ id: otherId, name: this.state.players.get(otherId)!.name }))
          : undefined;

      result.set(id, {
        role,
        tasks: slice,
        fellowImpostors,
        specialRole: player.specialRole ?? undefined,
      });
    }

    this.state.phase = 'playing';
    this.state.winner = null;
    this.state.nextMeetingAvailableAt = 0;
    this.state.pendingKill = null;
    this.state.protectedPlayerId = null;
    const now = Date.now();
    this.state.gameStartedAt = now;
    this.state.gameEndsAt = now + GAME_DURATION_MS;
    this.state.sabotageUsesRemaining = SABOTAGE_MAX_USES;
    this.state.sabotageAvailableAt = 0;
    this.touch();
    return result;
  }

  getPrivateInfo(playerId: string): PrivateInfo | null {
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
      specialRole: player.specialRole ?? undefined,
    };
  }

  completeTask(playerId: string, taskId: string): boolean {
    // Ghosts keep working their list — a dead crewmate's unfinished tasks
    // still block the crew's task-completion win, same as real Among Us.
    const player = this.state.players.get(playerId);
    if (!player) return false;
    const task = player.tasks.find((t) => t.taskId === taskId);
    if (!task) return false;
    task.done = true;
    this.touch();
    return true;
  }

  private validateKill(
    killerId: string,
    targetId: string
  ): { ok: true } | { ok: false; error: string; reason?: 'shield' } {
    const killer = this.state.players.get(killerId);
    const target = this.state.players.get(targetId);
    if (!killer || killer.role !== 'impostor' || killer.status !== 'alive') {
      return { ok: false, error: 'Only a living impostor can do that.' };
    }
    if (Date.now() < killer.killCooldownUntil) {
      return { ok: false, error: 'Still on cooldown from the last kill.' };
    }
    if (!target || target.status !== 'alive' || target.role === 'impostor') {
      return { ok: false, error: 'Invalid target.' };
    }
    if (targetId === this.state.protectedPlayerId) {
      this.state.protectedPlayerId = null;
      this.touch();
      // Deliberately the same generic message as any other invalid target —
      // the impostor should never be able to tell a shield apart from a
      // wrong guess.
      return { ok: false, error: 'Invalid target.', reason: 'shield' };
    }
    return { ok: true };
  }

  private finalizeKill(killerId: string, targetId: string): GameOverInfo | null {
    const killer = this.state.players.get(killerId)!;
    const target = this.state.players.get(targetId)!;
    target.status = 'dead';
    killer.killCooldownUntil = Date.now() + KILL_COOLDOWN_MS;
    this.state.ventAvailableUntil = Date.now() + VENT_WINDOW_MS;
    this.touch();
    return this.checkWinConditions();
  }

  /** Honor-code instant kill, no proximity check. Returns the winner, if the kill ends the game. */
  killPlayer(
    killerId: string,
    targetId: string
  ): { ok: true; winner: GameOverInfo | null } | { ok: false; error: string; reason?: 'shield' } {
    const check = this.validateKill(killerId, targetId);
    if (!check.ok) return check;
    const winner = this.finalizeKill(killerId, targetId);
    return { ok: true, winner };
  }

  setMicAvailable(playerId: string, available: boolean) {
    const player = this.state.players.get(playerId);
    if (player) player.micAvailable = available;
  }

  /**
   * Starts a proximity-verified kill attempt. If the target's client has no
   * confirmed mic access, there's nothing to verify against, so this falls
   * straight through to an instant kill instead of hanging forever.
   */
  startKillAttempt(
    killerId: string,
    targetId: string
  ):
    | { ok: true; instant: true; winner: GameOverInfo | null }
    | { ok: true; instant: false; frequencyHz: number; windowMs: number }
    | { ok: false; error: string; reason?: 'shield' } {
    const check = this.validateKill(killerId, targetId);
    if (!check.ok) return check;
    if (this.state.pendingKill && this.state.pendingKill.expiresAt > Date.now()) {
      return { ok: false, error: 'A kill attempt is already in progress.' };
    }

    const target = this.state.players.get(targetId)!;
    if (!target.micAvailable) {
      const winner = this.finalizeKill(killerId, targetId);
      return { ok: true, instant: true, winner };
    }

    const frequencyHz =
      PROXIMITY_FREQUENCIES_HZ[Math.floor(Math.random() * PROXIMITY_FREQUENCIES_HZ.length)];
    this.state.pendingKill = {
      killerId,
      targetId,
      frequencyHz,
      expiresAt: Date.now() + PROXIMITY_WINDOW_MS,
    };
    this.touch();
    return { ok: true, instant: false, frequencyHz, windowMs: PROXIMITY_WINDOW_MS };
  }

  /** The target's client reports hearing a tone. Confirms the pending kill if it matches. */
  confirmKillAttempt(
    reporterId: string,
    frequencyHz: number
  ): { ok: true; killerId: string; winner: GameOverInfo | null } | { ok: false } {
    const pending = this.state.pendingKill;
    if (
      !pending ||
      pending.targetId !== reporterId ||
      pending.frequencyHz !== frequencyHz ||
      pending.expiresAt < Date.now()
    ) {
      return { ok: false };
    }
    const { killerId, targetId } = pending;
    this.state.pendingKill = null;
    const winner = this.finalizeKill(killerId, targetId);
    return { ok: true, killerId, winner };
  }

  /** Clears the pending kill if it's still the given killer's, e.g. on cancel or timeout. Returns whether one was cleared. */
  clearKillAttempt(killerId: string): boolean {
    if (this.state.pendingKill && this.state.pendingKill.killerId === killerId) {
      this.state.pendingKill = null;
      this.touch();
      return true;
    }
    return false;
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

  /** Spends a sabotage charge to cut the shared game clock down. */
  triggerSabotage(
    playerId: string
  ):
    | { ok: true; gameEndsAt: number; usesRemaining: number; availableAt: number }
    | { ok: false; error: string } {
    const player = this.state.players.get(playerId);
    if (!player || player.role !== 'impostor' || player.status !== 'alive') {
      return { ok: false, error: 'Only a living impostor can do that.' };
    }
    if (this.state.phase !== 'playing') {
      return { ok: false, error: 'Can only sabotage during play.' };
    }
    if (this.state.sabotageUsesRemaining <= 0) {
      return { ok: false, error: 'No sabotage charges left.' };
    }
    if (Date.now() < this.state.sabotageAvailableAt) {
      return { ok: false, error: 'Sabotage is on cooldown.' };
    }
    if (this.state.gameEndsAt === null) {
      return { ok: false, error: 'No active game clock.' };
    }

    this.state.sabotageUsesRemaining -= 1;
    this.state.sabotageAvailableAt = Date.now() + SABOTAGE_COOLDOWN_MS;
    this.state.gameEndsAt -= SABOTAGE_TIME_PENALTY_MS;
    this.touch();
    return {
      ok: true,
      gameEndsAt: this.state.gameEndsAt,
      usesRemaining: this.state.sabotageUsesRemaining,
      availableAt: this.state.sabotageAvailableAt,
    };
  }

  isGameClockExpired(): boolean {
    return this.state.phase === 'playing' && this.state.gameEndsAt !== null && Date.now() >= this.state.gameEndsAt;
  }

  /** If the clock has run out mid-play, the impostors win by default. */
  expireGameClock(): GameOverInfo | null {
    if (!this.isGameClockExpired()) return null;
    this.state.winner = 'impostors';
    this.state.phase = 'ended';
    this.touch();
    return this.gameOverInfo('impostors');
  }

  callMeeting(callerId: string, reason: MeetingReason): { ok: true; meeting: MeetingState } | { ok: false; error: string } {
    const caller = this.state.players.get(callerId);
    if (!caller || caller.status !== 'alive') {
      return { ok: false, error: 'Only living players can call a meeting.' };
    }
    if (this.state.phase !== 'playing') {
      return { ok: false, error: 'Can only call a meeting during play.' };
    }
    if (caller.meetingsCalled >= MAX_MEETINGS_PER_PLAYER) {
      return { ok: false, error: "You're out of meetings for this game." };
    }
    if (Date.now() < this.state.nextMeetingAvailableAt) {
      return { ok: false, error: 'Meetings are on cooldown.' };
    }

    const now = Date.now();
    caller.meetingsCalled += 1;
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
    return { ok: true, meeting: this.publicMeeting()! };
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

    this.touch();
    const winner = this.checkWinConditions();

    return {
      result: { eliminatedId, eliminatedName, eliminatedRole, tally, wasTie },
      winner,
    };
  }

  /**
   * The Judge force-ejects someone during voting, bypassing the tally. A
   * misfire (the target wasn't the impostor) ejects the Judge instead.
   */
  judgeOverrule(
    judgeId: string,
    targetId: string
  ): { ok: true; result: MeetingResult; winner: GameOverInfo | null } | { ok: false; error: string } {
    const judge = this.state.players.get(judgeId);
    if (!judge || judge.status !== 'alive' || this.state.judgeId !== judgeId) {
      return { ok: false, error: 'Only the living Judge can do that.' };
    }
    if (judge.specialRoleUsed) {
      return { ok: false, error: "You've already used your overrule." };
    }
    if (!this.state.meeting || this.state.meeting.phase !== 'voting') {
      return { ok: false, error: 'Can only overrule during voting.' };
    }
    const target = this.state.players.get(targetId);
    if (!target || targetId === judgeId) {
      return { ok: false, error: 'Invalid target.' };
    }

    judge.specialRoleUsed = true;

    let eliminatedId: string;
    let eliminatedName: string;
    let eliminatedRole: 'crewmate' | 'impostor';
    let judgeMisfired = false;

    if (target.role === 'impostor') {
      target.status = 'dead';
      eliminatedId = target.id;
      eliminatedName = target.name;
      eliminatedRole = 'impostor';
    } else {
      judge.status = 'dead';
      eliminatedId = judge.id;
      eliminatedName = judge.name;
      eliminatedRole = 'crewmate';
      judgeMisfired = true;
    }

    this.touch();
    const winner = this.checkWinConditions();

    return {
      ok: true,
      result: {
        eliminatedId,
        eliminatedName,
        eliminatedRole,
        tally: [],
        wasTie: false,
        overruledByName: judge.name,
        judgeMisfired,
      },
      winner,
    };
  }

  /** The Guardian Angel shields one living player from the next kill attempt, once. */
  guardianProtect(ghostId: string, targetId: string): { ok: true } | { ok: false; error: string } {
    const ghost = this.state.players.get(ghostId);
    if (!ghost || ghost.status !== 'dead' || this.state.guardianAngelId !== ghostId) {
      return { ok: false, error: 'Only the Guardian Angel, once dead, can do that.' };
    }
    if (ghost.specialRoleUsed) {
      return { ok: false, error: "You've already used your shield." };
    }
    const target = this.state.players.get(targetId);
    if (!target || target.status !== 'alive') {
      return { ok: false, error: 'Invalid target.' };
    }
    ghost.specialRoleUsed = true;
    this.state.protectedPlayerId = targetId;
    this.touch();
    return { ok: true };
  }

  /**
   * The Sheriff's one-time shot at a suspected impostor. Hits the target if
   * they really are the impostor; an innocent guess kills the Sheriff
   * instead. Resolves silently, like an impostor's kill — the body is only
   * noticed later, never announced.
   */
  sheriffShoot(
    sheriffId: string,
    targetId: string
  ):
    | { ok: true; eliminatedId: string; eliminatedRole: PlayerRole; misfired: boolean; winner: GameOverInfo | null }
    | { ok: false; error: string } {
    const sheriff = this.state.players.get(sheriffId);
    if (!sheriff || sheriff.status !== 'alive' || this.state.sheriffId !== sheriffId) {
      return { ok: false, error: 'Only the living Sheriff can do that.' };
    }
    if (sheriff.specialRoleUsed) {
      return { ok: false, error: "You've already used your shot." };
    }
    if (this.state.phase !== 'playing') {
      return { ok: false, error: 'Can only shoot during play.' };
    }
    const target = this.state.players.get(targetId);
    if (!target || target.status !== 'alive' || targetId === sheriffId) {
      return { ok: false, error: 'Invalid target.' };
    }

    sheriff.specialRoleUsed = true;
    let eliminatedId: string;
    let eliminatedRole: PlayerRole;
    let misfired = false;

    if (target.role === 'impostor') {
      target.status = 'dead';
      eliminatedId = target.id;
      eliminatedRole = 'impostor';
    } else {
      sheriff.status = 'dead';
      eliminatedId = sheriff.id;
      eliminatedRole = 'crewmate';
      misfired = true;
    }

    this.touch();
    const winner = this.checkWinConditions();
    return { ok: true, eliminatedId, eliminatedRole, misfired, winner };
  }

  /** The Engineer's one-time decoy blackout vent — identical to a real vent, for misdirection. */
  engineerFakeVent(playerId: string): { ok: true } | { ok: false; error: string } {
    const player = this.state.players.get(playerId);
    if (!player || player.status !== 'alive' || this.state.engineerId !== playerId) {
      return { ok: false, error: 'Only the living Engineer can do that.' };
    }
    if (player.specialRoleUsed) {
      return { ok: false, error: "You've already used your vent." };
    }
    if (this.state.phase !== 'playing') {
      return { ok: false, error: 'Can only vent during play.' };
    }
    player.specialRoleUsed = true;
    this.touch();
    return { ok: true };
  }

  closeMeeting() {
    this.state.meeting = null;
    this.state.nextMeetingAvailableAt = Date.now() + MEETING_COOLDOWN_MS;
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
      // Every crewmate's tasks — dead or alive — have to be done; a ghost's
      // unfinished list still blocks the win, same as real Among Us.
      const allCrewmates = this.allCrewmates;
      const crewmatesDoneWithTasks =
        allCrewmates.length > 0 && allCrewmates.every((p) => p.tasks.every((t) => t.done));
      if (crewmatesDoneWithTasks) {
        winner = 'crewmates';
      }
    }

    if (!winner) return null;

    this.state.winner = winner;
    this.state.phase = 'ended';
    return this.gameOverInfo(winner);
  }

  gameOverInfo(winner: 'crewmates' | 'impostors'): GameOverInfo {
    const allCrew = this.allCrewmates;
    const tasksCompleted = allCrew.reduce((sum, p) => sum + p.tasks.filter((t) => t.done).length, 0);
    const tasksTotal = allCrew.reduce((sum, p) => sum + p.tasks.length, 0);
    return {
      winner,
      players: this.state.playerOrder.map((id) => {
        const p = this.state.players.get(id)!;
        return { id: p.id, name: p.name, role: p.role ?? 'crewmate', status: p.status };
      }),
      tasksCompleted,
      tasksTotal,
      durationMs: this.state.gameStartedAt ? Date.now() - this.state.gameStartedAt : 0,
    };
  }

  resetToLobby() {
    for (const id of this.state.playerOrder) {
      const p = this.state.players.get(id)!;
      p.role = null;
      p.status = 'alive';
      p.tasks = [];
      p.specialRole = null;
      p.specialRoleUsed = false;
      p.meetingsCalled = 0;
      p.killCooldownUntil = 0;
    }
    this.state.phase = 'lobby';
    this.state.meeting = null;
    this.state.ventAvailableUntil = 0;
    this.state.winner = null;
    this.state.pendingKill = null;
    this.state.nextMeetingAvailableAt = 0;
    this.state.gameEndsAt = null;
    this.state.sabotageUsesRemaining = SABOTAGE_MAX_USES;
    this.state.sabotageAvailableAt = 0;
    this.state.judgeId = null;
    this.state.guardianAngelId = null;
    this.state.sheriffId = null;
    this.state.engineerId = null;
    this.state.protectedPlayerId = null;
    this.state.gameStartedAt = null;
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
        meetingSpot: this.state.meetingSpot,
        judgeEnabled: this.state.judgeEnabled,
        guardianAngelEnabled: this.state.guardianAngelEnabled,
        sheriffEnabled: this.state.sheriffEnabled,
        engineerEnabled: this.state.engineerEnabled,
        customTasks: this.state.customTasks,
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
      gameEndsAt: this.state.gameEndsAt,
    };
  }
}
