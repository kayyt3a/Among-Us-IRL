// Host-adjustable timers, reporting a body, the hidden-role house rule and
// the vote breakdown. Needs the server running (npm run dev:server).
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
const near = (a, b, slackMs = 1500) => Math.abs(a - b) <= slackMs;
const ask = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));

function phone(name) {
  const p = { name, socket: io(URL, { transports: ['websocket'] }), errors: [] };
  p.socket.on('room_update', (r) => (p.room = r));
  p.socket.on('game_started', (info) => (p.info = info));
  p.socket.on('meeting_called', (m) => (p.meeting = m));
  p.socket.on('meeting_result', (r) => (p.result = r));
  p.socket.on('kill_status', (k) => (p.killAt = k.availableAt));
  p.socket.on('error_message', (e) => p.errors.push(e.message));
  return p;
}

async function main() {
  const phones = ['Maya', 'Liam', 'Priya', 'Noah', 'Zoe'].map(phone);
  await Promise.all(phones.map((p) => new Promise((r) => p.socket.once('connect', r))));
  const [host] = phones;
  const created = await ask(host.socket, 'create_room', { name: host.name });
  host.id = created.playerId;
  for (const p of phones.slice(1)) p.id = (await ask(p.socket, 'join_room', { code: created.code, name: p.name })).playerId;

  console.log('=== Timers are clamped to their limits and step ===');
  host.socket.emit('update_settings', {
    meetingSpot: 'Couch',
    gameMinutes: 999,
    discussionSeconds: 7,
    votingSeconds: 20,
    killCooldownSeconds: 33,
  });
  await wait(200);
  const s = host.room.settings;
  check(s.gameMinutes === 60, `game clock capped at 60 min (got ${s.gameMinutes})`);
  check(s.discussionSeconds === 15, `discussion floored at 15s (got ${s.discussionSeconds})`);
  check(s.votingSeconds === 15, `voting snapped to a 15s step (got ${s.votingSeconds})`);
  check(s.killCooldownSeconds === 35, `kill cooldown snapped to a 5s step (got ${s.killCooldownSeconds})`);
  check(s.revealRoleOnEject === true, 'roles are revealed on eject by default');

  host.socket.emit('update_settings', { gameMinutes: 5, killCooldownSeconds: 15, revealRoleOnEject: false });
  await wait(150);
  const startedAt = Date.now();
  host.socket.emit('start_game');
  await wait(400);
  check(near(host.room.gameEndsAt, startedAt + 5 * 60_000), 'a 5 minute game clock is used');

  const impostor = phones.find((p) => p.info.role === 'impostor');
  const crew = phones.filter((p) => p !== impostor);
  const [victim, reporter, ...others] = crew;

  console.log('\n=== Reporting a body ===');
  reporter.socket.emit('report_body', { bodyId: victim.id });
  await wait(200);
  check(host.room.phase === 'playing', 'reporting someone who is alive does not start a meeting');
  check(/isn't a body/.test(reporter.errors.at(-1) ?? ''), 'and the reporter is told so');

  impostor.socket.emit('kill_player', { targetId: victim.id });
  await wait(250);
  check(near(impostor.killAt, Date.now() + 15_000), 'kill cooldown uses the host setting (15s)');

  reporter.socket.emit('report_body', { bodyId: victim.id });
  await wait(200);
  check(host.room.phase === 'playing', 'a second report right after a wrong one has to wait');
  check(/Hold on/.test(reporter.errors.at(-1) ?? ''), 'with a short wait message');

  others[0].socket.emit('report_body', { bodyId: victim.id });
  await wait(250);
  check(host.room.phase === 'meeting', 'a real body report starts a meeting');
  check(host.meeting?.reason === 'report', 'as a body report');
  check(host.meeting?.bodyName === victim.name, `naming whose body was found (${host.meeting?.bodyName})`);
  check(host.meeting?.calledByName === others[0].name, 'and who found it');
  check(near(host.meeting.discussionEndsAt - Date.now(), 15_000), 'discussion uses the host setting (15s)');

  console.log('\n=== Voting: everyone sees who voted for whom ===');
  await wait(Math.max(0, host.meeting.discussionEndsAt - Date.now()) + 300);
  const alive = phones.filter((p) => p !== victim);
  for (const p of alive) p.socket.emit('cast_vote', { targetId: p === impostor ? reporter.id : impostor.id });
  for (let i = 0; i < 20 && !host.result; i++) await wait(200);
  const r = host.result;
  check(r?.eliminatedId === impostor.id, 'the impostor was voted out');
  check(r?.votes?.length === alive.length, `all ${alive.length} votes listed`);
  const impostorVote = r?.votes?.find((v) => v.voterId === impostor.id);
  check(impostorVote?.voterName === impostor.name && impostorVote?.targetId === reporter.id, "the impostor's own vote is shown by name");
  check(r?.eliminatedRole === null && r?.roleHidden === true, 'role stays hidden when the host turned reveals off');

  console.log('\n=== Reporting is free ===');
  host.socket.emit('play_again');
  await wait(200);
  host.socket.emit('start_game');
  await wait(400);
  const imp2 = phones.find((p) => p.info.role === 'impostor');
  const crew2 = phones.filter((p) => p !== imp2);
  imp2.socket.emit('kill_player', { targetId: crew2[0].id });
  await wait(200);
  crew2[1].socket.emit('report_body', { bodyId: crew2[0].id });
  await wait(250);
  check(host.room.phase === 'meeting', 'body reported in round 2');
  await wait(Math.max(0, host.meeting.discussionEndsAt - Date.now()) + 300);
  for (const p of phones.filter((p) => p !== crew2[0])) p.socket.emit('cast_vote', { targetId: 'skip' });
  await wait(600);
  crew2[1].socket.emit('report_body', { bodyId: crew2[0].id });
  await wait(200);
  check(host.room.phase === 'playing', 'a body seen at a meeting cannot be reported again');
  await wait(20_500); // the meeting cooldown, so only "used up" could stop the next call
  crew2[1].socket.emit('call_meeting', { reason: 'emergency' });
  await wait(250);
  check(host.room.phase === 'meeting', 'the reporter still has their emergency meeting');

  phones.forEach((p) => p.socket.close());
  console.log(failures ? `\n${failures} FEATURE TEST(S) FAILED` : '\nALL FEATURE TESTS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
