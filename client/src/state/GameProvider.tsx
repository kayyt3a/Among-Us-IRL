import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type {
  GameOverInfo,
  MeetingReason,
  MeetingResult,
  PlayerRole,
  PlayerTask,
  PrivateGameInfo,
  RoomSettings,
  RoomStateSummary,
  SpecialRole,
} from '@irl-impostor/shared';
import { socket } from '../socket';
import { playProximityTone, requestMicPermission, scanForTone } from '../audio/proximity';
import {
  alertClockLow,
  alertGameOver,
  alertMeetingCalled,
  alertSabotage,
  alertSabotageStopped,
  alertSabotageWordSolved,
  alertVent,
  alertYouDied,
  bumpKillConfirmed,
} from '../audio/feedback';

const STORAGE_KEY = 'irl-impostor-session';

interface Session {
  code: string;
  playerId: string;
  name: string;
}

interface KillAttemptState {
  status: 'idle' | 'pending' | 'listening' | 'failed';
  targetId: string | null;
  targetName: string | null;
  reason?: string;
  windowMs?: number;
}

const idleKillAttempt: KillAttemptState = { status: 'idle', targetId: null, targetName: null };

interface State {
  connected: boolean;
  connecting: boolean;
  session: Session | null;
  room: RoomStateSummary | null;
  myRole: PlayerRole | null;
  myTasks: PlayerTask[];
  fellowImpostors: { id: string; name: string }[];
  dead: boolean;
  meetingResult: MeetingResult | null;
  gameOver: GameOverInfo | null;
  error: string | null;
  ventNonce: number;
  ventDurationMs: number;
  killAttempt: KillAttemptState;
  mySpecialRole: SpecialRole | null;
  /** Optimistic: set locally the moment the Judge/Guardian Angel ability is used. */
  specialRoleUsed: boolean;
  sabotageUsesRemaining: number;
  sabotageAvailableAt: number;
}

type Action =
  | { type: 'connected'; value: boolean }
  | { type: 'connecting'; value: boolean }
  | { type: 'session'; session: Session | null }
  | { type: 'room_update'; room: RoomStateSummary }
  | { type: 'room_clear' }
  | { type: 'game_started'; payload: PrivateGameInfo }
  | { type: 'task_local_done'; taskId: string }
  | { type: 'you_died' }
  | { type: 'vent'; durationMs: number }
  | { type: 'meeting_result'; result: MeetingResult }
  | { type: 'clear_meeting_result' }
  | { type: 'game_over'; info: GameOverInfo }
  | { type: 'error'; message: string | null }
  | { type: 'reset_round' }
  | { type: 'kill_attempt_start'; targetId: string; targetName: string }
  | { type: 'kill_listen_start'; windowMs: number }
  | { type: 'kill_attempt_success' }
  | { type: 'kill_attempt_failed'; reason: string }
  | { type: 'kill_attempt_cancel' }
  | { type: 'sabotage_status'; usesRemaining: number; availableAt: number }
  | { type: 'special_role_used' }
  | { type: 'kicked' };

const initialState: State = {
  connected: false,
  connecting: true,
  session: null,
  room: null,
  myRole: null,
  myTasks: [],
  fellowImpostors: [],
  dead: false,
  meetingResult: null,
  gameOver: null,
  error: null,
  ventNonce: 0,
  ventDurationMs: 4000,
  killAttempt: idleKillAttempt,
  mySpecialRole: null,
  specialRoleUsed: false,
  sabotageUsesRemaining: 0,
  sabotageAvailableAt: 0,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: action.value, connecting: false };
    case 'connecting':
      return { ...state, connecting: action.value };
    case 'session':
      return { ...state, session: action.session };
    case 'room_update':
      return { ...state, room: action.room };
    case 'room_clear':
      return { ...state, room: null };
    case 'game_started':
      return {
        ...state,
        myRole: action.payload.role,
        myTasks: action.payload.tasks,
        fellowImpostors: action.payload.fellowImpostors ?? [],
        mySpecialRole: action.payload.specialRole ?? null,
        specialRoleUsed: false,
        dead: false,
        gameOver: null,
      };
    case 'task_local_done':
      return {
        ...state,
        myTasks: state.myTasks.map((t) => (t.taskId === action.taskId ? { ...t, done: true } : t)),
      };
    case 'you_died':
      return { ...state, dead: true };
    case 'vent':
      return { ...state, ventNonce: state.ventNonce + 1, ventDurationMs: action.durationMs };
    case 'meeting_result':
      return { ...state, meetingResult: action.result };
    case 'clear_meeting_result':
      return { ...state, meetingResult: null };
    case 'game_over':
      return { ...state, gameOver: action.info };
    case 'error':
      return { ...state, error: action.message };
    case 'reset_round':
      return {
        ...state,
        myRole: null,
        myTasks: [],
        fellowImpostors: [],
        dead: false,
        meetingResult: null,
        gameOver: null,
        killAttempt: idleKillAttempt,
        mySpecialRole: null,
        specialRoleUsed: false,
        sabotageUsesRemaining: 0,
        sabotageAvailableAt: 0,
      };
    case 'sabotage_status':
      return { ...state, sabotageUsesRemaining: action.usesRemaining, sabotageAvailableAt: action.availableAt };
    case 'special_role_used':
      return { ...state, specialRoleUsed: true };
    case 'kicked':
      return {
        ...state,
        session: null,
        room: null,
        myRole: null,
        myTasks: [],
        fellowImpostors: [],
        dead: false,
        meetingResult: null,
        gameOver: null,
        killAttempt: idleKillAttempt,
        mySpecialRole: null,
        specialRoleUsed: false,
        sabotageUsesRemaining: 0,
        sabotageAvailableAt: 0,
        error: 'You were removed from the room by the host.',
      };
    case 'kill_attempt_start':
      return {
        ...state,
        killAttempt: { status: 'pending', targetId: action.targetId, targetName: action.targetName },
      };
    case 'kill_listen_start':
      return {
        ...state,
        killAttempt: { ...state.killAttempt, status: 'listening', windowMs: action.windowMs },
      };
    case 'kill_attempt_success':
      return { ...state, killAttempt: idleKillAttempt };
    case 'kill_attempt_failed':
      return { ...state, killAttempt: { ...state.killAttempt, status: 'failed', reason: action.reason } };
    case 'kill_attempt_cancel':
      return { ...state, killAttempt: idleKillAttempt };
    default:
      return state;
  }
}

interface GameApi extends State {
  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => Promise<void>;
  leaveGame: () => void;
  updateSettings: (partial: Partial<RoomSettings>) => void;
  startGame: () => void;
  kickPlayer: (targetId: string) => void;
  transferHost: (targetId: string) => void;
  completeTask: (taskId: string) => void;
  /** Honor-code instant kill, no proximity check. The manual fallback. */
  killPlayer: (targetId: string) => void;
  /** Proximity-verified kill attempt via the audio handshake. */
  attemptKill: (targetId: string, targetName: string) => void;
  cancelKillAttempt: () => void;
  triggerVent: () => void;
  triggerSabotage: () => void;
  submitUnscrambleGuess: (wordIndex: 0 | 1, guess: string) => Promise<boolean>;
  judgeOverrule: (targetId: string) => void;
  guardianProtect: (targetId: string) => void;
  sheriffShoot: (targetId: string) => void;
  engineerVent: () => void;
  callMeeting: (reason: MeetingReason) => void;
  castVote: (targetId: string | 'skip') => void;
  playAgain: () => void;
  dismissMeetingResult: () => void;
  dismissError: () => void;
  isHost: boolean;
  me: RoomStateSummary['players'][number] | null;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const killToneStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: Session | null = raw ? JSON.parse(raw) : null;

    function onConnect() {
      dispatch({ type: 'connected', value: true });
      const current = saved ?? stateRef.current.session;
      if (current) {
        socket.emit('rejoin_room', { code: current.code, playerId: current.playerId }, (res) => {
          if (res.ok) {
            dispatch({ type: 'session', session: current });
          } else {
            localStorage.removeItem(STORAGE_KEY);
            dispatch({ type: 'session', session: null });
          }
        });
      } else {
        dispatch({ type: 'connecting', value: false });
      }
    }
    function onDisconnect() {
      dispatch({ type: 'connected', value: false });
    }
    function onRoomUpdate(room: RoomStateSummary) {
      dispatch({ type: 'room_update', room });
    }
    function onGameStarted(payload: PrivateGameInfo) {
      dispatch({ type: 'game_started', payload });
      requestMicPermission().then((available) => {
        socket.emit('report_mic_status', { available });
      });
    }
    function onTaskAck(payload: { taskId: string }) {
      dispatch({ type: 'task_local_done', taskId: payload.taskId });
    }
    function onYouDied() {
      alertYouDied();
      dispatch({ type: 'you_died' });
    }
    function onMeetingCalled() {
      alertMeetingCalled();
    }
    function onVent(payload: { durationMs: number }) {
      alertVent();
      dispatch({ type: 'vent', durationMs: payload.durationMs });
    }
    function onMeetingResult(result: MeetingResult) {
      dispatch({ type: 'meeting_result', result });
    }
    function onGameOver(info: GameOverInfo) {
      const myRole = stateRef.current.session
        ? info.players.find((p) => p.id === stateRef.current.session!.playerId)?.role
        : undefined;
      const won = myRole ? (myRole === 'impostor') === (info.winner === 'impostors') : info.winner === 'crewmates';
      alertGameOver(won);
      dispatch({ type: 'game_over', info });
    }
    function onError(payload: { message: string }) {
      dispatch({ type: 'error', message: payload.message });
    }
    function onKillResult(payload: { ok: boolean; message?: string }) {
      if (payload.ok) {
        bumpKillConfirmed();
      } else if (payload.message) {
        dispatch({ type: 'error', message: payload.message });
      }
    }
    function onAbilityResult(payload: { ok: boolean; message?: string }) {
      if (payload.message) dispatch({ type: 'error', message: payload.message });
    }
    function onKicked() {
      localStorage.removeItem(STORAGE_KEY);
      dispatch({ type: 'kicked' });
    }
    function onKillListenStart(payload: { frequencyHz: number; windowMs: number }) {
      killToneStopRef.current?.();
      killToneStopRef.current = playProximityTone(payload.frequencyHz, payload.windowMs);
      dispatch({ type: 'kill_listen_start', windowMs: payload.windowMs });
    }
    function onKillAttemptResult(payload: { ok: boolean; instant?: boolean; reason?: string }) {
      killToneStopRef.current?.();
      killToneStopRef.current = null;
      if (payload.ok) {
        bumpKillConfirmed();
        dispatch({ type: 'kill_attempt_success' });
      } else {
        dispatch({ type: 'kill_attempt_failed', reason: payload.reason ?? 'Could not verify.' });
      }
    }
    function onBeginProximityScan(payload: { windowMs: number; candidateFrequencies: number[] }) {
      // Silent: no UI change here, so the target is never tipped off mid-scan.
      scanForTone(payload.candidateFrequencies, payload.windowMs, (frequencyHz) => {
        socket.emit('tone_detected', { frequencyHz });
      });
    }
    function onSabotageStatus(payload: { usesRemaining: number; availableAt: number }) {
      dispatch({ type: 'sabotage_status', usesRemaining: payload.usesRemaining, availableAt: payload.availableAt });
    }
    function onSabotageTriggered() {
      alertSabotage();
      dispatch({ type: 'error', message: '⚠ Sabotage! Unscramble both words to stop it.' });
    }
    function onSabotageWordSolved() {
      alertSabotageWordSolved();
    }
    function onSabotageStopped() {
      alertSabotageStopped();
    }
    function onGuardianProtectionUsed() {
      dispatch({ type: 'error', message: 'Your shield saved someone from elimination.' });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_update', onRoomUpdate);
    socket.on('game_started', onGameStarted);
    socket.on('task_ack', onTaskAck);
    socket.on('you_died', onYouDied);
    socket.on('meeting_called', onMeetingCalled);
    socket.on('vent_triggered', onVent);
    socket.on('meeting_result', onMeetingResult);
    socket.on('game_over', onGameOver);
    socket.on('error_message', onError);
    socket.on('kill_result', onKillResult);
    socket.on('kill_listen_start', onKillListenStart);
    socket.on('kill_attempt_result', onKillAttemptResult);
    socket.on('begin_proximity_scan', onBeginProximityScan);
    socket.on('sabotage_status', onSabotageStatus);
    socket.on('sabotage_triggered', onSabotageTriggered);
    socket.on('sabotage_word_solved', onSabotageWordSolved);
    socket.on('sabotage_stopped', onSabotageStopped);
    socket.on('guardian_protection_used', onGuardianProtectionUsed);
    socket.on('ability_result', onAbilityResult);
    socket.on('kicked', onKicked);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_update', onRoomUpdate);
      socket.off('game_started', onGameStarted);
      socket.off('task_ack', onTaskAck);
      socket.off('you_died', onYouDied);
      socket.off('meeting_called', onMeetingCalled);
      socket.off('vent_triggered', onVent);
      socket.off('meeting_result', onMeetingResult);
      socket.off('game_over', onGameOver);
      socket.off('error_message', onError);
      socket.off('kill_result', onKillResult);
      socket.off('kill_listen_start', onKillListenStart);
      socket.off('kill_attempt_result', onKillAttemptResult);
      socket.off('begin_proximity_scan', onBeginProximityScan);
      socket.off('sabotage_status', onSabotageStatus);
      socket.off('sabotage_triggered', onSabotageTriggered);
      socket.off('sabotage_word_solved', onSabotageWordSolved);
      socket.off('sabotage_stopped', onSabotageStopped);
      socket.off('guardian_protection_used', onGuardianProtectionUsed);
      socket.off('ability_result', onAbilityResult);
      socket.off('kicked', onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.room?.phase === 'lobby' && (state.myRole || state.gameOver)) {
      dispatch({ type: 'reset_round' });
    }
  }, [state.room?.phase, state.myRole, state.gameOver]);

  useEffect(() => {
    const endsAt = state.room?.gameEndsAt;
    if (!endsAt) return;
    const msUntilWarning = endsAt - 60_000 - Date.now();
    if (msUntilWarning <= 0) return;
    const t = setTimeout(alertClockLow, msUntilWarning);
    return () => clearTimeout(t);
  }, [state.room?.gameEndsAt]);

  const api = useMemo<GameApi>(() => {
    const me = state.room?.players.find((p) => p.id === state.session?.playerId) ?? null;
    return {
      ...state,
      me,
      isHost: !!me?.isHost,
      createRoom: (name: string) =>
        new Promise<void>((resolve) => {
          socket.emit('create_room', { name }, (res) => {
            if (res.ok) {
              const session = { code: res.code, playerId: res.playerId, name };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
              dispatch({ type: 'session', session });
              dispatch({ type: 'error', message: null });
            } else {
              dispatch({ type: 'error', message: res.error });
            }
            resolve();
          });
        }),
      joinRoom: (code: string, name: string) =>
        new Promise<void>((resolve) => {
          socket.emit('join_room', { code: code.toUpperCase(), name }, (res) => {
            if (res.ok) {
              const session = { code: res.code, playerId: res.playerId, name };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
              dispatch({ type: 'session', session });
              dispatch({ type: 'error', message: null });
            } else {
              dispatch({ type: 'error', message: res.error });
            }
            resolve();
          });
        }),
      leaveGame: () => {
        localStorage.removeItem(STORAGE_KEY);
        dispatch({ type: 'session', session: null });
        dispatch({ type: 'reset_round' });
        dispatch({ type: 'room_clear' });
        socket.disconnect();
        socket.connect();
      },
      updateSettings: (partial) => socket.emit('update_settings', partial),
      startGame: () => socket.emit('start_game'),
      kickPlayer: (targetId: string) => socket.emit('kick_player', { targetId }),
      transferHost: (targetId: string) => socket.emit('transfer_host', { targetId }),
      completeTask: (taskId: string) => {
        dispatch({ type: 'task_local_done', taskId });
        socket.emit('complete_task', { taskId });
      },
      killPlayer: (targetId: string) => socket.emit('kill_player', { targetId }),
      attemptKill: (targetId: string, targetName: string) => {
        dispatch({ type: 'kill_attempt_start', targetId, targetName });
        socket.emit('attempt_kill', { targetId });
      },
      cancelKillAttempt: () => {
        killToneStopRef.current?.();
        killToneStopRef.current = null;
        socket.emit('cancel_kill_attempt');
        dispatch({ type: 'kill_attempt_cancel' });
      },
      triggerVent: () => socket.emit('trigger_vent'),
      triggerSabotage: () => socket.emit('trigger_sabotage'),
      submitUnscrambleGuess: (wordIndex: 0 | 1, guess: string) =>
        new Promise<boolean>((resolve) => {
          socket.emit('submit_unscramble', { wordIndex, guess }, (res) => resolve(res.ok));
        }),
      judgeOverrule: (targetId: string) => {
        dispatch({ type: 'special_role_used' });
        socket.emit('judge_overrule', { targetId });
      },
      guardianProtect: (targetId: string) => {
        dispatch({ type: 'special_role_used' });
        socket.emit('guardian_protect', { targetId });
      },
      sheriffShoot: (targetId: string) => {
        dispatch({ type: 'special_role_used' });
        socket.emit('sheriff_shoot', { targetId });
      },
      engineerVent: () => {
        dispatch({ type: 'special_role_used' });
        socket.emit('engineer_vent');
      },
      callMeeting: (reason: MeetingReason) => socket.emit('call_meeting', { reason }),
      castVote: (targetId: string | 'skip') => socket.emit('cast_vote', { targetId }),
      playAgain: () => socket.emit('play_again'),
      dismissMeetingResult: () => dispatch({ type: 'clear_meeting_result' }),
      dismissError: () => dispatch({ type: 'error', message: null }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
