import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const names = ['Host', 'Alice', 'Bob', 'Cara'];
const sockets = names.map(() => io(URL, { transports: ['websocket'] }));
const state = { code: null, playerIds: [], roles: {}, tasks: {} };

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function main() {
  await Promise.all(sockets.map((s) => waitFor(s, 'connect')));
  console.log('all connected');

  let latestRoom = null;
  sockets[0].on('room_update', (r) => (latestRoom = r));

  const createRes = await new Promise((resolve) =>
    sockets[0].emit('create_room', { name: names[0] }, resolve)
  );
  if (!createRes.ok) throw new Error('create failed: ' + createRes.error);
  state.code = createRes.code;
  state.playerIds[0] = createRes.playerId;
  console.log('room created', state.code);

  for (let i = 1; i < sockets.length; i++) {
    const res = await new Promise((resolve) =>
      sockets[i].emit('join_room', { code: state.code, name: names[i] }, resolve)
    );
    if (!res.ok) throw new Error('join failed: ' + res.error);
    state.playerIds[i] = res.playerId;
  }
  console.log('all joined', state.playerIds);

  await wait(300);
  console.log('lobby players:', latestRoom.players.map((p) => p.name));

  sockets.forEach((s, i) => {
    s.on('game_started', (info) => {
      state.roles[i] = info.role;
      state.tasks[i] = info.tasks;
    });
  });

  sockets[0].emit('update_settings', { meetingSpot: 'Living room couch' });
  await wait(200);
  sockets[0].emit('start_game');
  await wait(300);
  console.log('roles:', names.map((n, i) => `${n}=${state.roles[i]}`).join(', '));

  const impostorIdx = Object.entries(state.roles).find(([, r]) => r === 'impostor')?.[0];
  if (impostorIdx === undefined) throw new Error('no impostor assigned');
  console.log('impostor is', names[impostorIdx], 'tasks:', state.tasks[impostorIdx].length);

  // impostor completes nothing (fake tasks); a crewmate completes a task
  const crewIdx = Object.entries(state.roles).find(([, r]) => r === 'crewmate')[0];
  sockets[crewIdx].emit('complete_task', { taskId: state.tasks[crewIdx][0].taskId });
  const ack = await waitFor(sockets[crewIdx], 'task_ack');
  console.log('task ack ok:', ack.taskId === state.tasks[crewIdx][0].taskId);

  // impostor kills another crewmate
  const victimIdx = Object.entries(state.roles).find(
    ([idx, r]) => r === 'crewmate' && idx !== crewIdx
  )[0];
  const victimDied = waitFor(sockets[victimIdx], 'you_died');
  sockets[impostorIdx].emit('kill_player', { targetId: state.playerIds[victimIdx] });
  const killRes = await waitFor(sockets[impostorIdx], 'kill_result');
  console.log('kill ok:', killRes.ok);
  await victimDied;
  console.log('victim received you_died: pass');

  // vent should be available now
  await wait(100);
  console.log('vent available on public state:', latestRoom.ventAvailable);
  const ventPromises = sockets.map((s) => waitFor(s, 'vent_triggered'));
  sockets[impostorIdx].emit('trigger_vent');
  await Promise.all(ventPromises);
  console.log('all sockets received vent_triggered: pass');

  // remaining crewmate calls a meeting
  const remainingCrewIdx = Object.entries(state.roles).find(
    ([idx, r]) => r === 'crewmate' && idx !== crewIdx && idx !== victimIdx
  );
  const callerIdx = remainingCrewIdx ? remainingCrewIdx[0] : crewIdx;
  const meetingCalledPromises = sockets.map((s) => waitFor(s, 'meeting_called'));
  sockets[callerIdx].emit('call_meeting', { reason: 'emergency' });
  await Promise.all(meetingCalledPromises);
  console.log('meeting called on all sockets: pass');
  await wait(200);
  console.log('meeting phase:', latestRoom.meeting?.phase, 'alive per roster:', latestRoom.players.map(p=>p.status));

  // wait for discussion -> voting transition
  while (latestRoom.meeting?.phase !== 'voting') {
    await wait(500);
  }
  console.log('voting phase reached');

  // all alive players vote for the impostor
  const resultPromise = waitFor(sockets[0], 'meeting_result');
  const gameOverPromise = waitFor(sockets[0], 'game_over');
  for (const [idx, role] of Object.entries(state.roles)) {
    if (idx === victimIdx) continue; // ghost can't vote
    sockets[idx].emit('cast_vote', { targetId: state.playerIds[impostorIdx] });
  }
  const result = await resultPromise;
  console.log('meeting result:', result);
  const gameOver = await gameOverPromise;
  console.log('game over:', gameOver.winner, gameOver.players);

  console.log('\nSMOKE TEST PASSED');
  sockets.forEach((s) => s.disconnect());
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exit(1);
});
