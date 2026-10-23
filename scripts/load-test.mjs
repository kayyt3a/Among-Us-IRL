// Load test: GAMES games of PLAYERS players each, all at once. Every game
// joins, starts, does tasks, solves a number lock with every player, holds a
// meeting where everyone votes, and the vote resolves. Reports how quickly
// the server answers. Needs the server running (npm run dev:server).
//
//   node scripts/load-test.mjs [games=4] [players=50]
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:4000';
const GAMES = Number(process.argv[2] ?? 4);
const PLAYERS = Number(process.argv[3] ?? 50);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const latencies = [];

function timedAsk(socket, event, payload) {
  const t = Date.now();
  return new Promise((resolve) =>
    socket.emit(event, payload, (res) => {
      latencies.push(Date.now() - t);
      resolve(res);
    })
  );
}

/** Different numbers from 1 to `max`, `count` of them, adding up to `target`. */
function combination(count, target, max) {
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  let left = target - nums.reduce((a, b) => a + b, 0);
  for (let i = count - 1; i >= 0 && left > 0; i--) {
    const add = Math.min(max - (count - 1 - i) - nums[i], left);
    nums[i] += add;
    left -= add;
  }
  return left === 0 ? nums : null;
}

async function game(index) {
  const phones = Array.from({ length: PLAYERS }, () => {
    const p = { socket: io(URL, { transports: ['websocket'] }) };
    p.socket.on('room_update', (r) => (p.room = r));
    p.socket.on('game_started', (info) => (p.info = info));
    p.socket.on('meeting_result', (r) => (p.result = r));
    return p;
  });
  await Promise.all(phones.map((p) => new Promise((r) => p.socket.once('connect', r))));
  const created = await timedAsk(phones[0].socket, 'create_room', { name: `Host${index}` });
  phones[0].id = created.playerId;
  for (const [i, p] of phones.slice(1).entries()) {
    const res = await timedAsk(p.socket, 'join_room', { code: created.code, name: `Player${i + 1}` });
    if (!res.ok) throw new Error(`join ${i + 1} failed: ${res.error}`);
    p.id = res.playerId;
  }
  phones[0].socket.emit('update_settings', {
    meetingSpot: 'Couch',
    impostorCount: 3,
    tasksPerPlayer: 8,
    discussionSeconds: 15,
    votingSeconds: 30,
  });
  await wait(300);
  phones[0].socket.emit('start_game');
  for (let i = 0; i < 40 && !phones.every((p) => p.info); i++) await wait(100);
  if (!phones.every((p) => p.info)) throw new Error('not everyone got a role');

  const lists = phones.map((p) => p.info.tasks.map((t) => t.taskId).join());
  const uniqueTaskLists = phones.every((p) => new Set(p.info.tasks.map((t) => t.text)).size === p.info.tasks.length);

  for (const p of phones) for (const t of p.info.tasks.slice(0, 3)) p.socket.emit('complete_task', { taskId: t.taskId });
  await wait(500);

  // Every one of the players solves a number lock together.
  const impostor = phones.find((p) => p.info.role === 'impostor');
  impostor.socket.emit('trigger_sabotage', { kind: 'numbers' });
  for (let i = 0; i < 50 && phones[0].room.sabotagePuzzle?.kind !== 'numbers'; i++) await wait(100);
  const lock = phones[0].room.sabotagePuzzle;
  if (!lock) throw new Error('number lock never showed up');
  const answer = combination(lock.needed, lock.target, lock.maxNumber);
  if (!answer) throw new Error(`lock target ${lock.target} unreachable`);
  await Promise.all(phones.map((p, i) => timedAsk(p.socket, 'submit_sabotage_number', { value: answer[i] })));
  for (let i = 0; i < 50 && phones[0].room.sabotagePuzzle; i++) await wait(100);
  const lockOpened = phones[0].room.sabotagePuzzle === null;

  phones[1].socket.emit('call_meeting', { reason: 'emergency' });
  await wait(300);
  const discussionLeft = phones[0].room.meeting.discussionEndsAt - Date.now();
  await wait(discussionLeft + 300);
  for (const p of phones) p.socket.emit('cast_vote', { targetId: impostor.id });
  for (let i = 0; i < 40 && !phones[0].result; i++) await wait(100);

  phones.forEach((p) => p.socket.close());
  return {
    everyoneIn: phones[0].room.players.length === PLAYERS,
    uniqueTaskLists,
    lockOpened,
    allVotesCounted: phones[0].result?.votes?.length === PLAYERS,
    lockNeeded: lock.needed,
    lockMax: lock.maxNumber,
    distinctLists: new Set(lists).size,
  };
}

const started = Date.now();
const results = await Promise.all(
  Array.from({ length: GAMES }, (_, i) => game(i).catch((err) => ({ error: err.message })))
);
latencies.sort((a, b) => a - b);
const pct = (q) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];
let failed = 0;
for (const [i, r] of results.entries()) {
  const ok = !r.error && r.everyoneIn && r.uniqueTaskLists && r.lockOpened && r.allVotesCounted;
  if (!ok) failed++;
  console.log(
    `game ${i + 1}: ${ok ? 'ok' : 'FAILED'} ${r.error ?? `(${PLAYERS} joined, number lock 1-${r.lockMax} with ${r.lockNeeded} players opened: ${r.lockOpened}, ${PLAYERS} votes counted: ${r.allVotesCounted}, no repeated task on any phone: ${r.uniqueTaskLists})`}`
  );
}
console.log(
  `\n${GAMES} games x ${PLAYERS} players = ${GAMES * PLAYERS} phones in ${((Date.now() - started) / 1000).toFixed(1)}s. ` +
    `Server replies: median ${pct(0.5)}ms, 95% within ${pct(0.95)}ms, slowest ${latencies.at(-1)}ms.`
);
console.log(failed ? `\n${failed} GAME(S) FAILED` : '\nLOAD TEST PASSED');
process.exit(failed ? 1 : 0);
