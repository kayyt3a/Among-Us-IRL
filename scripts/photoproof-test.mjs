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

  console.log('=== Lobby: enable photo proof ===');
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

  const commonTaskId0 = gameStarted[0].tasks.find((t) => t.common).taskId;
  const individualTaskId0 = gameStarted[0].tasks.find((t) => !t.common).taskId;

  console.log('--- Plain complete_task on the common task is rejected while photo proof is on ---');
  sockets[0].emit('complete_task', { taskId: commonTaskId0 });
  let gotAck = false;
  sockets[0].once('task_ack', () => { gotAck = true; });
  await wait(300);
  assert(gotAck === false, 'no task_ack for a plain complete_task on the photo-proof common task');

  console.log('--- Photo for a non-common task is rejected ---');
  const wrongTaskResult = await new Promise((resolve) =>
    sockets[0].emit('submit_task_photo', { taskId: individualTaskId0, photoDataUrl: FAKE_PHOTO }, resolve)
  );
  assert(wrongTaskResult.ok === false, 'photo rejected for a non-common task: ' + wrongTaskResult.error);

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
  assert(submitResult.ok === true, 'photo submission accepted');
  const ack = await ackPromise;
  assert(ack.taskId === commonTaskId0, 'task_ack received for the common task');

  console.log('--- A second player also submits a photo ---');
  const commonTaskId1 = gameStarted[1].tasks.find((t) => t.common).taskId;
  const submitResult2 = await new Promise((resolve) =>
    sockets[1].emit('submit_task_photo', { taskId: commonTaskId1, photoDataUrl: FAKE_PHOTO }, resolve)
  );
  assert(submitResult2.ok === true, 'second player photo submission accepted');

  console.log('--- get_task_photos returns both submitted photos ---');
  const photosRes = await new Promise((resolve) => sockets[2].emit('get_task_photos', resolve));
  assert(photosRes.photos.length === 2, `exactly 2 photos recorded (got ${photosRes.photos.length})`);
  const byName = new Set(photosRes.photos.map((p) => p.playerName));
  assert(byName.has('Host') && byName.has('Alice'), 'photos are attributed to the right players');
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
