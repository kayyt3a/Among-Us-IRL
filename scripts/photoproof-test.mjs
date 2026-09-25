import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}
function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
  console.log('  pass:', msg);
}

// A tiny fixed "photo" — the server never inspects the image content, only
// stores the string and caps its length, so any data URL-shaped string works.
const FAKE_PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(200);

async function main() {
  const names = ['Host', 'Alice', 'Bob', 'Cara', 'Dan'];
  const sockets = names.map(() => io(URL, { transports: ['websocket'] }));
  await Promise.all(sockets.map((s) => waitFor(s, 'connect')));

  let latestRoom = null;
  sockets[0].on('room_update', (r) => (latestRoom = r));

  const createRes = await new Promise((resolve) => sockets[0].emit('create_room', { name: names[0] }, resolve));
  const code = createRes.code;
  const playerIds = [createRes.playerId];
  for (let i = 1; i < sockets.length; i++) {
    const res = await new Promise((resolve) => sockets[i].emit('join_room', { code, name: names[i] }, resolve));
    playerIds.push(res.playerId);
  }
  await wait(150);

  console.log('=== Lobby: enable photo proof (for every task now, not just the shared one) ===');
  sockets[0].emit('update_settings', { meetingSpot: 'Kitchen', photoProofEnabled: true, tasksPerPlayer: 3 });
  await wait(150);
  assert(latestRoom.settings.photoProofEnabled === true, 'photoProofEnabled reflected in room_update');

  const gameStarted = {};
  const startPromises = sockets.map(
    (s, i) => new Promise((resolve) => s.once('game_started', (info) => { gameStarted[i] = info; resolve(); }))
  );
  sockets[0].emit('start_game');
  await Promise.all(startPromises);
  await wait(150);

  const hostTasks = gameStarted[0].tasks;
  const commonTaskId0 = hostTasks.find((t) => t.common).taskId;
  const individualTaskIds0 = hostTasks.filter((t) => !t.common).map((t) => t.taskId);
  assert(individualTaskIds0.length === 3, `Host has 3 individual tasks (got ${individualTaskIds0.length})`);

  console.log('--- Plain complete_task on the common task is rejected while photo proof is on ---');
  sockets[0].emit('complete_task', { taskId: commonTaskId0 });
  let gotAck = false;
  sockets[0].once('task_ack', () => { gotAck = true; });
  await wait(300);
  assert(gotAck === false, 'no task_ack for a plain complete_task on the common task');

  console.log('--- Plain complete_task on an individual task is also rejected ---');
  sockets[0].emit('complete_task', { taskId: individualTaskIds0[0] });
  gotAck = false;
  sockets[0].once('task_ack', () => { gotAck = true; });
  await wait(300);
  assert(gotAck === false, 'no task_ack for a plain complete_task on an individual task either');

  console.log('--- Photo for a made-up taskId is rejected ---');
  const bogusResult = await new Promise((resolve) =>
    sockets[0].emit('submit_task_photo', { taskId: 'not-a-real-task', photoDataUrl: FAKE_PHOTO }, resolve)
  );
  assert(bogusResult.ok === false, 'photo rejected for an unknown taskId: ' + bogusResult.error);

  console.log('--- Oversized photo is rejected ---');
  const hugePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(600_000);
  const tooBigResult = await new Promise((resolve) =>
    sockets[0].emit('submit_task_photo', { taskId: commonTaskId0, photoDataUrl: hugePhoto }, resolve)
  );
  assert(tooBigResult.ok === false, 'oversized photo rejected: ' + tooBigResult.error);

  console.log('--- A real photo submission completes the common task ---');
  const ackPromise = waitFor(sockets[0], 'task_ack');
  const submitResult = await new Promise((resolve) =>
    sockets[0].emit('submit_task_photo', { taskId: commonTaskId0, photoDataUrl: FAKE_PHOTO }, resolve)
  );
  assert(submitResult.ok === true, 'photo submission accepted for the common task');
  const ack = await ackPromise;
  assert(ack.taskId === commonTaskId0, 'task_ack received for the common task');

  console.log('--- Photo submissions complete every individual task too ---');
  for (const taskId of individualTaskIds0) {
    const res = await new Promise((resolve) =>
      sockets[0].emit('submit_task_photo', { taskId, photoDataUrl: FAKE_PHOTO }, resolve)
    );
    assert(res.ok === true, `photo submission accepted for individual task ${taskId}`);
  }

  console.log('--- A second player also submits a photo for their common task ---');
  const commonTaskId1 = gameStarted[1].tasks.find((t) => t.common).taskId;
  const submitResult2 = await new Promise((resolve) =>
    sockets[1].emit('submit_task_photo', { taskId: commonTaskId1, photoDataUrl: FAKE_PHOTO }, resolve)
  );
  assert(submitResult2.ok === true, 'second player photo submission accepted');

  console.log('--- get_task_photos returns every submitted photo, with per-task detail ---');
  const photosRes = await new Promise((resolve) => sockets[2].emit('get_task_photos', resolve));
  assert(photosRes.photos.length === 5, `exactly 5 photos recorded (Host x4 + Alice x1, got ${photosRes.photos.length})`);
  const hostPhotos = photosRes.photos.filter((p) => p.playerName === 'Host');
  assert(hostPhotos.length === 4, `Host has 4 photos recorded (got ${hostPhotos.length})`);
  assert(hostPhotos.some((p) => p.common === true), 'one of Host\'s photos is flagged as the common task');
  assert(hostPhotos.filter((p) => p.common === false).length === 3, 'the other 3 are flagged as individual tasks');
  assert(hostPhotos.every((p) => typeof p.taskText === 'string' && p.taskText.length > 0), 'every photo carries its task text');
  assert(
    photosRes.photos.every((p) => p.photoDataUrl === FAKE_PHOTO),
    'photo data comes back unchanged'
  );

  console.log('--- Resetting to lobby clears the photos for the next round ---');
  sockets[0].emit('play_again');
  await wait(150);
  const photosAfterReset = await new Promise((resolve) => sockets[2].emit('get_task_photos', resolve));
  assert(photosAfterReset.photos.length === 0, 'photos cleared after play_again');

  sockets.forEach((s) => s.disconnect());
}

main()
  .then(() => {
    console.log('\nALL PHOTO PROOF TESTS PASSED');
    process.exit(0);
  })
  .catch((e) => {
    console.error('PHOTO PROOF TEST FAILED:', e);
    process.exit(1);
  });
