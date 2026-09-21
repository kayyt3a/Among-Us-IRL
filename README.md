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
   fake task list.
5. Tasks are completed on the honor system — just tap "Done".
6. The impostor eliminates nearby players by tapping **Eliminate** and
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
7. After a kill, the impostor has a short window to trigger **Vent** — a
   full-screen blackout broadcast to every device at once, so no one can
   use screen state to tell who's alive, dead, or the impostor.
8. Anyone can **call a meeting** at any time. It syncs a discussion timer
   and a vote across every device; the most-voted player is eliminated.
9. The game ends when all impostors are caught, or the impostors
   outnumber (or equal) the remaining crewmates, or crewmates finish
   every task.

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

## Configuration

Host-adjustable in the lobby: tasks per player (3–8) and impostor count
(scales with player count). Everything else — meeting timers, the vent
window, room idle cleanup — lives in `server/src/constants.ts`.

## MVP scope

Implemented: room creation/join, secret role + unique task assignment,
task pools for 6 room types, kill + blackout vent, meetings with a
synced timer and vote, win conditions, reconnect-on-refresh, and a PWA
manifest so the app can be added to a phone's home screen.

Not implemented yet (see the project spec for the full list): ads,
accounts, custom/host-defined task packs, themed task packs.
