# IRL Impostor

A real-life social deduction party game (Among Us style), playable in
anyone's house with zero setup. Open a link, join with a room code, and
play. No accounts, no app install, no QR codes or Bluetooth.

## How it works

1. The host creates a game and gets a 4-letter room code.
2. Everyone else opens the app and joins with that code.
3. The host starts the game. Roles are assigned secretly per device:
   most players are **crewmates**, one or two are **impostors**.
4. Every crewmate gets a personal task list pulled from room-tagged pools
   (kitchen, bathroom, living room, bedroom, outdoor, anywhere), and no task
   repeats within a session. The impostor gets an identical-looking but
   fake task list. The host can also type in their own **custom tasks**
   before starting, mixed into the pool alongside the built-in ones.
5. Tasks are completed on the honor system, just tap "Done". Every
   player also gets one shared **common task** (the "swipe card"
   equivalent, e.g. grab a square of toilet paper and hold it up),
   and tasks are tagged **visual** when a bystander could actually
   watch you do them, both real Among Us mechanics for catching an
   impostor who's clearly never done the thing.
6. Big moments come with a vibration + a short synthesized tone, so a
   phone face-down on the couch still gets your attention: a meeting
   being called, dying, a sabotage landing, and the game ending all buzz
   the device, plus a one-time warning when the game clock drops under a
   minute.
7. Everyone can see a shared **crew task progress bar**, the same info the
   classic Among Us task bar gives, useful for the crew to gauge urgency
   and for the impostor to bluff and time sabotage without it ever
   revealing who personally is behind.
8. The impostor eliminates nearby players by tapping **Eliminate** and
   picking a target. Proximity is verified with an audio handshake: the
   impostor's phone plays a short near-ultrasonic tone (Web Audio), and
   the target's phone silently listens for it via the mic (`getUserMedia`
   + an FFT analyser). If it hears the exact tone the server assigned
   to that attempt, the two phones are close enough together and the
   kill confirms. No pairing, Bluetooth, or GPS involved. If a phone's
   mic is unavailable, or the check can't confirm within ~8s (party
   noise, a cheap speaker, a locked screen), it falls back to an
   honor-code "Eliminate anyway" button so a bad mic can never soft-lock
   a kill.
9. After a kill, the impostor has a short window to trigger **Vent**: a
   full-screen blackout broadcast to every device at once, so no one can
   use screen state to tell who's alive, dead, or the impostor.
10. Before starting, the host sets a **meeting spot**, a real place in
    the house (the couch, the kitchen table). Anyone can **call a
    meeting** at any time; every device shows "Everyone return to
    [meeting spot]" plus a synced discussion timer and a vote, and the
    most-voted player is eliminated.
11. A shared **game clock** (20 minutes by default) runs the whole
    match. If it hits zero, the impostors win by default. The
    impostor has a handful of **sabotage** charges (with a cooldown
    between uses); spending one shows two scrambled words to the
    whole room, and while they're unsolved the clock drains at 1.5x
    speed. Anyone can type guesses, and solving both words stops the
    drain and starts the cooldown. No reactor/O2 stations to physically
    go stand at, just a shared puzzle and real pressure everyone can
    watch ticking down.
12. Four optional roles, toggled by the host before starting: the
    **Judge** can force-eject anyone once during a vote (get it
    wrong and the Judge is ejected instead); the **Guardian Angel**,
    once they've died, can shield one living player from the next
    kill, once; the **Sheriff** can shoot a suspect once at any time
    during play (an innocent guess eliminates the Sheriff instead);
    the **Engineer** can trigger a decoy blackout vent once, to throw
    suspicion around even though they're not the impostor.
13. The game ends when all impostors are caught, the impostors
    outnumber (or equal) the remaining crewmates, every crewmate's
    tasks are done (ghosts keep working their list, and an unfinished
    one still blocks the win), or the clock runs out. The end screen
    recaps how many tasks got done and how long the match ran, next
    to the final roles, plus every player's win tally for the session
    so far, since a room keeps score across rounds.
14. By default, anyone who joins after a round has already started is
    dealt straight in as a crewmate (their own fresh task list, plus
    the round's common task) so latecomers can jump right into the
    party. The host can flip **"Latecomers play immediately"** off in
    the lobby if they'd rather late joiners **spectate** that round
    (watch only, no vote, no meeting, no role) and play from the next
    round on instead. The host can also kick a player or hand host
    powers to someone else from the lobby.

## Tech stack

- **Server**: Node + Express + Socket.IO, in-memory game state (no
  database, since games are ephemeral and single-house by design).
- **Client**: React + TypeScript (Vite), installable as a PWA.
- **Shared**: a small workspace package with the wire types and the task
  pools, imported by both client and server so they can't drift apart.

This is a monorepo with three npm workspaces: `shared`, `server`,
`client`.

## Running it locally

Requires Node 20+.

```bash
npm install
npm run build:shared   # shared types/task pools used by both server & client

# in one terminal
npm run dev:server     # http://localhost:4000

# in another terminal
npm run dev:client     # http://localhost:5173, proxies /socket.io to :4000
```

Open `http://localhost:5173` on your phone (same Wi-Fi) or in multiple
browser tabs to simulate several players. One device hosts, the rest
join with the room code shown on the host's screen.

### Production build

```bash
npm run build           # builds shared, server, and client
npm --workspace server start
```

The server serves the built client as static files from `client/dist`,
so a single deployed process (e.g. on Fly.io, Render, or a Raspberry Pi
on the house Wi-Fi) is enough to host a game for everyone in the room.

### Deploying

There's a `Dockerfile` at the repo root. It's a single-stage image that
just runs the same `npm install && npm run build` and
`npm --workspace server start` as above inside a `node:20-slim`
container, so anywhere that can run a container can host a game.

**Render** is the recommended path. No CLI needed, deploy straight
from the GitHub repo:

1. Push this repo to your own GitHub account (or use it directly if
   it's already there).
2. On [render.com](https://render.com), **New > Blueprint**, point it at
   the repo. It picks up `render.yaml` at the root and configures
   itself (Docker runtime, health check on `/health`).
3. Deploy. You'll get a URL like `https://irl-impostor.onrender.com`.

The free tier spins the container down after a period of inactivity.
The first request after that takes ~30s to wake it back up, which is
fine for a casual game night but worth knowing before a live demo.

No Blueprint support, or you'd rather click through the dashboard
yourself: **New > Web Service**, connect the repo, runtime **Docker**,
leave the Dockerfile path as `./Dockerfile`, and set a `PORT` env var
to `10000` (Render's default). The server already reads `PORT` from
the environment, so nothing else to configure.

**Fly.io** is a solid alternative if you'd rather use a CLI. Free
tier, one binary. There's a starter `fly.toml` at the repo root too:

```bash
brew install flyctl   # or see fly.io/docs/hands-on/install-flyctl
fly auth login
fly launch            # detects fly.toml and the Dockerfile; pick a unique app name
fly deploy
```

Or run the container yourself anywhere Docker works:

```bash
docker build -t irl-impostor .
docker run -p 4000:4000 irl-impostor
```

Whatever you deploy to, set `CLIENT_ORIGIN` to your app's URL if you
ever split the client off to a different origin (not needed for the
default single-process setup, where the server serves the client
itself). Since game state lives in memory, a redeploy or restart clears
any rooms in progress. Fine for a game night, not meant to run
unattended for days.

### Smoke test

`scripts/smoke-test.mjs` drives a full game end-to-end over real
Socket.IO connections (join, roles, a task completion, a kill, a vent,
a meeting, a vote, and the win condition). Useful after touching the
server's game logic:

```bash
npm run dev:server &          # or a built server
node scripts/smoke-test.mjs
```

It takes about a minute to run since it waits out the real meeting
discussion timer.

`scripts/pacing-test.mjs` covers the newer mechanics specifically:
common-task assignment, the per-killer kill cooldown, the Guardian
Angel shield blocking a kill, the sabotage unscramble puzzle (charge
count, the ~1.5x accelerated clock drain while unsolved, solving it
with two different players, and the cooldown afterward), and the
per-player meeting limit + cooldown. Run it the same way
(`npm run test:pacing`). It also takes about a minute, for the same
reason.

`scripts/proximity-test.mjs` (`npm run test:proximity`) drives the
audio-handshake kill state machine directly: a correct tone
confirming the kill, a mismatched tone timing out, and a missing mic
falling back to an instant kill, without needing real microphone or
speaker hardware.

`scripts/roles-test.mjs` (`npm run test:roles`) covers custom tasks
getting mixed into the assignment pool, the Engineer's decoy vent
(one-time use, broadcast to everyone), and the Sheriff's shot both
landing on the real impostor and misfiring on an innocent crewmate
(which eliminates the Sheriff instead). It's fast, no long waits.

`scripts/hostcontrols-test.mjs` (`npm run test:hostcontrols`) covers
the host kicking a player from the lobby, transferring host mid-game,
a late joiner being dealt straight into the round as a crewmate
(default), a late joiner landing as a spectator instead when the host
turns that off, and win tallies accumulating correctly across two
rounds in the same room.

## Configuration

Host-adjustable in the lobby: tasks per player (3–8), impostor count
(scales with player count), the meeting spot (required to start),
custom tasks, whether the Judge / Guardian Angel / Sheriff / Engineer
roles are in play, and whether latecomers play immediately or spectate
(this one can also be flipped mid-game). Everything else (meeting
timers, the vent window, kill cooldown, meeting limit/cooldown, game
clock length, sabotage charges/cooldown/penalty, room idle cleanup)
lives in `server/src/constants.ts`.

## MVP scope

Implemented: room creation/join, secret role + unique task assignment
(plus a shared common task, visual-task tagging, and host-defined
custom tasks), a live shared task-progress bar, kill + blackout vent,
a shared game clock with a scarce-charge sabotage unscramble puzzle,
meetings with a synced timer and vote, four optional roles (Judge, Guardian Angel,
Sheriff, Engineer), sound + haptic feedback for the game's key
moments, an end-of-game recap (tasks done, match length, final roles,
win tallies), a persistent per-room scoreboard across rounds, host
controls (kick, transfer host, toggling whether mid-round joiners play
immediately or spectate), win conditions, reconnect-on-refresh, a PWA
manifest, and a Dockerfile + `fly.toml` for deploying it somewhere
reachable.

Not implemented yet (see the project spec for the full list): ads,
accounts, themed/preset task packs beyond free-typed custom tasks.
