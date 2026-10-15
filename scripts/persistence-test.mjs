// Restarts the server in the middle of a game and checks everyone lands back
// in the same game: same roles, same tasks, same clock, a meeting still
// running, and the round still finishes normally afterwards.
//
// Starts its own server (on PORT, default 4100) from the build, so run
// `npm run build` first, and needs Redis (REDIS_URL, default
// redis://127.0.0.1:6379).
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { createClient } from 'redis';

const PORT = Number(process.env.PORT ?? 4100);
const URL = `http://localhost:${PORT}`;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  pass:', msg);
  else {
    failures++;
    console.log('  FAIL:', msg);
  }
}

let server = null;
async function startServer() {
  server = spawn('node', ['server/dist/index.js'], {
    env: { ...process.env, PORT: String(PORT), REDIS_URL, NODE_ENV: 'test', STATS_KEY: 'test-stats-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stdout.write(`[server!] ${d}`));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('server did not start');
}
async function stopServer() {
  const exited = new Promise((r) => server.once('exit', r));
  server.kill('SIGTERM'); // what Render sends on a deploy
  await exited;
}

/** A phone: keeps its session like the real client does and rejoins after a reconnect. */
function phone(name) {
  const p = { name, socket: io(URL, { transports: ['websocket'], reconnectionDelay: 200, reconnectionDelayMax: 500 }) };
  p.socket.on('room_update', (r) => (p.room = r));
  p.socket.on('game_started', (info) => (p.info = info));
  p.socket.on('game_over', (g) => (p.gameOver = g));
  p.socket.on('meeting_result', (r) => (p.result = r));
  p.socket.on('connect', () => {
    if (p.session) p.socket.emit('rejoin_room', p.session, (res) => (p.rejoined = res.ok));
  });
  return p;
}
const ask = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));

async function main() {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  await startServer();
  const statsToday = async () => (await (await fetch(`${URL}/stats?key=test-stats-key&format=json`)).json())[0];
  const statsBefore = await statsToday();
  // One visit from Instagram's in-app browser, one plain one, and a link preview bot that shouldn't count.
  await fetch(`${URL}/`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Instagram 300.0' } });
  await fetch(`${URL}/?code=ABCD`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari' } });
  await fetch(`${URL}/`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } });

  console.log('=== Set up a game and get to a meeting ===');
  const phones = ['Maya', 'Liam', 'Priya', 'Noah'].map(phone);
  await Promise.all(phones.map((p) => new Promise((r) => p.socket.once('connect', r))));
  const created = await ask(phones[0].socket, 'create_room', { name: 'Maya' });
  phones[0].session = { code: created.code, playerId: created.playerId };
  for (const p of phones.slice(1)) {
    const res = await ask(p.socket, 'join_room', { code: created.code, name: p.name });
    p.session = { code: res.code, playerId: res.playerId };
  }
  phones[0].socket.emit('update_settings', { meetingSpot: 'Couch', tasksPerPlayer: 3, discussionSeconds: 15, votingSeconds: 15 });
  await wait(150);
  phones[0].socket.emit('start_game');
  await wait(400);
  check(phones.every((p) => p.info), 'everyone was dealt a role');

  const crew = phones.filter((p) => p.info.role === 'crewmate');
  const impostor = phones.find((p) => p.info.role === 'impostor');
  // Some progress to carry across the restart.
  crew[0].socket.emit('complete_task', { taskId: crew[0].info.tasks[0].taskId });
  await wait(150);
  crew[1].socket.emit('call_meeting', { reason: 'emergency' });
  await wait(300);
  const before = {
    phase: phones[0].room.phase,
    gameEndsAt: phones[0].room.gameEndsAt,
    progress: phones[0].room.crewTaskProgress.done,
    votingEndsAt: phones[0].room.meeting.votingEndsAt,
    roles: phones.map((p) => p.info.role).join(','),
    tasks: crew[0].info.tasks.map((t) => t.taskId).join(','),
  };
  check(before.phase === 'meeting', 'a meeting is running before the restart');

  console.log('\n=== Restart the server (SIGTERM, like a deploy) ===');
  await stopServer();
  check((await redis.exists(`irl:room:${created.code}`)) === 1, 'room was saved to Redis on shutdown');
  phones.forEach((p) => {
    p.info = null;
    p.rejoined = false;
  });
  await startServer();
  for (let i = 0; i < 40 && !phones.every((p) => p.rejoined); i++) await wait(250);
  check(phones.every((p) => p.rejoined), 'every phone rejoined the same room on its own');
  await wait(300);

  console.log('\n=== Same game afterwards ===');
  check(phones.every((p) => p.info), 'everyone got their role back');
  check(phones.map((p) => p.info?.role).join(',') === before.roles, 'roles unchanged');
  check(crew[0].info?.tasks.map((t) => t.taskId).join(',') === before.tasks, 'task list unchanged');
  check(crew[0].info?.tasks[0].done === true, 'finished task is still finished');
  check(phones[0].room.phase === 'meeting', 'still in the meeting');
  check(phones[0].room.gameEndsAt === before.gameEndsAt, 'game clock deadline unchanged');
  check(phones[0].room.meeting?.votingEndsAt === before.votingEndsAt, 'meeting deadlines unchanged');
  check(phones[0].room.crewTaskProgress.done === before.progress, 'crew progress unchanged');

  console.log('\n=== The round still plays out normally ===');
  const remaining = Math.max(0, phones[0].room.meeting.discussionEndsAt - Date.now());
  await wait(remaining + 400);
  check(phones[0].room.meeting?.phase === 'voting', 'discussion timer resumed and moved on to voting');
  for (const p of phones) p.socket.emit('cast_vote', { targetId: impostor.session.playerId });
  for (let i = 0; i < 20 && !phones[0].gameOver; i++) await wait(250);
  check(phones[0].result?.votes?.length === 4, 'result lists all four votes by name');
  check(phones[0].gameOver?.winner === 'crewmates', 'voting out the impostor still wins the game');

  console.log('\n=== Stats survive the restart and add up ===');
  const after = await statsToday();
  const delta = (m) => after.counts[m] - statsBefore.counts[m];
  check(delta('visits') === 2, `2 page views counted, the bot skipped (got ${delta('visits')})`);
  check(delta('instagram') === 1, 'the Instagram visit is attributed to Instagram');
  check(delta('invites') === 1, 'the invite link visit is counted');
  check(delta('rooms') === 1 && delta('joins') === 3, 'room created and 3 joins counted');
  check(delta('games') === 1 && delta('gamePlayers') === 4, 'game started with 4 players counted');
  check(delta('finished') === 1, 'finished game counted');
  check(after.visitors >= 1, 'unique visitors counted');
  const noKey = await fetch(`${URL}/stats`);
  const wrongKey = await fetch(`${URL}/stats?key=nope`);
  check(noKey.status === 404 && wrongKey.status === 404, 'stats page is hidden without the right key');

  phones.forEach((p) => p.socket.close());
  await stopServer();
  await redis.del(`irl:room:${created.code}`);
  await redis.quit();
  console.log(failures ? `\n${failures} PERSISTENCE TEST(S) FAILED` : '\nALL PERSISTENCE TESTS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  server?.kill('SIGKILL');
  process.exit(1);
});
