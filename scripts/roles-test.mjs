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

async function makeRoom(names, settings) {
  const sockets = names.map(() => io(URL, { transports: ['websocket'] }));
  await Promise.all(sockets.map((s) => waitFor(s, 'connect')));
  let latestRoom = null;
  sockets[0].on('room_update', (r) => (latestRoom = r));

  const createRes = await new Promise((resolve) => sockets[0].emit('create_room', { name: names[0] }, resolve));
  const playerIds = [createRes.playerId];
  const code = createRes.code;
  for (let i = 1; i < sockets.length; i++) {
    const res = await new Promise((resolve) => sockets[i].emit('join_room', { code, name: names[i] }, resolve));
    playerIds.push(res.playerId);
  }
  await wait(150);
  sockets[0].emit('update_settings', settings);
  await wait(150);

  const gameStarted = {};
  const startPromises = sockets.map(
    (s, i) => new Promise((resolve) => s.once('game_started', (info) => { gameStarted[i] = info; resolve(); }))
  );
  sockets[0].emit('start_game');
  await Promise.all(startPromises);
  await wait(150);

  return { sockets, playerIds, names, gameStarted, get room() { return latestRoom; } };
}

async function testCustomTasksAndSheriffHit() {
  console.log('=== Room A: custom tasks + Sheriff correctly shoots the impostor ===');
  // Custom tasks always get a guaranteed slot in the assignment pool (up to
  // capacity), so with 96 needed slots for just 2 custom tasks, both are
  // certain to be dealt to someone.
  const g = await makeRoom(
    ['Host', 'Alice', 'Bob', 'Cara', 'Dan', 'Erin', 'Frank', 'Gina', 'Hank', 'Ivy', 'Jack', 'Kim'],
    {
      meetingSpot: 'Kitchen',
      sheriffEnabled: true,
      engineerEnabled: true,
      tasksPerPlayer: 8,
      impostorCount: 1,
      customTasks: ['Do your best chicken impression', 'Recite a tongue twister'],
    }
  );
  const { sockets, playerIds, names, gameStarted } = g;

  assert(g.room.settings.customTasks.length === 2, 'custom tasks reflected in room_update');

  const allTexts = new Set(Object.values(gameStarted).flatMap((info) => info.tasks.map((t) => t.text)));
  assert(
    allTexts.has('Do your best chicken impression') && allTexts.has('Recite a tongue twister'),
    'both custom tasks show up in the dealt tasks (pool cycles through every entry at this size)'
  );

  const impostorIdx = Number(Object.entries(gameStarted).find(([, info]) => info.role === 'impostor')[0]);
  const crewIdxs = Object.entries(gameStarted).filter(([, info]) => info.role === 'crewmate').map(([i]) => Number(i));
  console.log('roles:', names.map((n, i) => `${n}=${gameStarted[i].role}`).join(', '));

  const sheriffIdx = crewIdxs.find((i) => gameStarted[i].specialRole === 'sheriff');
  const engineerIdx = crewIdxs.find((i) => gameStarted[i].specialRole === 'engineer');
  assert(sheriffIdx !== undefined, 'a crewmate was assigned Sheriff');
  assert(engineerIdx !== undefined, 'a crewmate was assigned Engineer');
  assert(sheriffIdx !== engineerIdx, 'Sheriff and Engineer are different players');

  console.log('--- Engineer triggers a decoy vent ---');
  const ventPromises = sockets.map((s) => waitFor(s, 'vent_triggered'));
  const engineerAbilityPromise = waitFor(sockets[engineerIdx], 'ability_result');
  sockets[engineerIdx].emit('engineer_vent');
  const engineerAbility = await engineerAbilityPromise;
  assert(engineerAbility.ok === true, 'engineer_vent ability_result ok: ' + engineerAbility.message);
  await Promise.all(ventPromises);
  console.log('  pass: everyone received vent_triggered from the decoy vent');

  const engineerAgain = await new Promise((resolve) => {
    sockets[engineerIdx].once('ability_result', resolve);
    sockets[engineerIdx].emit('engineer_vent');
  });
  assert(engineerAgain.ok === false, 'second engineer_vent rejected: ' + engineerAgain.message);

  console.log('--- Sheriff shoots the impostor: hit ---');
  const sheriffAbilityPromise = waitFor(sockets[sheriffIdx], 'ability_result');
  const impostorDied = waitFor(sockets[impostorIdx], 'you_died');
  sockets[sheriffIdx].emit('sheriff_shoot', { targetId: playerIds[impostorIdx] });
  const sheriffAbility = await sheriffAbilityPromise;
  assert(sheriffAbility.ok === true, 'sheriff hit the impostor: ' + sheriffAbility.message);
  await impostorDied;
  console.log('  pass: impostor received you_died');
  await wait(150);
  assert(g.room.players.find((p) => p.id === playerIds[sheriffIdx]) !== undefined, 'sheriff still in roster (alive)');

  sockets.forEach((s) => s.disconnect());
}

async function testSheriffMisfire() {
  console.log('\n=== Room B: Sheriff misfires on an innocent crewmate ===');
  const g = await makeRoom(['Host', 'Alice', 'Bob', 'Cara', 'Dan', 'Eve'], {
    meetingSpot: 'Living room',
    sheriffEnabled: true,
    tasksPerPlayer: 2,
    impostorCount: 1,
  });
  const { sockets, playerIds, names, gameStarted } = g;

  const crewIdxs = Object.entries(gameStarted).filter(([, info]) => info.role === 'crewmate').map(([i]) => Number(i));
  console.log('roles:', names.map((n, i) => `${n}=${gameStarted[i].role}`).join(', '));
  const sheriffIdx = crewIdxs.find((i) => gameStarted[i].specialRole === 'sheriff');
  assert(sheriffIdx !== undefined, 'a crewmate was assigned Sheriff');
  const innocentTarget = crewIdxs.find((i) => i !== sheriffIdx);

  const sheriffAbilityPromise = waitFor(sockets[sheriffIdx], 'ability_result');
  const sheriffDied = waitFor(sockets[sheriffIdx], 'you_died');
  sockets[sheriffIdx].emit('sheriff_shoot', { targetId: playerIds[innocentTarget] });
  const sheriffAbility = await sheriffAbilityPromise;
  assert(sheriffAbility.ok === false, 'misfire reported as not ok: ' + sheriffAbility.message);
  await sheriffDied;
  console.log('  pass: Sheriff themselves received you_died after the misfire');

  const secondShot = await new Promise((resolve) => {
    sockets[sheriffIdx].once('ability_result', resolve);
    sockets[sheriffIdx].emit('sheriff_shoot', { targetId: playerIds[innocentTarget] });
  });
  assert(secondShot.ok === false, 'dead Sheriff cannot shoot again: ' + secondShot.message);

  sockets.forEach((s) => s.disconnect());
}

async function main() {
  await testCustomTasksAndSheriffHit();
  await testSheriffMisfire();
  console.log('\nALL ROLES TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('ROLES TEST FAILED:', e);
  process.exit(1);
});
