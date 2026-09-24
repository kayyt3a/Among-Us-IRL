import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@irl-impostor/shared';
import { PROXIMITY_FREQUENCIES_HZ } from '@irl-impostor/shared';
import { GameRoom } from './gameRoom';
import { generateRoomCode } from './roomCode';
import { MAX_PLAYERS, ROOM_IDLE_CLEANUP_MS, VENT_DURATION_MS } from './constants';

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

const rooms = new Map<string, GameRoom>();
interface SocketMeta {
  code: string;
  playerId: string;
}
const socketMeta = new Map<string, SocketMeta>();
const meetingTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
const killAttemptTimers = new Map<string, ReturnType<typeof setTimeout>>();
const gameClockTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearMeetingTimers(code: string) {
  const timers = meetingTimers.get(code);
  if (timers) {
    timers.forEach(clearTimeout);
    meetingTimers.delete(code);
  }
}

function clearKillAttemptTimer(code: string) {
  const timer = killAttemptTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    killAttemptTimers.delete(code);
  }
}

function clearGameClockTimer(code: string) {
  const timer = gameClockTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    gameClockTimers.delete(code);
  }
}

function broadcastRoomUpdate(room: GameRoom) {
  io.to(room.state.code).emit('room_update', room.publicState());
}

function sendSabotageStatus(room: GameRoom) {
  for (const id of room.state.playerOrder) {
    const p = room.state.players.get(id)!;
    if (p.role === 'impostor' && p.socketId) {
      io.to(p.socketId).emit('sabotage_status', {
        usesRemaining: room.state.sabotageUsesRemaining,
        availableAt: room.state.sabotageAvailableAt,
      });
    }
  }
}

function notifyGuardianShieldUsed(room: GameRoom) {
  const guardian = room.state.guardianAngelId ? room.state.players.get(room.state.guardianAngelId) : null;
  if (guardian?.socketId) io.to(guardian.socketId).emit('guardian_protection_used');
}

/** Schedules the check that ends the game if the clock runs out mid-play. */
function scheduleGameClock(room: GameRoom) {
  const code = room.state.code;
  clearGameClockTimer(code);
  if (room.state.gameEndsAt === null) return;
  const timer = setTimeout(() => {
    const winner = room.expireGameClock();
    if (winner) {
      io.to(code).emit('game_over', winner);
      broadcastRoomUpdate(room);
    }
  }, Math.max(0, room.state.gameEndsAt - Date.now()));
  gameClockTimers.set(code, timer);
}

function finishMeeting(
  room: GameRoom,
  result: ReturnType<GameRoom['resolveMeeting']>['result'],
  winner: ReturnType<GameRoom['resolveMeeting']>['winner']
) {
  clearMeetingTimers(room.state.code);
  io.to(room.state.code).emit('meeting_result', result);
  room.closeMeeting();
  broadcastRoomUpdate(room);
  if (winner) {
    io.to(room.state.code).emit('game_over', winner);
  } else if (room.isGameClockExpired()) {
    // The clock could have run out while everyone was busy in the meeting.
    const timeoutWinner = room.expireGameClock();
    if (timeoutWinner) {
      io.to(room.state.code).emit('game_over', timeoutWinner);
      broadcastRoomUpdate(room);
    }
  } else {
    scheduleGameClock(room);
  }
}

function endMeetingAndBroadcast(room: GameRoom) {
  const { result, winner } = room.resolveMeeting();
  finishMeeting(room, result, winner);
}

function scheduleMeetingTimers(room: GameRoom) {
  const code = room.state.code;
  const meeting = room.state.meeting;
  if (!meeting) return;
  const now = Date.now();
  const timers: ReturnType<typeof setTimeout>[] = [];

  timers.push(
    setTimeout(() => {
      const updated = room.advanceMeetingToVoting();
      if (updated) {
        io.to(code).emit('meeting_phase_changed', updated);
        broadcastRoomUpdate(room);
      }
    }, Math.max(0, meeting.discussionEndsAt - now))
  );

  timers.push(
    setTimeout(() => {
      if (room.state.meeting && room.state.meeting.phase !== 'results') {
        endMeetingAndBroadcast(room);
      }
    }, Math.max(0, meeting.votingEndsAt - now))
  );

  meetingTimers.set(code, timers);
}

function findRoomOrEmitError(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
  const meta = socketMeta.get(socket.id);
  if (!meta) {
    socket.emit('error_message', { message: 'You are not in a room.' });
    return null;
  }
  const room = rooms.get(meta.code);
  if (!room) {
    socket.emit('error_message', { message: 'Room no longer exists.' });
    return null;
  }
  return { room, playerId: meta.playerId };
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name }, cb) => {
    if (!name || !name.trim()) return cb({ ok: false, error: 'Name is required.' });
    let code = generateRoomCode();
    while (rooms.has(code)) code = generateRoomCode();

    const room = new GameRoom(code);
    const player = room.addPlayer(name, true);
    player.socketId = socket.id;
    rooms.set(code, room);
    socketMeta.set(socket.id, { code, playerId: player.id });
    socket.join(code);

    cb({ ok: true, code, playerId: player.id });
    broadcastRoomUpdate(room);
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found.' });
    if (room.state.playerOrder.length >= MAX_PLAYERS) {
      return cb({ ok: false, error: 'Room is full.' });
    }
    if (!name || !name.trim()) return cb({ ok: false, error: 'Name is required.' });

    // Joining mid-round means watching this round as a spectator — they
    // become a full player automatically from the next round on.
    const isSpectator = room.state.phase !== 'lobby';
    const player = room.addPlayer(name, false, isSpectator);
    player.socketId = socket.id;
    socketMeta.set(socket.id, { code: room.state.code, playerId: player.id });
    socket.join(room.state.code);

    cb({ ok: true, code: room.state.code, playerId: player.id });
    broadcastRoomUpdate(room);
  });

  socket.on('rejoin_room', ({ code, playerId }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found.' });
    const player = room.state.players.get(playerId);
    if (!player) return cb({ ok: false, error: 'Player not found in room.' });

    player.socketId = socket.id;
    player.connected = true;
    socketMeta.set(socket.id, { code: room.state.code, playerId });
    socket.join(room.state.code);
    room.touch();

    cb({ ok: true });
    if (room.state.phase !== 'lobby' && player.role) {
      const info = room.getPrivateInfo(playerId);
      if (info) socket.emit('game_started', info);
      if (player.status === 'dead') socket.emit('you_died');
      if (player.role === 'impostor') {
        socket.emit('sabotage_status', {
          usesRemaining: room.state.sabotageUsesRemaining,
          availableAt: room.state.sabotageAvailableAt,
        });
      }
    }
    if (room.state.meeting) {
      socket.emit('meeting_called', room.publicMeeting()!);
    }
    broadcastRoomUpdate(room);
  });

  socket.on('update_settings', (payload) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const player = room.state.players.get(playerId);
    if (!player?.isHost) return;
    room.updateSettings(payload);
    broadcastRoomUpdate(room);
  });

  socket.on('start_game', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const player = room.state.players.get(playerId);
    if (!player?.isHost) return;
    const check = room.canStart();
    if (!check.ok) {
      socket.emit('error_message', { message: check.error });
      return;
    }
    room.startGame();
    for (const pid of room.state.playerOrder) {
      const p = room.state.players.get(pid);
      const info = room.getPrivateInfo(pid);
      if (p?.socketId && info) {
        io.to(p.socketId).emit('game_started', info);
      }
    }
    sendSabotageStatus(room);
    scheduleGameClock(room);
    broadcastRoomUpdate(room);
  });

  socket.on('complete_task', ({ taskId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    if (room.completeTask(playerId, taskId)) {
      socket.emit('task_ack', { taskId });
      broadcastRoomUpdate(room);
      const winner = room.checkWinConditions();
      if (winner) {
        clearGameClockTimer(room.state.code);
        io.to(room.state.code).emit('game_over', winner);
        broadcastRoomUpdate(room);
      }
    }
  });

  socket.on('kill_player', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.killPlayer(playerId, targetId);
    if (!res.ok) {
      socket.emit('kill_result', { ok: false, message: res.error });
      if (res.reason === 'shield') notifyGuardianShieldUsed(room);
      return;
    }
    socket.emit('kill_result', { ok: true });
    const target = room.state.players.get(targetId);
    if (target?.socketId) io.to(target.socketId).emit('you_died');
    broadcastRoomUpdate(room);
    if (res.winner) {
      clearGameClockTimer(room.state.code);
      io.to(room.state.code).emit('game_over', res.winner);
    }
  });

  socket.on('report_mic_status', ({ available }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    ctx.room.setMicAvailable(ctx.playerId, available);
  });

  socket.on('attempt_kill', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.startKillAttempt(playerId, targetId);
    if (!res.ok) {
      socket.emit('kill_attempt_result', { ok: false, reason: res.error });
      if (res.reason === 'shield') notifyGuardianShieldUsed(room);
      return;
    }

    if (res.instant) {
      socket.emit('kill_attempt_result', { ok: true, instant: true });
      const target = room.state.players.get(targetId);
      if (target?.socketId) io.to(target.socketId).emit('you_died');
      broadcastRoomUpdate(room);
      if (res.winner) {
        clearGameClockTimer(room.state.code);
        io.to(room.state.code).emit('game_over', res.winner);
      }
      return;
    }

    socket.emit('kill_listen_start', { frequencyHz: res.frequencyHz, windowMs: res.windowMs });
    const target = room.state.players.get(targetId);
    if (target?.socketId) {
      io.to(target.socketId).emit('begin_proximity_scan', {
        windowMs: res.windowMs,
        candidateFrequencies: PROXIMITY_FREQUENCIES_HZ,
      });
    }

    clearKillAttemptTimer(room.state.code);
    const timer = setTimeout(() => {
      if (room.clearKillAttempt(playerId)) {
        socket.emit('kill_attempt_result', {
          ok: false,
          reason: "Couldn't verify — get closer and try again.",
        });
      }
    }, res.windowMs + 500);
    killAttemptTimers.set(room.state.code, timer);
  });

  socket.on('cancel_kill_attempt', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    if (room.clearKillAttempt(playerId)) {
      clearKillAttemptTimer(room.state.code);
    }
  });

  socket.on('tone_detected', ({ frequencyHz }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.confirmKillAttempt(playerId, frequencyHz);
    if (!res.ok) return;
    clearKillAttemptTimer(room.state.code);
    const killer = room.state.players.get(res.killerId);
    if (killer?.socketId) io.to(killer.socketId).emit('kill_attempt_result', { ok: true });
    socket.emit('you_died');
    broadcastRoomUpdate(room);
    if (res.winner) {
      clearGameClockTimer(room.state.code);
      io.to(room.state.code).emit('game_over', res.winner);
    }
  });

  socket.on('trigger_vent', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    if (room.triggerVent(playerId)) {
      io.to(room.state.code).emit('vent_triggered', { durationMs: VENT_DURATION_MS });
      broadcastRoomUpdate(room);
    }
  });

  socket.on('trigger_sabotage', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.triggerSabotage(playerId);
    if (!res.ok) {
      socket.emit('error_message', { message: res.error });
      return;
    }
    scheduleGameClock(room);
    io.to(room.state.code).emit('sabotage_triggered');
    broadcastRoomUpdate(room);
    sendSabotageStatus(room);
  });

  socket.on('call_meeting', ({ reason }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.callMeeting(playerId, reason);
    if (!res.ok) {
      socket.emit('error_message', { message: res.error });
      return;
    }
    io.to(room.state.code).emit('meeting_called', res.meeting);
    broadcastRoomUpdate(room);
    scheduleMeetingTimers(room);
  });

  socket.on('cast_vote', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    if (room.castVote(playerId, targetId)) {
      broadcastRoomUpdate(room);
      if (room.allAliveHaveVoted()) {
        endMeetingAndBroadcast(room);
      }
    }
  });

  socket.on('judge_overrule', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.judgeOverrule(playerId, targetId);
    if (!res.ok) {
      socket.emit('error_message', { message: res.error });
      return;
    }
    finishMeeting(room, res.result, res.winner);
  });

  socket.on('guardian_protect', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.guardianProtect(playerId, targetId);
    if (!res.ok) {
      socket.emit('error_message', { message: res.error });
      return;
    }
  });

  socket.on('kick_player', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.kickPlayer(playerId, targetId);
    if (!res.ok) {
      socket.emit('error_message', { message: res.error });
      return;
    }
    if (res.socketId) {
      const targetSocket = io.sockets.sockets.get(res.socketId);
      if (targetSocket) {
        targetSocket.emit('kicked');
        socketMeta.delete(targetSocket.id);
        targetSocket.leave(room.state.code);
      }
    }
    broadcastRoomUpdate(room);
  });

  socket.on('transfer_host', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.transferHost(playerId, targetId);
    if (!res.ok) {
      socket.emit('error_message', { message: res.error });
      return;
    }
    broadcastRoomUpdate(room);
  });

  socket.on('sheriff_shoot', ({ targetId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.sheriffShoot(playerId, targetId);
    if (!res.ok) {
      socket.emit('ability_result', { ok: false, message: res.error });
      return;
    }
    if (res.misfired) {
      socket.emit('ability_result', {
        ok: false,
        message: 'You shot an innocent crewmate — you were eliminated.',
      });
      socket.emit('you_died');
    } else {
      socket.emit('ability_result', { ok: true, message: 'You shot the impostor!' });
      const target = room.state.players.get(res.eliminatedId);
      if (target?.socketId) io.to(target.socketId).emit('you_died');
    }
    broadcastRoomUpdate(room);
    if (res.winner) {
      clearGameClockTimer(room.state.code);
      io.to(room.state.code).emit('game_over', res.winner);
    }
  });

  socket.on('engineer_vent', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const res = room.engineerFakeVent(playerId);
    if (!res.ok) {
      socket.emit('ability_result', { ok: false, message: res.error });
      return;
    }
    socket.emit('ability_result', { ok: true, message: 'Fake vent triggered.' });
    io.to(room.state.code).emit('vent_triggered', { durationMs: VENT_DURATION_MS });
    broadcastRoomUpdate(room);
  });

  socket.on('play_again', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const player = room.state.players.get(playerId);
    if (!player?.isHost) return;
    clearMeetingTimers(room.state.code);
    clearKillAttemptTimer(room.state.code);
    clearGameClockTimer(room.state.code);
    room.resetToLobby();
    broadcastRoomUpdate(room);
  });

  socket.on('disconnect', () => {
    const meta = socketMeta.get(socket.id);
    socketMeta.delete(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.code);
    if (!room) return;
    const player = room.state.players.get(meta.playerId);
    if (player && player.socketId === socket.id) {
      room.removePlayer(meta.playerId);
      broadcastRoomUpdate(room);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.state.lastActivity > ROOM_IDLE_CLEANUP_MS) {
      clearMeetingTimers(code);
      clearKillAttemptTimer(code);
      clearGameClockTimer(code);
      rooms.delete(code);
    }
  }
}, 15 * 60 * 1000).unref();

httpServer.listen(PORT, () => {
  console.log(`IRL Impostor server listening on :${PORT}`);
});
