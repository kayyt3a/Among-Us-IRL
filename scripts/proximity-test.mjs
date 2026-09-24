import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const names = ['Host', 'Alice', 'Bob', 'Cara', 'Dan', 'Eve'];
const sockets = names.map(() => io(URL, { transports: ['websocket'] }));
const playerIds = [];
let latestRoom = null;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function waitFor(socket, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}

async function main() {
  await Promise.all(sockets.map((s) => waitFor(s, 'connect')));
  sockets[0].on('room_update', (r) => (latestRoom = r));

  const createRes = await new Promise((resolve) => sockets[0].emit('create_room', { name: names[0] }, resolve));
  playerIds[0] = createRes.playerId;
  const code = createRes.code;
  for (let i = 1; i < sockets.length; i++) {
    const res = await new Promise((resolve) => sockets[i].emit('join_room', { code, name: names[i] }, resolve));
    playerIds[i] = res.playerId;
  }
  // Two impostors so Test 2 and Test 3 can each use a killer with a fresh,
  // unused kill cooldown rather than waiting out the real 45s cooldown.
  sockets[0].emit('update_settings', { meetingSpot: 'Living room couch', impostorCount: 2 });
  await wait(200);

  const roles = {};
  const readyPromises = sockets.map(
    (s, i) => new Promise((resolve) => s.once('game_started', (info) => { roles[i] = info.role; resolve(); }))
  );
  sockets[0].emit('start_game');
  await Promise.all(readyPromises);
  console.log('roles:', names.map((n, i) => `${n}=${roles[i]}`).join(', '));

  const impostorIdxs = Object.entries(roles).filter(([, r]) => r === 'impostor').map(([idx]) => idx);
  const crewIdxs = Object.entries(roles).filter(([, r]) => r === 'crewmate').map(([idx]) => idx);
  const [impA, impB] = impostorIdxs;
  const [targetA, targetB, targetC] = crewIdxs;
  if (impostorIdxs.length !== 2) throw new Error('expected exactly 2 impostors, got ' + impostorIdxs.length);

  // Explicitly confirm mic availability for all (default is already true, but be explicit)
  sockets.forEach((s) => s.emit('report_mic_status', { available: true }));
  await wait(100);

  // --- Test 1: happy path, target hears the correct tone ---
  console.log('\n--- Test 1: correct tone confirms the kill ---');
  const listenStartP = waitFor(sockets[impA], 'kill_listen_start');
  sockets[impA].emit('attempt_kill', { targetId: playerIds[targetA] });
  const listenStart = await listenStartP;
  console.log('killer told to play frequency', listenStart.frequencyHz, 'for', listenStart.windowMs, 'ms');

  const resultP = waitFor(sockets[impA], 'kill_attempt_result');
  const diedP = waitFor(sockets[targetA], 'you_died');
  // simulate the target's client "hearing" the exact tone the server assigned
  sockets[targetA].emit('tone_detected', { frequencyHz: listenStart.frequencyHz });
  const result1 = await resultP;
  await diedP;
  console.log('kill_attempt_result:', result1, '| target died: pass');
  if (!result1.ok) throw new Error('Test 1 failed: expected ok:true');

  // --- Test 2: wrong tone is ignored, then times out --- (uses impB: impA is on cooldown)
  console.log('\n--- Test 2: wrong tone is ignored; attempt times out ---');
  const listenStartP2 = waitFor(sockets[impB], 'kill_listen_start');
  sockets[impB].emit('attempt_kill', { targetId: playerIds[targetB] });
  const listenStart2 = await listenStartP2;
  const wrongFreq = listenStart2.frequencyHz === 17600 ? 18600 : 17600;
  sockets[targetB].emit('tone_detected', { frequencyHz: wrongFreq });
  await wait(300);
  console.log('sent mismatched frequency', wrongFreq, '(expected', listenStart2.frequencyHz, '), waiting for timeout...');
  const timeoutResultP = waitFor(sockets[impB], 'kill_attempt_result', listenStart2.windowMs + 3000);
  const timeoutResult = await timeoutResultP;
  console.log('kill_attempt_result:', timeoutResult);
  if (timeoutResult.ok) throw new Error('Test 2 failed: expected ok:false after mismatched/no report');

  // --- Test 3: target has no mic -> instant fallback --- (still impB: Test 2 never actually killed, so no cooldown yet)
  console.log('\n--- Test 3: target with no mic falls back to instant kill ---');
  sockets[targetC].emit('report_mic_status', { available: false });
  await wait(100);
  const instantResultP = waitFor(sockets[impB], 'kill_attempt_result');
  const instantDiedP = waitFor(sockets[targetC], 'you_died');
  sockets[impB].emit('attempt_kill', { targetId: playerIds[targetC] });
  const instantResult = await instantResultP;
  await instantDiedP;
  console.log('kill_attempt_result:', instantResult, '| target died: pass');
  if (!instantResult.ok || !instantResult.instant) throw new Error('Test 3 failed: expected instant ok:true');

  console.log('\nALL PROXIMITY TESTS PASSED');
  sockets.forEach((s) => s.disconnect());
  process.exit(0);
}

main().catch((e) => {
  console.error('PROXIMITY TEST FAILED:', e);
  process.exit(1);
});
