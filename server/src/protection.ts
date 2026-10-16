import type { Socket } from 'socket.io';
import { reportError } from './monitoring';

/**
 * Abuse protection for the socket server: rate limits, per-IP caps and
 * crash-proof event handlers. None of this changes how a normal game plays;
 * the limits sit far above anything a real player does.
 */

/** A token bucket per key (an IP, a socket id): `capacity` burst, refilled at `perSecond`. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number
  ) {}

  private bucket(key: string) {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.perSecond);
    b.at = now;
    this.buckets.set(key, b);
    return b;
  }

  /** True if `key` still has a token left, without spending it. */
  has(key: string): boolean {
    return this.bucket(key).tokens >= 1;
  }

  /** Spends a token. Returns false (and spends nothing) if there wasn't one. */
  take(key: string): boolean {
    const b = this.bucket(key);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** Drops buckets that have refilled completely, so the map can't grow forever. */
  sweep() {
    const now = Date.now();
    for (const [key, b] of this.buckets) {
      if (b.tokens + ((now - b.at) / 1000) * this.perSecond >= this.capacity) this.buckets.delete(key);
    }
  }
}

/**
 * The real client IP. Render sits behind Cloudflare, which sets
 * cf-connecting-ip / true-client-ip itself (a client can't spoof them through
 * it). Falls back to the first X-Forwarded-For hop, then the raw socket.
 */
export function clientIp(socket: Socket): string {
  const h = socket.handshake.headers;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  return pick(h['cf-connecting-ip']) || pick(h['true-client-ip']) || pick(h['x-forwarded-for']) || socket.handshake.address;
}

/**
 * Local test runs open many rooms from one machine in quick succession, so
 * per-network limits skip loopback outside production. In production the
 * Dockerfile sets NODE_ENV=production and nothing is exempt.
 */
export function isExemptIp(ip: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Events whose last argument must be an acknowledgement callback. */
const ACK_EVENTS = new Set([
  'create_room',
  'join_room',
  'rejoin_room',
  'submit_unscramble',
  'submit_sabotage_number',
  'submit_task_photo',
  'get_task_photos',
]);

/**
 * Every client event goes through here before its handler:
 * - drops it if this socket is flooding (more than a real phone would ever send),
 * - drops it if it should carry an ack callback and doesn't,
 * - turns a missing or non-object payload into `{}`, so handlers that
 *   destructure their payload never see `undefined`.
 */
export function guardEvents(socket: Socket, flood: RateLimiter) {
  socket.use((packet, next) => {
    const [event] = packet;
    if (!flood.take(socket.id)) return;
    if (ACK_EVENTS.has(event) && typeof packet[packet.length - 1] !== 'function') return;
    if (event === 'get_task_photos') {
      // Takes only the callback. Drop anything sent in front of it.
      packet.splice(1, packet.length - 2);
    } else {
      const payload = packet[1];
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        if (typeof payload === 'function') packet.splice(1, 0, {});
        else packet[1] = {};
      }
    }
    next();
  });

  // Last line of defence: a handler that throws on input nobody anticipated
  // logs the error instead of taking down the process (and every game on it).
  const on = socket.on.bind(socket) as (event: string, listener: (...args: unknown[]) => void) => Socket;
  (socket as unknown as { on: typeof on }).on = (event, listener) =>
    on(event, (...args: unknown[]) => {
      const report = (err: unknown) => reportError(`[socket] "${event}" handler threw:`, err, { event });
      try {
        const result = listener(...args) as unknown;
        // Async handlers (the ones that may load a saved room) fail as promises.
        if (result instanceof Promise) result.catch(report);
      } catch (err) {
        report(err);
      }
    });
}

export const isString = (v: unknown): v is string => typeof v === 'string';
