# IRL Impostor

A real-life social deduction party game (Among Us style), playable in
anyone's house with zero setup. Open a link, join with a room code, and
play — no accounts, no app install, no QR codes or Bluetooth.

## How it works

1. The host creates a game and gets a 4-letter room code.
2. Everyone else opens the app and joins with that code.
3. The host starts the game. Roles are assigned secretly per device:
   most players are **crewmates**, one or two are **impostors**.
4. Every crewmate gets a personal task list pulled from room-tagged pools
   (kitchen, bathroom, living room, bedroom, outdoor, anywhere) — no task
   repeats within a session. The impostor gets an identical-looking but
   fake task list. The host can also type in their own **custom tasks**
   before starting, mixed into the pool alongside the built-in ones.
5. Tasks are completed on the honor system — just tap "Done". Every
   player also gets one shared **common task** (the "swipe card"
   equivalent — e.g. grab a square of toilet paper and hold it up),
   and tasks are tagged **visual** when a bystander could actually
   watch you do them, both real Among Us mechanics for catching an
   impostor who's clearly never done the thing.
6. Big moments come with a vibration + a short synthesized tone, so a
   phone face-down on the couch still gets your attention: a meeting
   being called, dying, a sabotage landing, and the game ending all buzz
   the device, plus a one-time warning when the game clock drops under a
   minute.
7. The impostor eliminates nearby players by tapping **Eliminate** and
   picking a target. Proximity is verified with an audio handshake: the
   impostor's phone plays a short near-ultrasonic tone (Web Audio), and
   the target's phone silently listens for it via the mic (`getUserMedia`
   + an FFT analyser) — if it hears the exact tone the server assigned
   to that attempt, the two phones are close enough together and the
   kill confirms. No pairing, Bluetooth, or GPS involved. If a phone's
   mic is unavailable, or the check can't confirm within ~8s (party
   noise, a cheap speaker, a locked screen), it falls back to an
   honor-code "Eliminate anyway" button so a bad mic can never soft-lock
   a kill.
8. After a kill, the impostor has a short window to trigger **Vent** — a
   full-screen blackout broadcast to every device at once, so no one can
   use screen state to tell who's alive, dead, or the impostor.
9. Before starting, the host sets a **meeting spot** — a real place in
   the house (the couch, the kitchen table). Anyone can **call a
   meeting** at any time; every device shows "Everyone return to
   [meeting spot]" plus a synced discussion timer and a vote, and the
   most-voted player is eliminated.
10. A shared **game clock** (20 minutes by default) runs the whole
    match — if it hits zero, the impostors win by default. The
    impostor has a handful of **sabotage** charges that each cut a
    chunk off the clock (with a cooldown between uses, so it can't be
    spammed) — no reactor/O2 stations to physically go stand at, just
    pressure everyone can see ticking down.
11. Four optional roles, toggled by the host before starting: the
    **Judge** can force-eject anyone once during a vote — get it
    wrong and the Judge is ejected instead; the **Guardian Angel**,
    once they've died, can shield one living player from the next
    kill, once; the **Sheriff** can shoot a suspect once at any time
    during play — an innocent guess eliminates the Sheriff instead;
    the **Engineer** can trigger a decoy blackout vent once, to throw
    suspicion around even though they're not the impostor.
12. The game ends when all impostors are caught, the impostors
    outnumber (or equal) the remaining crewmates, every crewmate's
    tasks are done (ghosts keep working their list — an unfinished
    one still blocks the win), or the clock runs out. The end screen
    recaps how many tasks got done and how long the match ran, next
    to the final roles.

## Tech stack

- **Server**: Node + Express + Socket.IO, in-memory game state (no
  database — games are ephemeral and single-house by design).
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
Angel shield blocking a kill, sabotage's charge count/cooldown/clock
drain, and the per-player meeting limit + cooldown. Run it the same
way (`npm run test:pacing`) — it also takes about a minute, for the
same reason.

`scripts/proximity-test.mjs` (`npm run test:proximity`) drives the
audio-handshake kill state machine directly — a correct tone
confirming the kill, a mismatched tone timing out, and a missing mic
falling back to an instant kill — without needing real microphone or
speaker hardware.

`scripts/roles-test.mjs` (`npm run test:roles`) covers custom tasks
getting mixed into the assignment pool, the Engineer's decoy vent
(one-time use, broadcast to everyone), and the Sheriff's shot both
landing on the real impostor and misfiring on an innocent crewmate
(which eliminates the Sheriff instead). It's fast — no long waits.

## Configuration

Host-adjustable in the lobby: tasks per player (3–8), impostor count
(scales with player count), the meeting spot (required to start),
custom tasks, and whether the Judge / Guardian Angel / Sheriff /
Engineer roles are in play. Everything else — meeting timers, the vent
window, kill cooldown, meeting limit/cooldown, game clock length,
sabotage charges/cooldown/penalty, room idle cleanup — lives in
`server/src/constants.ts`.

## MVP scope

Implemented: room creation/join, secret role + unique task assignment
(plus a shared common task, visual-task tagging, and host-defined
custom tasks), kill + blackout vent, a shared game clock with scarce
sabotage charges, meetings with a synced timer and vote, four optional
roles (Judge, Guardian Angel, Sheriff, Engineer), sound + haptic
feedback for the game's key moments, an end-of-game recap (tasks done,
match length, final roles), win conditions, reconnect-on-refresh, and
a PWA manifest so the app can be added to a phone's home screen.

Not implemented yet (see the project spec for the full list): ads,
accounts, themed/preset task packs beyond free-typed custom tasks.
