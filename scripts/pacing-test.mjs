import { io } from 'socket.io-client';
import { SABOTAGE_WORDS } from '@irl-impostor/shared';

function solveScrambled(scrambled) {
  const key = [...scrambled.toUpperCase()].sort().join('');
  return SABOTAGE_WORDS.find((w) => [...w.toUpperCase()].sort().join('') === key);
}

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

async function testCommonTaskAndPacing() {
  console.log('=== Room A: common task, special roles, kill cooldown, sabotage, meeting limit ===');
  const g = await makeRoom(['Host', 'Alice', 'Bob', 'Cara', 'Dan'], {
    meetingSpot: 'Living room couch',
    judgeEnabled: true,
    guardianAngelEnabled: true,
    tasksPerPlayer: 3,
    impostorCount: 1,
  });
  const { sockets, playerIds, names, gameStarted } = g;

  assert(g.room.settings.judgeEnabled === true, 'judgeEnabled reflected in room_update');
  assert(g.room.settings.guardianAngelEnabled === true, 'guardianAngelEnabled reflected in room_update');

  const impostorIdx = Number(Object.entries(gameStarted).find(([, info]) => info.role === 'impostor')[0]);
  const crewIdxs = Object.entries(gameStarted).filter(([, info]) => info.role === 'crewmate').map(([i]) => Number(i));
  console.log('roles:', names.map((n, i) => `${n}=${gameStarted[i].role}`).join(', '));

  console.log('--- Common task ---');
  const commonTexts = new Set(Object.values(gameStarted).map((info) => info.tasks.find((t) => t.common)?.text));
  assert(commonTexts.size === 1, 'exactly one shared common-task text across all players');
  for (const i of Object.keys(gameStarted)) {
    assert(gameStarted[i].tasks.length === 4, `${names[i]} has 3 individual + 1 common task (4 total)`);
  }

  console.log('--- Special roles ---');
  const judgeIdx = crewIdxs.find((i) => gameStarted[i].specialRole === 'judge');
  const gaIdx = crewIdxs.find((i) => gameStarted[i].specialRole === 'guardian-angel');
  assert(judgeIdx !== undefined, 'a crewmate was assigned Judge');
  assert(gaIdx !== undefined, 'a crewmate was assigned Guardian Angel');
  assert(judgeIdx !== gaIdx, 'Judge and Guardian Angel are different players');

  console.log('--- Kill cooldown (kill is available immediately at round start) ---');
  const victim1 = crewIdxs.find((i) => i !== gaIdx);
  const killResult1 = await new Promise((resolve) => {
    sockets[impostorIdx].once('kill_result', resolve);
    sockets[impostorIdx].emit('kill_player', { targetId: playerIds[victim1] });
  });
  assert(killResult1.ok === true, 'first kill succeeds');

  const victim2 = crewIdxs.find((i) => i !== gaIdx && i !== victim1);
  const killResult2 = await new Promise((resolve) => {
    sockets[impostorIdx].once('kill_result', resolve);
    sockets[impostorIdx].emit('kill_player', { targetId: playerIds[victim2] });
  });
  assert(killResult2.ok === false, 'second immediate kill rejected by cooldown: ' + killResult2.message);

  console.log('--- Vent is available at round start too, independent of the kill cooldown ---');
  const ventPromise1 = waitFor(sockets[impostorIdx], 'vent_triggered');
  sockets[impostorIdx].emit('trigger_vent');
  await ventPromise1;
  assert(true, 'vent triggers even though this impostor is still on kill cooldown');

  let gotSecondVent = false;
  sockets[impostorIdx].once('vent_triggered', () => { gotSecondVent = true; });
  sockets[impostorIdx].emit('trigger_vent');
  await wait(300);
  assert(gotSecondVent === false, 'an immediate second vent is rejected by its own cooldown');

  console.log('--- guardian_protect rejected while Guardian Angel still alive ---');
  const protectWhileAliveResult = await new Promise((resolve) => {
    sockets[gaIdx].once('error_message', resolve);
    sockets[gaIdx].emit('guardian_protect', { targetId: playerIds[victim1] });
  });
  assert(
    /only the guardian angel, once dead/i.test(protectWhileAliveResult.message),
    'rejected: ' + protectWhileAliveResult.message
  );

  console.log('--- Sabotage: unscramble puzzle + accelerated drain + cooldown ---');
  const beforeClock = g.room.gameEndsAt;
  assert(typeof beforeClock === 'number', 'game clock is running after start');
  const sabotageOkPromise = waitFor(sockets[impostorIdx], 'sabotage_triggered');
  sockets[impostorIdx].emit('trigger_sabotage');
  await sabotageOkPromise;
  await wait(150);
  assert(!!g.room.sabotagePuzzle, 'a sabotage puzzle is now active');
  assert(g.room.sabotagePuzzle.scrambled.length === 2, 'puzzle has two scrambled words');
  assert(g.room.sabotagePuzzle.solved.every((s) => s === false), 'neither word is solved yet');

  const againWhileActive = await new Promise((resolve) => {
    sockets[impostorIdx].once('error_message', resolve);
    sockets[impostorIdx].emit('trigger_sabotage');
  });
  assert(
    /already in progress/i.test(againWhileActive.message),
    're-triggering while active is rejected: ' + againWhileActive.message
  );

  console.log('--- letting the accelerated drain run for ~2s before solving ---');
  const triggerMoment = Date.now();
  const remainingAtTrigger = g.room.gameEndsAt - triggerMoment;
  await wait(2000);
  const now = Date.now();
  const remainingNow = g.room.gameEndsAt - now;
  const drainRate = (remainingAtTrigger - remainingNow) / (now - triggerMoment);
  // Should be ~1.5x (1x normal passage + the 0.5x extra sabotage drain); slack for the
  // 500ms tick granularity and test jitter.
  assert(drainRate > 1.3 && drainRate < 1.7, `remaining time drained at ~1.5x while unsolved (got ${drainRate.toFixed(2)}x)`);

  console.log('--- solving both scrambled words ---');
  const word0 = solveScrambled(g.room.sabotagePuzzle.scrambled[0]);
  const word1 = solveScrambled(g.room.sabotagePuzzle.scrambled[1]);
  assert(!!word0 && !!word1, 'both scrambled words resolve back to a known word');

  const wrongGuess = await new Promise((resolve) => sockets[0].emit('submit_unscramble', { wordIndex: 0, guess: 'notaword' }, resolve));
  assert(wrongGuess.ok === false, 'a wrong guess is rejected');

  const stoppedPromise = waitFor(sockets[0], 'sabotage_stopped');
  const solve0 = await new Promise((resolve) => sockets[0].emit('submit_unscramble', { wordIndex: 0, guess: word0 }, resolve));
  assert(solve0.ok === true, 'first word solved');
  const solve1 = await new Promise((resolve) => sockets[1].emit('submit_unscramble', { wordIndex: 1, guess: word1 }, resolve));
  assert(solve1.ok === true, 'second word solved by a different player');
  await stoppedPromise;
  await wait(150);
  assert(g.room.sabotagePuzzle === null, 'puzzle cleared once both words are solved');

  const sabotageAgainResult = await new Promise((resolve) => {
    sockets[impostorIdx].once('error_message', resolve);
    sockets[impostorIdx].emit('trigger_sabotage');
  });
  assert(/cooldown/i.test(sabotageAgainResult.message), 'immediate re-trigger after solving is blocked by cooldown: ' + sabotageAgainResult.message);

  console.log('--- Meeting per-player limit (resolves the meeting first, ~60s) ---');
  const callerIdx = crewIdxs.find((i) => i !== gaIdx && i !== victim1 && i !== victim2);

  // Calling again *during* the active meeting should fail on the phase gate, not the limit.
  const meetingCalledPromise = waitFor(sockets[callerIdx], 'meeting_called');
  sockets[callerIdx].emit('call_meeting', { reason: 'emergency' });
  await meetingCalledPromise;
  console.log('  first meeting call succeeded');
  const duringMeetingResult = await new Promise((resolve) => {
    sockets[callerIdx].once('error_message', resolve);
    sockets[callerIdx].emit('call_meeting', { reason: 'emergency' });
  });
  assert(
    /can only call a meeting during play/i.test(duringMeetingResult.message),
    'calling again mid-meeting is rejected: ' + duringMeetingResult.message
  );

  // Resolve the meeting: wait for voting, everyone still alive votes skip.
  // Only victim1 actually died. victim2's kill was rejected by cooldown above,
  // so they're still alive and still need to vote for allAliveHaveVoted() to fire.
  await waitFor(sockets[callerIdx], 'meeting_phase_changed', 65000);
  const stillAlive = crewIdxs.filter((i) => i !== victim1).concat([impostorIdx]);
  const resolvedPromise = waitFor(sockets[callerIdx], 'meeting_result', 35000);
  for (const i of stillAlive) {
    sockets[i].emit('cast_vote', { targetId: 'skip' });
  }
  await resolvedPromise;
  await wait(200);
  console.log('  meeting resolved, phase back to playing');

  // Now the per-player meeting limit itself should kick in.
  const secondMeetingResult = await new Promise((resolve) => {
    sockets[callerIdx].once('error_message', resolve);
    sockets[callerIdx].emit('call_meeting', { reason: 'emergency' });
  });
  assert(/out of meetings/i.test(secondMeetingResult.message), 'second call by same player rejected: ' + secondMeetingResult.message);

  // A different, meeting-unused player should also be blocked by the cooldown right after close.
  const otherCallerIdx = stillAlive.find((i) => i !== callerIdx);
  const cooldownResult = await new Promise((resolve) => {
    sockets[otherCallerIdx].once('error_message', resolve);
    sockets[otherCallerIdx].emit('call_meeting', { reason: 'emergency' });
  });
  assert(/cooldown/i.test(cooldownResult.message), 'a different player is blocked by the meeting cooldown: ' + cooldownResult.message);

  sockets.forEach((s) => s.disconnect());
}

async function testGuardianAngelShield() {
  console.log('\n=== Room B: Guardian Angel shield blocks a kill ===');
  // Two impostors so the shield-testing kill comes from a killer with a fresh (unused) cooldown.
  const g = await makeRoom(['Host', 'Alice', 'Bob', 'Cara', 'Dan', 'Eve'], {
    meetingSpot: 'Kitchen',
    guardianAngelEnabled: true,
    tasksPerPlayer: 2,
    impostorCount: 2,
  });
  const { sockets, playerIds, names, gameStarted } = g;

  const impostorIdxs = Object.entries(gameStarted).filter(([, info]) => info.role === 'impostor').map(([i]) => Number(i));
  const crewIdxs = Object.entries(gameStarted).filter(([, info]) => info.role === 'crewmate').map(([i]) => Number(i));
  console.log('roles:', names.map((n, i) => `${n}=${gameStarted[i].role}`).join(', '));
  assert(impostorIdxs.length === 2, 'two impostors assigned');

  const gaIdx = crewIdxs.find((i) => gameStarted[i].specialRole === 'guardian-angel');
  assert(gaIdx !== undefined, 'a crewmate was assigned Guardian Angel');
  const [impA, impB] = impostorIdxs;
  const shieldTarget = crewIdxs.find((i) => i !== gaIdx);
  const otherTarget = crewIdxs.find((i) => i !== gaIdx && i !== shieldTarget);

  console.log('--- Impostor A kills the Guardian Angel ---');
  const gaDied = waitFor(sockets[gaIdx], 'you_died');
  sockets[impA].emit('kill_player', { targetId: playerIds[gaIdx] });
  await gaDied;
  console.log('  pass: Guardian Angel is dead');

  console.log('--- Guardian Angel shields a living player ---');
  await new Promise((resolve) => {
    sockets[gaIdx].once('room_update', resolve); // any subsequent update is fine as an ack tick
    sockets[gaIdx].emit('guardian_protect', { targetId: playerIds[shieldTarget] });
  });
  await wait(150);

  console.log('--- A different impostor tries to kill the shielded player: blocked ---');
  const shieldNotice = waitFor(sockets[gaIdx], 'guardian_protection_used');
  const blockedResult = await new Promise((resolve) => {
    sockets[impB].once('kill_result', resolve);
    sockets[impB].emit('kill_player', { targetId: playerIds[shieldTarget] });
  });
  assert(blockedResult.ok === false, 'kill on shielded player is blocked: ' + blockedResult.message);
  await shieldNotice;
  console.log('  pass: Guardian Angel received guardian_protection_used');

  console.log('--- Same impostor can still kill a different, unshielded player ---');
  const otherResult = await new Promise((resolve) => {
    sockets[impB].once('kill_result', resolve);
    sockets[impB].emit('kill_player', { targetId: playerIds[otherTarget] });
  });
  assert(otherResult.ok === true, 'kill on unshielded player succeeds (shield block did not cost a cooldown)');

  sockets.forEach((s) => s.disconnect());
}

async function main() {
  await testCommonTaskAndPacing();
  await testGuardianAngelShield();
  console.log('\nALL PACING TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('PACING TEST FAILED:', e);
  process.exit(1);
});
