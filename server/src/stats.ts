import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { createClient } from 'redis';

/**
 * Privacy-friendly visitor and game stats, viewable at /stats?key=STATS_KEY.
 *
 * Counts are kept per day. With REDIS_URL set they survive restarts (and are
 * kept for about a year); without it they live in memory until the next
 * deploy. No IP addresses or names are stored: a unique visitor is a one-way
 * hash of the day, IP and browser, fed into a HyperLogLog counter, so the
 * same person on two different days can't even be linked.
 */

export const METRICS = {
  visits: 'Page views',
  instagram: 'From Instagram',
  invites: 'Invite links opened',
  rooms: 'Rooms created',
  joins: 'Players joined',
  games: 'Games started',
  gamePlayers: 'Players in games',
  finished: 'Games finished',
} as const;
export type Metric = keyof typeof METRICS;

const KEEP_DAYS = 400;
const TIME_ZONE = process.env.STATS_TZ || 'UTC';
const SALT = process.env.STATS_KEY || 'irl-imposter';

/** Link previews, crawlers and our own headless tests aren't visitors. */
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|twitter|headless|curl|wget|python|go-http/i;

type Redis = ReturnType<typeof createClient>;
let redis: Redis | null = null;
const memCounts = new Map<string, Map<Metric, number>>();
const memVisitors = new Map<string, Set<string>>();

export async function initStats() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const client = createClient({ url, socket: { reconnectStrategy: (n) => Math.min(n * 200, 5000) } });
  client.on('error', (err) => console.error('[stats] redis error:', err.message));
  try {
    await client.connect();
    redis = client;
  } catch {
    // Stats just stay in memory if Redis can't be reached.
  }
}

function dayKey(date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
}

export function count(metric: Metric, by = 1) {
  const day = dayKey();
  if (redis) {
    const key = `irl:stats:${day}`;
    redis
      .multi()
      .hIncrBy(key, metric, by)
      .expire(key, KEEP_DAYS * 86400)
      .exec()
      .catch(() => {});
    return;
  }
  const counts = memCounts.get(day) ?? new Map<Metric, number>();
  counts.set(metric, (counts.get(metric) ?? 0) + by);
  memCounts.set(day, counts);
}

function countVisitor(fingerprint: string) {
  const day = dayKey();
  const hash = createHash('sha256').update(`${day}|${fingerprint}|${SALT}`).digest('hex').slice(0, 24);
  if (redis) {
    const key = `irl:visitors:${day}`;
    redis
      .multi()
      .pfAdd(key, hash)
      .expire(key, KEEP_DAYS * 86400)
      .exec()
      .catch(() => {});
    return;
  }
  const set = memVisitors.get(day) ?? new Set<string>();
  set.add(hash);
  memVisitors.set(day, set);
}

/** Called when someone opens the site (the page itself, not its assets). */
export function countVisit(req: Request, ip: string) {
  const ua = req.get('user-agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return;
  count('visits');
  countVisitor(`${ip}|${ua}`);
  const referrer = req.get('referer') ?? '';
  const source = typeof req.query.utm_source === 'string' ? req.query.utm_source : '';
  if (/instagram/i.test(ua) || /instagram\.com/i.test(referrer) || /^(ig|instagram)$/i.test(source)) count('instagram');
  if (typeof req.query.code === 'string') count('invites');
}

export interface DayStats {
  day: string;
  visitors: number;
  counts: Record<Metric, number>;
}

/** The last `days` days, newest first. */
export async function readStats(days: number): Promise<DayStats[]> {
  const out: DayStats[] = [];
  for (let i = 0; i < days; i++) {
    const day = dayKey(new Date(Date.now() - i * 86400_000));
    const counts = Object.fromEntries(Object.keys(METRICS).map((m) => [m, 0])) as Record<Metric, number>;
    let visitors = 0;
    if (redis) {
      const [raw, uv] = await Promise.all([redis.hGetAll(`irl:stats:${day}`), redis.pfCount(`irl:visitors:${day}`)]);
      for (const [k, v] of Object.entries(raw)) if (k in counts) counts[k as Metric] = Number(v);
      visitors = uv;
    } else {
      for (const [k, v] of memCounts.get(day) ?? []) counts[k] = v;
      visitors = memVisitors.get(day)?.size ?? 0;
    }
    out.push({ day, visitors, counts });
  }
  return out;
}

/** Constant-time check of the dashboard key. */
export function statsKeyMatches(given: unknown): boolean {
  const expected = process.env.STATS_KEY;
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const statsStorage = () => (redis ? 'Redis (kept across deploys)' : 'memory (resets on each deploy)');
export const statsTimeZone = TIME_ZONE;
