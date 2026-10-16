import { createClient } from 'redis';
import { GameRoom } from './gameRoom';
import type { GameRoomState, ServerMeeting, ServerPlayer } from './internalTypes';

/**
 * Saves rooms to Redis so a deploy or restart doesn't end every game in
 * progress. Turned on by setting REDIS_URL (Upstash's "rediss://..." URL works
 * as is). Without it the server keeps rooms in memory only, exactly as before.
 *
 * Rooms are saved a few seconds after they change and once more on shutdown.
 * A room is loaded back lazily, the first time someone asks for its code, so
 * a new server that starts up while the old one is still draining picks up
 * the old one's final save rather than a stale one.
 *
 * Task photos are deliberately not saved: they can add up to megabytes per
 * room, and losing them on a restart only affects the end-of-game gallery.
 */

const KEY_PREFIX = 'irl:room:';
/** A saved room expires if nothing touches it for this long, same as the idle sweep. */
const SAVED_ROOM_TTL_SECONDS = 6 * 60 * 60;

type Snapshot = Omit<GameRoomState, 'players' | 'wins' | 'taskPhotos' | 'meeting' | 'meetingTimer'> & {
  players: ServerPlayer[];
  wins: [string, number][];
  meeting: (Omit<ServerMeeting, 'votes'> & { votes: [string, string][] }) | null;
};

export function toSnapshot(state: GameRoomState): string {
  const { players, wins, taskPhotos: _photos, meeting, meetingTimer: _timer, ...rest } = state;
  const snapshot: Snapshot = {
    ...rest,
    players: Array.from(players.values()),
    wins: Array.from(wins.entries()),
    meeting: meeting ? { ...meeting, votes: Array.from(meeting.votes.entries()) } : null,
  };
  return JSON.stringify(snapshot);
}

export function fromSnapshot(json: string): GameRoom {
  const snap = JSON.parse(json) as Snapshot;
  const room = new GameRoom(snap.code);
  const { players, wins, meeting, ...rest } = snap;
  // Start from a fresh room's defaults so a snapshot saved by an older version
  // of the server still gets any fields added since.
  Object.assign(room.state, rest);
  room.state.players = new Map(
    players.map((p) => [
      p.id,
      // Nobody is connected to this new process yet; phones reconnect and rejoin.
      { ...p, socketId: null, connected: false, bodyFound: p.bodyFound ?? false, reportBlockedUntil: p.reportBlockedUntil ?? 0 },
    ])
  );
  room.state.wins = new Map(wins);
  room.state.meeting = meeting ? { ...meeting, votes: new Map(meeting.votes), bodyId: meeting.bodyId ?? null } : null;
  room.state.taskPhotos = new Map();
  room.state.meetingTimer = null;
  // Saved before there was more than one kind of sabotage.
  const puzzle = room.state.sabotagePuzzle as { kind?: string } | null;
  if (puzzle && !puzzle.kind) puzzle.kind = 'words';
  // An in-flight kill check can't survive a restart (its timer and the
  // listening phone are gone), so it's dropped and the impostor can try again.
  room.state.pendingKill = null;
  return room;
}

export interface RoomStore {
  save(code: string, json: string): Promise<void>;
  load(code: string): Promise<string | null>;
  remove(code: string): Promise<void>;
  exists(code: string): Promise<boolean>;
  close(): Promise<void>;
}

class RedisStore implements RoomStore {
  private client: ReturnType<typeof createClient>;

  constructor(url: string) {
    this.client = createClient({ url, socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) } });
    this.client.on('error', (err) => console.error('[persistence] redis error:', err.message));
  }

  connect() {
    return this.client.connect();
  }

  async save(code: string, json: string) {
    await this.client.set(KEY_PREFIX + code, json, { EX: SAVED_ROOM_TTL_SECONDS });
  }

  async load(code: string) {
    return this.client.get(KEY_PREFIX + code);
  }

  async remove(code: string) {
    await this.client.del(KEY_PREFIX + code);
  }

  async exists(code: string) {
    return (await this.client.exists(KEY_PREFIX + code)) > 0;
  }

  async close() {
    await this.client.quit();
  }
}

/** The configured store, or null when REDIS_URL isn't set (memory only). */
export async function openRoomStore(): Promise<RoomStore | null> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('[persistence] REDIS_URL not set: games live in memory only and end on restart.');
    return null;
  }
  const store = new RedisStore(url);
  try {
    await store.connect();
    console.log('[persistence] saving games to Redis.');
    return store;
  } catch (err) {
    console.error('[persistence] could not reach Redis, running memory only:', (err as Error).message);
    return null;
  }
}

/**
 * Remembers what was last written for each room, so the periodic flush only
 * writes rooms that actually changed.
 */
export class RoomSaver {
  private lastSaved = new Map<string, string>();

  constructor(private store: RoomStore) {}

  /** Writes every room whose state changed since its last save. */
  async flush(rooms: Map<string, GameRoom>) {
    const writes: Promise<void>[] = [];
    for (const [code, room] of rooms) {
      const json = toSnapshot(room.state);
      if (this.lastSaved.get(code) === json) continue;
      this.lastSaved.set(code, json);
      writes.push(
        this.store.save(code, json).catch((err) => {
          this.lastSaved.delete(code); // try again next flush
          console.error(`[persistence] saving ${code} failed:`, err.message);
        })
      );
    }
    await Promise.all(writes);
  }

  async load(code: string): Promise<GameRoom | null> {
    try {
      const json = await this.store.load(code);
      if (!json) return null;
      this.lastSaved.set(code, json);
      return fromSnapshot(json);
    } catch (err) {
      console.error(`[persistence] loading ${code} failed:`, (err as Error).message);
      return null;
    }
  }

  async exists(code: string): Promise<boolean> {
    try {
      return await this.store.exists(code);
    } catch {
      return false;
    }
  }

  async remove(code: string) {
    this.lastSaved.delete(code);
    await this.store.remove(code).catch(() => {});
  }
}
