// The number lock sabotage: target always reachable, entries shown without
// names, double-ups and wrong totals don't open it, the right combination
// does, and a death mid-lock is handled. Needs the server running.
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:4000';
const MAX = 15;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  pass:', msg);
  else {
    failures++;
    console.log('  FAIL:', msg);
  }
}
const ask = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));

/** Different numbers from 1 to MAX, `count` of them, adding up to `target`. */
function combination(count, target) {
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  let left = target - nums.reduce((a, b) => a + b, 0);
  for (let i = count - 1; i >= 0 && left > 0; i--) {
    const room = MAX - (count - 1 - i) - nums[i];
    const add = Math.min(room, left);
    nums[i] += add;
    left -= add;
  }
  return left === 0 ? nums : null;
}

function phone(name) {
  const p = { name, socket: io(URL, { transports: ['websocket'] }), events: [] };
  p.socket.on('room_update', (r) => (p.room = r));
  p.socket.on('game_started', (info) => (p.info = info));
  p.socket.on('sabotage_triggered', (e) => p.events.push(['triggered', e]));
  p.socket.on('sabotage_stopped', () => p.events.push(['stopped']));
  p.socket.on('sabotage_status', (s) => (p.sabotage = s));
  return p;
}

async function main() {
  const phones = ['Maya', 'Liam', 'Priya', 'Noah', 'Zoe'].map(phone);
  await Promise.all(phones.map((p) => new Promise((r) => p.socket.once('connect', r))));
  const created = await ask(phones[0].socket, 'create_room', { name: 'Maya' });
  phones[0].id = created.playerId;
  for (const p of phones.slice(1)) p.id = (await ask(p.socket, 'join_room', { code: created.code, name: p.name })).playerId;
  phones[0].socket.emit('update_settings', { meetingSpot: 'Couch' });
  await wait(150);
  phones[0].socket.emit('start_game');
  await wait(400);
  const imp = phones.find((p) => p.info.role === 'impostor');
  const crew = phones.filter((p) => p !== imp);

  console.log('=== Starting a number lock ===');
  imp.socket.emit('trigger_sabotage', { kind: 'numbers' });
  await wait(300);
  const lock = phones[0].room.sabotagePuzzle;
  check(lock?.kind === 'numbers', 'impostor can pick the number lock');
  check(phones.every((p) => p.events.some(([t, e]) => t === 'triggered' && e.kind === 'numbers')), 'everyone is told it is a number lock');
  check(lock?.needed === 5, `all 5 living players have to pick (got ${lock?.needed})`);
  check(!!combination(5, lock.target), `target ${lock.target} is reachable with 5 different numbers from 1 to ${MAX}`);
  check(lock.target > 15, 'target is more than the bare minimum, so it takes some thought');
  check(!('entries' in lock), 'nobody sees who picked which number');

  console.log('\n=== Wrong answers keep it locked ===');
  const bad = await ask(crew[0].socket, 'submit_sabotage_number', { value: 16 });
  check(bad.ok === false, 'numbers above 15 are refused');
  for (const p of phones) await ask(p.socket, 'submit_sabotage_number', { value: 3 });
  await wait(200);
  check(phones[0].room.sabotagePuzzle?.kind === 'numbers', 'everyone picking 3 (double-ups) does not open it');
  check(phones[0].room.sabotagePuzzle.entered.join(',') === '3,3,3,3,3', 'the picked numbers show, duplicates included');
  check(crew[0].room.sabotagePuzzle.myNumber === 3, "each phone sees its own pick");

  console.log('\n=== A death mid-lock ===');
  // The impostor takes someone out before they change their number. The lock
  // now needs 4 picks, and the target moves if 4 people can no longer hit it.
  const victim = crew[3];
  imp.socket.emit('kill_player', { targetId: victim.id });
  await wait(900);
  const after = phones[0].room.sabotagePuzzle;
  check(after?.needed === 4, `only the 4 still alive need to pick now (got ${after?.needed})`);
  check(!!combination(4, after.target), `target ${after.target} is still reachable with 4 picks`);

  console.log('\n=== The right combination opens it ===');
  const alive = phones.filter((p) => p !== victim);
  const answer = combination(4, after.target);
  for (const [i, p] of alive.entries()) await ask(p.socket, 'submit_sabotage_number', { value: answer[i] });
  await wait(300);
  check(phones[0].room.sabotagePuzzle === null, `picking ${answer.join(' + ')} = ${after.target} opens the lock`);
  check(phones.every((p) => p.events.some(([t]) => t === 'stopped')), 'everyone is told the sabotage is over');
  check(imp.sabotage?.usesRemaining === 2 && imp.sabotage.availableAt > Date.now(), 'a charge was used and the cooldown started');

  console.log('\n=== Once it is open ===');
  const late = await ask(alive[0].socket, 'submit_sabotage_number', { value: 5 });
  check(late.ok === false, 'no number lock to answer once it is open');

  phones.forEach((p) => p.socket.close());
  console.log(failures ? `\n${failures} SABOTAGE TEST(S) FAILED` : '\nALL SABOTAGE TESTS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
