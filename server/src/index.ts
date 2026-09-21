import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@irl-impostor/shared';
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

function clearMeetingTimers(code: string) {
  const timers = meetingTimers.get(code);
  if (timers) {
    timers.forEach(clearTimeout);
    meetingTimers.delete(code);
  }
}

function broadcastRoomUpdate(room: GameRoom) {
  io.to(room.state.code).emit('room_update', room.publicState());
}

function endMeetingAndBroadcast(room: GameRoom) {
  clearMeetingTimers(room.state.code);
  const { result, winner } = room.resolveMeeting();
  io.to(room.state.code).emit('meeting_result', result);
  room.closeMeeting();
  broadcastRoomUpdate(room);
  if (winner) {
    io.to(room.state.code).emit('game_over', winner);
  }
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
    if (room.state.phase !== 'lobby') {
      return cb({ ok: false, error: 'Game already in progress.' });
    }
    if (room.state.playerOrder.length >= MAX_PLAYERS) {
      return cb({ ok: false, error: 'Room is full.' });
    }
    if (!name || !name.trim()) return cb({ ok: false, error: 'Name is required.' });

    const player = room.addPlayer(name, false);
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
    room.updateSettings(payload.tasksPerPlayer, payload.impostorCount);
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
    broadcastRoomUpdate(room);
  });

  socket.on('complete_task', ({ taskId }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    if (room.completeTask(playerId, taskId)) {
      socket.emit('task_ack', { taskId });
      const winner = room.checkWinConditions();
      if (winner) {
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
      return;
    }
    socket.emit('kill_result', { ok: true });
    const target = room.state.players.get(targetId);
    if (target?.socketId) io.to(target.socketId).emit('you_died');
    broadcastRoomUpdate(room);
    if (res.winner) {
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

  socket.on('call_meeting', ({ reason }) => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const meeting = room.callMeeting(playerId, reason);
    if (!meeting) return;
    io.to(room.state.code).emit('meeting_called', meeting);
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

  socket.on('play_again', () => {
    const ctx = findRoomOrEmitError(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    const player = room.state.players.get(playerId);
    if (!player?.isHost) return;
    clearMeetingTimers(room.state.code);
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
      rooms.delete(code);
    }
  }
}, 15 * 60 * 1000).unref();

httpServer.listen(PORT, () => {
  console.log(`IRL Impostor server listening on :${PORT}`);
});
