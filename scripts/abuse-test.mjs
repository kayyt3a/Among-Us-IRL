// Tries to break or abuse the server the way a bored stranger with the URL
// might, and checks it shrugs it off: malformed messages, guessing room
// codes, spamming rooms, flooding events, bad photo uploads, oversized
// messages and too many connections. Needs the server running (npm run dev:server).
//
// Each scenario pretends to come from its own network via X-Forwarded-For,
// so per-network limits apply (local loopback is exempt outside production).
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:4000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  pass:', msg);
  else {
    failures++;
    console.log('  FAIL:', msg);
  }
}

let ipCounter = 10;
const freshIp = () => `203.0.113.${ipCounter++}`;
const sockets = [];
function connect(ip = freshIp(), opts = {}) {
  const s = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { 'x-forwarded-for': ip },
    ...opts,
  });
  sockets.push(s);
  return s;
}
function connected(s, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (s.connected) return resolve(true);
    const t = setTimeout(() => resolve(false), timeoutMs);
    s.once('connect', () => (clearTimeout(t), resolve(true)));
    s.once('connect_error', () => (clearTimeout(t), resolve(false)));
  });
}
function ask(s, event, payload, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    s.emit(event, payload, (res) => (clearTimeout(t), resolve(res)));
  });
}
async function serverAlive() {
  const s = connect();
  if (!(await connected(s))) return false;
  const res = await ask(s, 'create_room', { name: 'Probe' });
  s.close();
  return !!res?.ok;
}

async function main() {
  console.log('=== Malformed messages never crash the server ===');
  const junk = [undefined, null, 'x', 42, true, [], [1, 2], { code: 5 }, { name: { $gt: '' } }, { targetId: {} }];
  const events = [
    'create_room', 'join_room', 'rejoin_room', 'update_settings', 'start_game', 'complete_task',
    'kill_player', 'report_mic_status', 'attempt_kill', 'cancel_kill_attempt', 'tone_detected',
    'trigger_vent', 'trigger_sabotage', 'submit_unscramble', 'submit_task_photo', 'get_task_photos',
    'call_meeting', 'cast_vote', 'judge_overrule', 'guardian_protect', 'kick_player', 'transfer_host',
    'sheriff_shoot', 'engineer_vent', 'play_again',
  ];
  // One attacker in a real room (as host, so every handler gets past the
  // "are you in a room" check), sending every event with every kind of junk.
  const attacker = connect();
  await connected(attacker);
  const room = await ask(attacker, 'create_room', { name: 'Mallory' });
  check(room?.ok, 'attacker created a room to attack from');
  for (const event of events) {
    for (const payload of junk) {
      if (payload === undefined) attacker.emit(event);
      else attacker.emit(event, payload);
      attacker.emit(event, payload, 'not-a-callback');
    }
    await wait(1400); // stay under the flood limit so every message is actually processed
  }
  await wait(300);
  check(await serverAlive(), `server still up after ${events.length * junk.length * 2} malformed messages`);

  console.log('\n=== Bad settings are ignored, not applied ===');
  const host = connect();
  await connected(host);
  let latest = null;
  host.on('room_update', (r) => (latest = r));
  await ask(host, 'create_room', { name: 'Host' });
  await wait(150);
  const before = JSON.stringify(latest.settings);
  host.emit('update_settings', {
    meetingSpot: 5,
    tasksPerPlayer: 'lots',
    impostorCount: Infinity,
    customTasks: 'not a list',
    judgeEnabled: 'yes',
    photoProofEnabled: 1,
  });
  await wait(200);
  check(JSON.stringify(latest.settings) === before, 'wrongly-typed settings left the room unchanged');
  host.emit('update_settings', { customTasks: [123, null, 'Do a cartwheel', { a: 1 }] });
  await wait(200);
  check(
    JSON.stringify(latest.settings.customTasks) === JSON.stringify(['Do a cartwheel']),
    'only real text survives in custom tasks'
  );

  console.log('\n=== Room codes cannot be brute-forced ===');
  const guesser = connect();
  await connected(guesser);
  const answers = [];
  for (let i = 0; i < 25; i++) {
    answers.push((await ask(guesser, 'join_room', { code: `ZZ${String(i).padStart(2, '0')}`, name: 'Guess' }))?.error);
  }
  check(answers.slice(0, 20).every((e) => e === 'Room not found.'), 'first 20 wrong codes get a normal "not found"');
  check(answers.slice(20).every((e) => /Too many wrong codes/.test(e ?? '')), 'after 20 wrong codes in a minute, joining is paused');
  const blockedReal = await ask(guesser, 'join_room', { code: room.code, name: 'Guess' });
  check(blockedReal?.ok === false, 'even a correct code is refused while paused');
  const neighbour = connect();
  await connected(neighbour);
  const neighbourJoin = await ask(neighbour, 'join_room', { code: room.code, name: 'Neighbour' });
  check(neighbourJoin?.ok === true, 'a different network can still join normally');

  console.log('\n=== Rejoin cannot be used to probe codes ===');
  const prober = connect();
  await connected(prober);
  const noRoom = await ask(prober, 'rejoin_room', { code: 'QQQQ', playerId: 'nobody' });
  const realRoomFakePlayer = await ask(prober, 'rejoin_room', { code: room.code, playerId: 'nobody' });
  check(noRoom?.error === realRoomFakePlayer?.error, 'same answer for a missing room and a missing player');

  console.log('\n=== Room creation is rate limited per network ===');
  const spammerIp = freshIp();
  const spammer = connect(spammerIp);
  await connected(spammer);
  const creates = [];
  for (let i = 0; i < 12; i++) creates.push(await ask(spammer, 'create_room', { name: `Spam${i}` }));
  check(creates.slice(0, 10).every((r) => r?.ok), 'first 10 rooms in a minute are allowed');
  check(creates.slice(10).every((r) => r?.ok === false && /Too many rooms/.test(r.error)), 'the 11th and 12th are refused');

  console.log('\n=== Event floods are dropped, not processed ===');
  const flooder = connect();
  await connected(flooder);
  let acks = 0;
  for (let i = 0; i < 200; i++) flooder.emit('get_task_photos', () => acks++);
  await wait(800);
  check(acks > 0 && acks <= 45, `a burst of 200 events from one phone was cut to ${acks}`);
  await wait(1500);
  const afterFlood = await ask(flooder, 'get_task_photos');
  check(Array.isArray(afterFlood?.photos), 'the same phone works normally again a moment later');

  console.log('\n=== Photo uploads must be real inline images ===');
  const ph = [connect(), connect(), connect()];
  await Promise.all(ph.map((s) => connected(s)));
  let started = null;
  ph[0].once('game_started', (info) => (started = info));
  const phRoom = await ask(ph[0], 'create_room', { name: 'P1' });
  await ask(ph[1], 'join_room', { code: phRoom.code, name: 'P2' });
  await ask(ph[2], 'join_room', { code: phRoom.code, name: 'P3' });
  ph[0].emit('update_settings', { meetingSpot: 'Couch', photoProofEnabled: true });
  await wait(150);
  ph[0].emit('start_game');
  await wait(400);
  const taskId = started?.tasks?.[0]?.taskId;
  check(!!taskId, 'photo-proof game started');
  for (const bad of [
    'https://tracker.example/pixel.png',
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/jpeg;base64,not base64!!',
    12345,
  ]) {
    const res = await ask(ph[0], 'submit_task_photo', { taskId, photoDataUrl: bad });
    check(res?.ok === false, `rejected photo: ${String(bad).slice(0, 34)}`);
  }
  const good = await ask(ph[0], 'submit_task_photo', { taskId, photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(400) });
  check(good?.ok === true, 'a real inline JPEG is still accepted');

  console.log('\n=== Oversized messages are cut off at the door ===');
  const big = connect();
  await connected(big);
  const dropped = new Promise((r) => big.once('disconnect', (reason) => r(reason)));
  big.emit('create_room', { name: 'x'.repeat(2_000_000) }, () => {});
  const reason = await Promise.race([dropped, wait(3000).then(() => 'still connected')]);
  check(reason !== 'still connected', `a 2 MB message closes that connection (${reason})`);
  check(await serverAlive(), 'server still up afterwards');

  console.log('\n=== One network cannot hog every connection ===');
  const crowdIp = freshIp();
  const crowd = Array.from({ length: 125 }, () => connect(crowdIp));
  const results = await Promise.all(crowd.map((s) => connected(s)));
  const ok = results.filter(Boolean).length;
  check(ok === 120, `120 connections from one network allowed, the rest refused (got ${ok})`);
  crowd.forEach((s) => s.close());

  console.log('\n=== HTTP security headers ===');
  const res = await fetch(URL);
  check(res.headers.get('x-content-type-options') === 'nosniff', 'nosniff set');
  check(res.headers.get('x-frame-options') === 'DENY', 'cannot be framed by other sites');
  check(!res.headers.get('x-powered-by'), 'framework banner removed');
  check(/microphone=\(self\)/.test(res.headers.get('permissions-policy') ?? ''), 'mic allowed for the game itself');

  sockets.forEach((s) => s.close());
  console.log(failures ? `\n${failures} ABUSE TEST(S) FAILED` : '\nALL ABUSE TESTS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
