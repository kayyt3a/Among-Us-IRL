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

async function main() {
  const names = ['Host', 'Alice', 'Bob', 'Cara', 'Dan', 'Straggler'];
  const sockets = names.map(() => io(URL, { transports: ['websocket'] }));
  await Promise.all(sockets.map((s) => waitFor(s, 'connect')));

  let latestRoom = null;
  sockets[0].on('room_update', (r) => (latestRoom = r));

  const createRes = await new Promise((resolve) => sockets[0].emit('create_room', { name: names[0] }, resolve));
  const code = createRes.code;
  const playerIds = [createRes.playerId];
  // Straggler (index 5) joins later, after round 1 has started — everyone else joins now.
  for (let i = 1; i < 5; i++) {
    const res = await new Promise((resolve) => sockets[i].emit('join_room', { code, name: names[i] }, resolve));
    playerIds.push(res.playerId);
  }
  await wait(150);
  console.log('=== Lobby: kick + transfer host ===');
  assert(latestRoom.players.length === 5, 'lobby has 5 players before kick');

  console.log('--- Host kicks Dan ---');
  const kickedPromise = waitFor(sockets[4], 'kicked');
  sockets[0].emit('kick_player', { targetId: playerIds[4] });
  await kickedPromise;
  await wait(150);
  assert(latestRoom.players.length === 4, 'lobby has 4 players after kick');
  assert(!latestRoom.players.some((p) => p.id === playerIds[4]), 'Dan is gone from the roster');

  console.log('--- Host transfers host to Alice ---');
  sockets[0].emit('transfer_host', { targetId: playerIds[1] });
  await wait(150);
  assert(latestRoom.players.find((p) => p.id === playerIds[0]).isHost === false, 'old host lost isHost');
  assert(latestRoom.players.find((p) => p.id === playerIds[1]).isHost === true, 'Alice is now host');

  console.log('\n=== Round 1: new host starts, Straggler joins mid-round as a spectator ===');
  sockets[1].emit('update_settings', { meetingSpot: 'Kitchen', tasksPerPlayer: 3, impostorCount: 1 });
  await wait(150);

  const round1Started = {};
  const round1Promises = [sockets[0], sockets[1], sockets[2], sockets[3]].map(
    (s, i) => new Promise((resolve) => s.once('game_started', (info) => { round1Started[i] = info; resolve(); }))
  );
  sockets[1].emit('start_game');
  await Promise.all(round1Promises);
  await wait(150);
  assert(latestRoom.phase === 'playing', 'round 1 is underway');

  console.log('--- Straggler joins mid-round ---');
  const straggler = sockets[5];
  const joinRes = await new Promise((resolve) => straggler.emit('join_room', { code, name: names[5] }, resolve));
  assert(joinRes.ok === true, 'Straggler could join mid-round');
  const stragglerId = joinRes.playerId;
  await wait(150);
  assert(
    latestRoom.players.find((p) => p.id === stragglerId)?.isSpectator === true,
    'Straggler is marked as a spectator in the public roster'
  );

  console.log('--- Straggler never received a role for round 1 ---');
  let stragglerGotRole = false;
  straggler.once('game_started', () => { stragglerGotRole = true; });
  await wait(300);
  assert(stragglerGotRole === false, 'no game_started was sent to the spectator');

  console.log('--- Everyone finishes their tasks; crew wins round 1 ---');
  const gameOverPromise = waitFor(sockets[0], 'game_over', 8000);
  for (let i = 0; i < 4; i++) {
    for (const t of round1Started[i].tasks) {
      sockets[i].emit('complete_task', { taskId: t.taskId });
    }
  }
  const round1Result = await gameOverPromise;
  assert(round1Result.winner === 'crewmates', 'round 1 ends with a crewmate win (all real tasks done)');
  await wait(150);
  const winsAfterRound1 = new Map(latestRoom.players.map((p) => [p.id, p.wins]));
  const round1WinTotal = [...winsAfterRound1.values()].reduce((a, b) => a + b, 0);
  // 4 players, impostorCount 1 => 3 crewmates get credited, the 1 impostor doesn't.
  assert(round1WinTotal === 3, `3 crewmates credited with a win after round 1 (got ${round1WinTotal})`);
  assert((winsAfterRound1.get(stragglerId) ?? 0) === 0, "Straggler wasn't credited a win — they only spectated");

  console.log('\n=== Round 2: Straggler plays as a normal player; win tallies accumulate ===');
  sockets[1].emit('play_again');
  await wait(150);
  assert(latestRoom.phase === 'lobby', 'room reset to lobby');
  assert(
    latestRoom.players.find((p) => p.id === stragglerId)?.isSpectator === false,
    'Straggler is a normal player again for the next round'
  );

  await wait(150);

  // Dan was kicked back in the lobby, so this room is Host, Alice, Bob, Cara, Straggler = 5
  // players. maxImpostors for 5 players is still 1, so this stays a 1-impostor round —
  // finishing it the same way as round 1 (task completion) avoids the 45s kill cooldown
  // entirely, keeping the test fast regardless of who the impostor landed on this time.
  const round2Sockets = [sockets[0], sockets[1], sockets[2], sockets[3], straggler];
  const round2Started = {};
  const round2Promises = round2Sockets.map(
    (s, i) => new Promise((resolve) => s.once('game_started', (info) => { round2Started[i] = info; resolve(); }))
  );
  sockets[1].emit('start_game');
  await Promise.all(round2Promises);
  await wait(150);

  const round2CrewCount = Object.values(round2Started).filter((info) => info.role === 'crewmate').length;
  assert(round2CrewCount === 4, `round 2 has 4 crewmates (got ${round2CrewCount})`);

  console.log('--- Everyone finishes their tasks again; crew wins round 2 too ---');
  const round2GameOverPromise = waitFor(sockets[0], 'game_over', 8000);
  for (let i = 0; i < round2Sockets.length; i++) {
    for (const t of round2Started[i].tasks) {
      round2Sockets[i].emit('complete_task', { taskId: t.taskId });
    }
  }
  const round2Result = await round2GameOverPromise;
  assert(round2Result.winner === 'crewmates', 'round 2 also ends with a crewmate win');
  await wait(150);

  const winsAfterRound2 = new Map(latestRoom.players.map((p) => [p.id, p.wins]));
  const round2WinTotal = [...winsAfterRound2.values()].reduce((a, b) => a + b, 0);
  const expectedTotal = round1WinTotal + round2CrewCount;
  assert(
    round2WinTotal === expectedTotal,
    `win tally accumulated across both rounds (got ${round2WinTotal}, expected ${expectedTotal})`
  );
  assert(
    [...winsAfterRound2.values()].every((w) => w <= 2),
    'no player has more wins than rounds played (2)'
  );

  sockets.forEach((s) => s.disconnect());
}

main()
  .then(() => {
    console.log('\nALL HOST CONTROLS TESTS PASSED');
    process.exit(0);
  })
  .catch((e) => {
    console.error('HOST CONTROLS TEST FAILED:', e);
    process.exit(1);
  });
