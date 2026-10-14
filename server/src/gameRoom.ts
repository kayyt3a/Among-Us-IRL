import { randomUUID } from 'node:crypto';
import {
  ALL_TASKS,
  buildCustomTasks,
  COMMON_TASKS,
  GameOverInfo,
  GameOverReason,
  MAX_CUSTOM_TASK_LENGTH,
  MAX_CUSTOM_TASKS,
  MeetingReason,
  MeetingResult,
  MeetingState,
  MeetingVoteTally,
  CastVote,
  TIMER_LIMITS,
  TimerSetting,
  clampTimer,
  pickTwoSabotageWords,
  PlayerRole,
  PlayerTask,
  PROXIMITY_FREQUENCIES_HZ,
  PROXIMITY_WINDOW_MS,
  RoomSettings,
  RoomStateSummary,
  scrambleWord,
  SpecialRole,
  TaskPhoto,
} from '@irl-impostor/shared';
import {
  DEFAULT_TASKS_PER_PLAYER,
  MAX_MEETINGS_PER_PLAYER,
  MAX_TASK_PHOTO_CHARS,
  MAX_ROOM_PHOTO_CHARS,
  MEETING_COOLDOWN_MS,
  MIN_PLAYERS,
  REPORT_RETRY_MS,
  SABOTAGE_COOLDOWN_MS,
  SABOTAGE_EXTRA_DRAIN_RATE,
  SABOTAGE_MAX_USES,
  VENT_COOLDOWN_MS,
} from './constants';
import { GameRoomState, ServerPlayer } from './internalTypes';

/** What a task photo has to look like: an inline base64 JPEG, PNG or WebP. */
const PHOTO_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/;

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
      lateJoinersPlayNow: true,
      photoProofEnabled: false,
      gameMinutes: TIMER_LIMITS.gameMinutes.default,
      discussionSeconds: TIMER_LIMITS.discussionSeconds.default,
      votingSeconds: TIMER_LIMITS.votingSeconds.default,
      killCooldownSeconds: TIMER_LIMITS.killCooldownSeconds.default,
      revealRoleOnEject: true,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      meeting: null,
      meetingTimer: null,
      winner: null,
      pendingKill: null,
      nextMeetingAvailableAt: 0,
      gameEndsAt: null,
      sabotageUsesRemaining: SABOTAGE_MAX_USES,
      sabotageAvailableAt: 0,
      sabotagePuzzle: null,
      sabotageStartedAt: null,
      judgeId: null,
      guardianAngelId: null,
      sheriffId: null,
      engineerId: null,
      protectedPlayerId: null,
      gameStartedAt: null,
      wins: new Map(),
      commonTask: null,
      taskPhotos: new Map(),
    };
  }

  touch() {
    this.state.lastActivity = Date.now();
  }

  addPlayer(name: string, isHost: boolean, isSpectator = false): ServerPlayer {
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
      ventCooldownUntil: 0,
      isSpectator,
      bodyFound: false,
      reportBlockedUntil: 0,
    };
    this.state.players.set(id, player);
    this.state.playerOrder.push(id);
    this.touch();
    return player;
  }

  get alivePlayers(): ServerPlayer[] {
    return this.state.playerOrder
      .map((id) => this.state.players.get(id)!)
      .filter((p) => this.isInPlay(p));
  }

  /** Alive and actually dealt into this round (not a mid-round spectator). */
  private isInPlay(p: ServerPlayer | undefined): p is ServerPlayer {
    return !!p && p.status === 'alive' && !p.isSpectator;
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
    // assignment, so the host can change it any time, including mid-game if
    // the agreed spot stops working out.
    if (typeof partial.meetingSpot === 'string') {
      this.state.meetingSpot = partial.meetingSpot.trim().slice(0, 40);
      this.touch();
    }
    if (typeof partial.lateJoinersPlayNow === 'boolean') {
      this.state.lateJoinersPlayNow = partial.lateJoinersPlayNow;
      this.touch();
    }

    if (this.state.phase !== 'lobby') return;
    if (typeof partial.tasksPerPlayer === 'number' && Number.isFinite(partial.tasksPerPlayer)) {
      this.state.tasksPerPlayer = Math.max(3, Math.min(8, Math.floor(partial.tasksPerPlayer)));
    }
    if (typeof partial.impostorCount === 'number' && Number.isFinite(partial.impostorCount)) {
      const maxImpostors = Math.max(1, Math.floor(this.state.playerOrder.length / 3));
      this.state.impostorCount = Math.max(1, Math.min(maxImpostors, Math.floor(partial.impostorCount)));
    }
    if (typeof partial.judgeEnabled === 'boolean') this.state.judgeEnabled = partial.judgeEnabled;
    if (typeof partial.guardianAngelEnabled === 'boolean') {
      this.state.guardianAngelEnabled = partial.guardianAngelEnabled;
    }
    if (typeof partial.sheriffEnabled === 'boolean') this.state.sheriffEnabled = partial.sheriffEnabled;
    if (typeof partial.engineerEnabled === 'boolean') this.state.engineerEnabled = partial.engineerEnabled;
    if (typeof partial.photoProofEnabled === 'boolean') this.state.photoProofEnabled = partial.photoProofEnabled;
    if (typeof partial.revealRoleOnEject === 'boolean') this.state.revealRoleOnEject = partial.revealRoleOnEject;
    for (const key of Object.keys(TIMER_LIMITS) as TimerSetting[]) {
      const value = partial[key];
      if (typeof value === 'number' && Number.isFinite(value)) this.state[key] = clampTimer(key, value);
    }
    if (Array.isArray(partial.customTasks)) {
      this.state.customTasks = partial.customTasks
        .slice(0, MAX_CUSTOM_TASKS * 2)
        .filter((t): t is string => typeof t === 'string')
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
    const now = Date.now();
    const ids = shuffle(this.state.playerOrder);
    const impostorIds = new Set(ids.slice(0, this.state.impostorCount));
    const crewmateIds = this.state.playerOrder.filter((id) => !impostorIds.has(id));

    // Each special role, when enabled, goes to a distinct crewmate, falling back to
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

    // Host-typed custom tasks are guaranteed a slot (up to capacity), then the
    // rest of the pool is filled with a random slice of the built-in tasks,
    // so a host's own tasks reliably show up even though the built-in pool is
    // much bigger than any single round's task count.
    const customTaskList = buildCustomTasks(this.state.customTasks);
    const neededTasks = this.state.playerOrder.length * this.state.tasksPerPlayer;
    const builtInNeeded = Math.max(0, neededTasks - customTaskList.length);
    const pool = shuffle(customTaskList.concat(shuffle(ALL_TASKS).slice(0, builtInNeeded)));
    const commonTask = COMMON_TASKS[Math.floor(Math.random() * COMMON_TASKS.length)];
    this.state.commonTask = commonTask;
    this.state.taskPhotos = new Map();

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
      // Kill and vent are both available the moment roles are dealt; each only
      // goes on cooldown after its own first use this round.
      player.killCooldownUntil = 0;
      player.ventCooldownUntil = 0;
      player.bodyFound = false;
      player.reportBlockedUntil = 0;

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
    this.state.gameStartedAt = now;
    this.state.gameEndsAt = now + this.state.gameMinutes * 60_000;
    this.state.sabotageUsesRemaining = SABOTAGE_MAX_USES;
    this.state.sabotageAvailableAt = 0;
    this.state.sabotagePuzzle = null;
    this.state.sabotageStartedAt = null;
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
    // Ghosts keep working their list. A dead crewmate's unfinished tasks
    // still block the crew's task-completion win, same as real Among Us.
    const player = this.state.players.get(playerId);
    if (!player) return false;
    const task = player.tasks.find((t) => t.taskId === taskId);
    if (!task) return false;
    // When photo proof is on, every task can only be completed via
    // submitTaskPhoto, not this plain tap-to-complete path.
    if (this.state.photoProofEnabled) return false;
    task.done = true;
    this.touch();
    return true;
  }

  /** Completes a task with a photo attached, when photoProofEnabled is on. */
  submitTaskPhoto(
    playerId: string,
    taskId: string,
    photoDataUrl: string
  ): { ok: true } | { ok: false; error: string } {
    const player = this.state.players.get(playerId);
    if (!player) return { ok: false, error: 'Player not found.' };
    const task = player.tasks.find((t) => t.taskId === taskId);
    if (!task) {
      return { ok: false, error: 'Task not found.' };
    }
    // Only an inline image is accepted. Anything else (a remote URL, say)
    // would load on every other player's phone in the recap gallery.
    if (typeof photoDataUrl !== 'string' || !PHOTO_DATA_URL.test(photoDataUrl)) {
      return { ok: false, error: "That photo couldn't be read. Try taking it again." };
    }
    if (photoDataUrl.length > MAX_TASK_PHOTO_CHARS) {
      return { ok: false, error: 'Photo is too large.' };
    }
    const previous = this.state.taskPhotos.get(taskId)?.photoDataUrl.length ?? 0;
    if (this.photoChars() - previous + photoDataUrl.length > MAX_ROOM_PHOTO_CHARS) {
      return { ok: false, error: 'This room is out of photo space. Ask the host to turn photo proof off.' };
    }
    task.done = true;
    this.state.taskPhotos.set(taskId, {
      playerId,
      playerName: player.name,
      taskId,
      taskText: task.text,
      common: task.common,
      photoDataUrl,
    });
    this.touch();
    return { ok: true };
  }

  /** How much photo data this room is holding, in characters of data URL. */
  photoChars(): number {
    let total = 0;
    for (const p of this.state.taskPhotos.values()) total += p.photoDataUrl.length;
    return total;
  }

  /** Every submitted task photo this round, for the end-of-game recap. */
  getTaskPhotos(): TaskPhoto[] {
    return Array.from(this.state.taskPhotos.values());
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
      return { ok: false, error: "Can't kill yet, still on cooldown." };
    }
    if (!this.isInPlay(target) || target.role === 'impostor') {
      return { ok: false, error: 'Invalid target.' };
    }
    if (targetId === this.state.protectedPlayerId) {
      this.state.protectedPlayerId = null;
      this.touch();
      // Deliberately the same generic message as any other invalid target.
      // The impostor should never be able to tell a shield apart from a
      // wrong guess.
      return { ok: false, error: 'Invalid target.', reason: 'shield' };
    }
    return { ok: true };
  }

  private finalizeKill(killerId: string, targetId: string): GameOverInfo | null {
    const killer = this.state.players.get(killerId)!;
    const target = this.state.players.get(targetId)!;
    target.status = 'dead';
    killer.killCooldownUntil = Date.now() + this.state.killCooldownSeconds * 1000;
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

  /** Each impostor has their own vent cooldown, independent of kill. */
  isVentAvailable(playerId: string): boolean {
    const player = this.state.players.get(playerId);
    if (!player || player.role !== 'impostor' || player.status !== 'alive') return false;
    return Date.now() >= player.ventCooldownUntil;
  }

  triggerVent(playerId: string): boolean {
    const player = this.state.players.get(playerId);
    if (!player || player.role !== 'impostor' || player.status !== 'alive') return false;
    if (Date.now() < player.ventCooldownUntil) return false;
    player.ventCooldownUntil = Date.now() + VENT_COOLDOWN_MS;
    this.touch();
    return true;
  }

  /**
   * Spends a sabotage charge to start the unscramble minigame: two scrambled
   * words the whole room can see. While either stays unsolved the shared
   * clock drains at 1.5x. Solving both stops it and starts the cooldown.
   */
  triggerSabotage(
    playerId: string
  ):
    | { ok: true; scrambled: [string, string]; usesRemaining: number }
    | { ok: false; error: string } {
    const player = this.state.players.get(playerId);
    if (!player || player.role !== 'impostor' || player.status !== 'alive') {
      return { ok: false, error: 'Only a living impostor can do that.' };
    }
    if (this.state.phase !== 'playing') {
      return { ok: false, error: 'Can only sabotage during play.' };
    }
    if (this.state.sabotagePuzzle) {
      return { ok: false, error: 'A sabotage is already in progress.' };
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

    const words = pickTwoSabotageWords();
    const scrambled: [string, string] = [scrambleWord(words[0]), scrambleWord(words[1])];
    this.state.sabotageUsesRemaining -= 1;
    this.state.sabotagePuzzle = { words, scrambled, solved: [false, false] };
    this.state.sabotageStartedAt = Date.now();
    this.touch();
    return { ok: true, scrambled, usesRemaining: this.state.sabotageUsesRemaining };
  }

  /** Applies one tick of the accelerated clock drain while a sabotage puzzle is unsolved. */
  applySabotageDrainTick(elapsedMs: number) {
    if (!this.state.sabotagePuzzle || this.state.gameEndsAt === null) return;
    this.state.gameEndsAt -= elapsedMs * SABOTAGE_EXTRA_DRAIN_RATE;
    this.touch();
  }

  /** A guess at one of the two active sabotage words. Case-insensitive. */
  submitUnscrambleGuess(
    playerId: string,
    wordIndex: 0 | 1,
    guess: string
  ): { ok: true; wordIndex: 0 | 1; bothSolved: boolean } | { ok: false; error: string } {
    const puzzle = this.state.sabotagePuzzle;
    if (!puzzle) return { ok: false, error: 'No sabotage in progress.' };
    const player = this.state.players.get(playerId);
    if (!player || player.isSpectator) {
      return { ok: false, error: "Spectators can't help with this." };
    }
    if ((wordIndex !== 0 && wordIndex !== 1) || typeof guess !== 'string' || guess.length > 40) {
      return { ok: false, error: 'Not quite.' };
    }
    if (puzzle.solved[wordIndex]) {
      return { ok: false, error: 'That word is already solved.' };
    }
    if (guess.trim().toUpperCase() !== puzzle.words[wordIndex].toUpperCase()) {
      return { ok: false, error: 'Not quite.' };
    }

    puzzle.solved[wordIndex] = true;
    const bothSolved = puzzle.solved[0] && puzzle.solved[1];
    if (bothSolved) {
      this.state.sabotagePuzzle = null;
      this.state.sabotageStartedAt = null;
      this.state.sabotageAvailableAt = Date.now() + SABOTAGE_COOLDOWN_MS;
    }
    this.touch();
    return { ok: true, wordIndex, bothSolved };
  }

  isGameClockExpired(): boolean {
    return this.state.phase === 'playing' && this.state.gameEndsAt !== null && Date.now() >= this.state.gameEndsAt;
  }

  /** If the clock has run out mid-play, the impostors win by default. */
  expireGameClock(): GameOverInfo | null {
    if (!this.isGameClockExpired()) return null;
    this.state.winner = 'impostors';
    this.state.phase = 'ended';
    this.recordWin('impostors');
    this.touch();
    return this.gameOverInfo('impostors', 'time-up');
  }

  callMeeting(callerId: string, reason: MeetingReason): { ok: true; meeting: MeetingState } | { ok: false; error: string } {
    const caller = this.state.players.get(callerId);
    if (!caller || caller.status !== 'alive' || caller.isSpectator) {
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

    caller.meetingsCalled += 1;
    return { ok: true, meeting: this.openMeeting(caller, reason, null) };
  }

  /**
   * A living player found a body and reports it. Unlike an emergency meeting
   * this is free: it doesn't use up the reporter's one meeting and ignores the
   * meeting cooldown, same as Among Us. It only works on a body nobody has
   * found yet; a report that doesn't (wrong person, someone alive) is refused
   * and the reporter has to wait a bit, so it can't be used to probe who's
   * dead.
   */
  reportBody(reporterId: string, bodyId: string): { ok: true; meeting: MeetingState } | { ok: false; error: string } {
    const reporter = this.state.players.get(reporterId);
    if (!this.isInPlay(reporter)) return { ok: false, error: 'Only living players can report a body.' };
    if (this.state.phase !== 'playing') return { ok: false, error: 'Can only report a body during play.' };
    const now = Date.now();
    if (now < reporter.reportBlockedUntil) {
      return { ok: false, error: 'Hold on a moment before reporting again.' };
    }
    const body = this.state.players.get(bodyId);
    if (!body || body.status !== 'dead' || body.bodyFound || body.isSpectator || bodyId === reporterId) {
      reporter.reportBlockedUntil = now + REPORT_RETRY_MS;
      this.touch();
      return { ok: false, error: "That isn't a body anyone has found yet." };
    }
    return { ok: true, meeting: this.openMeeting(reporter, 'report', body) };
  }

  private openMeeting(caller: ServerPlayer, reason: MeetingReason, body: ServerPlayer | null): MeetingState {
    const now = Date.now();
    // Everyone sees who's dead at a meeting, so every body counts as found from here on.
    for (const p of this.state.players.values()) {
      if (p.status === 'dead') p.bodyFound = true;
    }
    this.state.phase = 'meeting';
    const discussionMs = this.state.discussionSeconds * 1000;
    this.state.meeting = {
      calledBy: caller.id,
      calledByName: caller.name,
      reason,
      phase: 'discussion',
      discussionEndsAt: now + discussionMs,
      votingEndsAt: now + discussionMs + this.state.votingSeconds * 1000,
      votes: new Map(),
      bodyId: body?.id ?? null,
    };
    this.touch();
    return this.publicMeeting()!;
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
    if (!voter || voter.status !== 'alive' || voter.isSpectator) return false;
    if (targetId !== 'skip' && !this.isInPlay(this.state.players.get(targetId))) return false;
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
        p.bodyFound = true;
        eliminatedName = p.name;
        eliminatedRole = p.role;
      }
    }

    // Votes are never anonymous: everyone sees who voted for whom.
    const votes: CastVote[] = Array.from(meeting.votes.entries()).map(([voterId, targetId]) => ({
      voterId,
      voterName: this.state.players.get(voterId)?.name ?? 'Someone',
      targetId,
    }));

    this.touch();
    const winner = this.checkWinConditions();
    const roleHidden = !this.state.revealRoleOnEject && eliminatedId !== null;

    return {
      result: {
        eliminatedId,
        eliminatedName,
        eliminatedRole: roleHidden ? null : eliminatedRole,
        tally,
        votes,
        wasTie,
        roleHidden,
      },
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
    if (!this.isInPlay(target) || targetId === judgeId) {
      return { ok: false, error: 'Invalid target.' };
    }

    judge.specialRoleUsed = true;

    let eliminatedId: string;
    let eliminatedName: string;
    let eliminatedRole: 'crewmate' | 'impostor';
    let judgeMisfired = false;

    if (target.role === 'impostor') {
      target.status = 'dead';
      target.bodyFound = true;
      eliminatedId = target.id;
      eliminatedName = target.name;
      eliminatedRole = 'impostor';
    } else {
      judge.status = 'dead';
      judge.bodyFound = true;
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
        votes: [],
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
    if (!this.isInPlay(target)) {
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
   * instead. Resolves silently, like an impostor's kill: the body is only
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
    if (!this.isInPlay(target) || targetId === sheriffId) {
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

  /** The Engineer's one-time decoy blackout vent, identical to a real vent, for misdirection. */
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

  /** Credits a win to every player on the winning side, dead or alive, same as real Among Us. */
  private recordWin(winner: 'crewmates' | 'impostors') {
    for (const id of this.state.playerOrder) {
      const p = this.state.players.get(id)!;
      const onWinningSide =
        (winner === 'crewmates' && p.role === 'crewmate') || (winner === 'impostors' && p.role === 'impostor');
      if (onWinningSide) {
        this.state.wins.set(id, (this.state.wins.get(id) ?? 0) + 1);
      }
    }
  }

  checkWinConditions(): GameOverInfo | null {
    if (this.state.winner) return null;
    const impostorsAlive = this.aliveImpostors.length;
    const crewmatesAlive = this.aliveCrewmates.length;

    let winner: 'crewmates' | 'impostors' | null = null;
    let reason: GameOverReason = 'impostors-caught';
    if (impostorsAlive === 0) {
      winner = 'crewmates';
      reason = 'impostors-caught';
    } else if (impostorsAlive >= crewmatesAlive) {
      winner = 'impostors';
      reason = 'impostors-outnumber';
    } else {
      // Every crewmate's tasks have to be done, dead or alive; a ghost's
      // unfinished list still blocks the win, same as real Among Us.
      const allCrewmates = this.allCrewmates;
      const crewmatesDoneWithTasks =
        allCrewmates.length > 0 && allCrewmates.every((p) => p.tasks.every((t) => t.done));
      if (crewmatesDoneWithTasks) {
        winner = 'crewmates';
        reason = 'tasks-complete';
      }
    }

    if (!winner) return null;

    this.state.winner = winner;
    this.state.phase = 'ended';
    this.recordWin(winner);
    return this.gameOverInfo(winner, reason);
  }

  gameOverInfo(winner: 'crewmates' | 'impostors', reason: GameOverReason): GameOverInfo {
    const { done, total } = this.crewTaskProgress();
    return {
      winner,
      reason,
      players: this.state.playerOrder
        .map((id) => this.state.players.get(id)!)
        // Mid-round spectators were never dealt in, so they have no role to reveal.
        .filter((p) => !p.isSpectator && p.role)
        .map((p) => ({ id: p.id, name: p.name, role: p.role ?? 'crewmate', status: p.status })),
      tasksCompleted: done,
      tasksTotal: total,
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
      p.ventCooldownUntil = 0;
      // Anyone who joined mid-round as a spectator is a full player from here on.
      p.isSpectator = false;
    }
    this.state.phase = 'lobby';
    this.state.meeting = null;
    this.state.winner = null;
    this.state.pendingKill = null;
    this.state.nextMeetingAvailableAt = 0;
    this.state.gameEndsAt = null;
    this.state.sabotageUsesRemaining = SABOTAGE_MAX_USES;
    this.state.sabotageAvailableAt = 0;
    this.state.sabotagePuzzle = null;
    this.state.sabotageStartedAt = null;
    this.state.judgeId = null;
    this.state.guardianAngelId = null;
    this.state.sheriffId = null;
    this.state.engineerId = null;
    this.state.protectedPlayerId = null;
    this.state.gameStartedAt = null;
    this.state.commonTask = null;
    this.state.taskPhotos = new Map();
    this.touch();
  }

  /**
   * A player joining after the round has already started, when the host has
   * left late joiners on "play now": dealt straight in as a crewmate with a
   * fresh task list (plus the round's shared common task), never an
   * impostor and never a special role, since those were only ever fair to
   * assign at the original startGame().
   */
  addLateJoinerAsCrewmate(name: string): { player: ServerPlayer; info: PrivateInfo } {
    const player = this.addPlayer(name, false, false);
    const pool = shuffle(ALL_TASKS.concat(buildCustomTasks(this.state.customTasks)));
    const slice: PlayerTask[] = [];
    for (let i = 0; i < this.state.tasksPerPlayer; i++) {
      const t = pool[i % pool.length];
      slice.push({
        taskId: `${player.id}:${t.id}:${i}`,
        text: t.text,
        room: t.room,
        done: false,
        visual: t.visual,
        common: false,
      });
    }
    const commonTask = this.state.commonTask;
    if (commonTask) {
      slice.push({
        taskId: `${player.id}:${commonTask.id}`,
        text: commonTask.text,
        room: commonTask.room,
        done: false,
        visual: commonTask.visual,
        common: true,
      });
    }
    player.role = 'crewmate';
    player.tasks = slice;
    player.status = 'alive';
    this.touch();
    return { player, info: { role: 'crewmate', tasks: slice } };
  }

  /** Host-only, lobby-only: removes a player from the room outright. */
  kickPlayer(hostId: string, targetId: string): { ok: true; socketId: string | null } | { ok: false; error: string } {
    const host = this.state.players.get(hostId);
    if (!host?.isHost) return { ok: false, error: 'Only the host can do that.' };
    if (this.state.phase !== 'lobby') return { ok: false, error: 'Can only remove players in the lobby.' };
    if (targetId === hostId) return { ok: false, error: "You can't remove yourself. Leave instead." };
    const target = this.state.players.get(targetId);
    if (!target) return { ok: false, error: 'Player not found.' };

    const socketId = target.socketId;
    this.state.players.delete(targetId);
    this.state.playerOrder = this.state.playerOrder.filter((id) => id !== targetId);
    this.state.wins.delete(targetId);
    this.touch();
    return { ok: true, socketId };
  }

  /** Host-only: hands host powers to another connected player, at any phase. */
  transferHost(hostId: string, targetId: string): { ok: true } | { ok: false; error: string } {
    const host = this.state.players.get(hostId);
    if (!host?.isHost) return { ok: false, error: 'Only the host can do that.' };
    if (targetId === hostId) return { ok: false, error: "You're already the host." };
    const target = this.state.players.get(targetId);
    if (!target || !target.connected) return { ok: false, error: 'Player not found.' };

    host.isHost = false;
    target.isHost = true;
    this.touch();
    return { ok: true };
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
      bodyId: m.bodyId,
      bodyName: m.bodyId ? (this.state.players.get(m.bodyId)?.name ?? null) : null,
    };
  }

  /**
   * `viewerId` personalizes the result: impostors get to see everyone's real
   * alive/dead status at all times (they're the informed side and should
   * know who's already dead, including deaths they didn't cause themselves,
   * like a Sheriff's misfire), while crewmates only see it once a meeting
   * reveals it. Omit `viewerId` for the fully-masked default.
   */
  publicState(viewerId?: string): RoomStateSummary {
    const viewer = viewerId ? this.state.players.get(viewerId) : undefined;
    const revealStatus =
      this.state.phase === 'meeting' || this.state.phase === 'ended' || viewer?.role === 'impostor';
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
        lateJoinersPlayNow: this.state.lateJoinersPlayNow,
        photoProofEnabled: this.state.photoProofEnabled,
        gameMinutes: this.state.gameMinutes,
        discussionSeconds: this.state.discussionSeconds,
        votingSeconds: this.state.votingSeconds,
        killCooldownSeconds: this.state.killCooldownSeconds,
        revealRoleOnEject: this.state.revealRoleOnEject,
      },
      players: this.state.playerOrder
        .map((id) => this.state.players.get(id)!)
        .filter((p) => p.connected || this.state.phase !== 'lobby')
        .map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          status: revealStatus ? p.status : 'alive',
          isSpectator: p.isSpectator,
          wins: this.state.wins.get(p.id) ?? 0,
        })),
      meeting: this.publicMeeting(),
      gameEndsAt: this.state.gameEndsAt,
      crewTaskProgress: this.crewTaskProgress(),
      sabotagePuzzle: this.state.sabotagePuzzle
        ? { scrambled: this.state.sabotagePuzzle.scrambled, solved: this.state.sabotagePuzzle.solved }
        : null,
    };
  }

  /** Aggregate crew task completion, same info the classic Among Us task bar shows everyone. */
  private crewTaskProgress(): { done: number; total: number } {
    const allCrew = this.allCrewmates;
    return {
      done: allCrew.reduce((sum, p) => sum + p.tasks.filter((t) => t.done).length, 0),
      total: allCrew.reduce((sum, p) => sum + p.tasks.length, 0),
    };
  }
}
