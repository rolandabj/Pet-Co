/**
 * Modular sliding-window rate limiter for Next.js API routes.
 *
 * Architecture:
 *   RateLimitStore  ←  InMemoryStore (dev/prelaunch)
 *                   ←  RedisStore     (production — implement the same interface)
 *
 * The store is a singleton — swap the implementation at the import site
 * when migrating to Redis; no other code changes are needed.
 *
 * ⚠️  InMemoryStore resets on server restart and does NOT share state
 * across serverless instances. Suitable for single-instance deployments
 * or coarse defense-in-depth.
 */

// ── Store interface (swap-able) ───────────────────────────────────

export interface RateLimitStore {
  /** Increment the counter for `key` within a sliding window.
   *  Returns the current count after incrementing.
   *  `windowMs` is the sliding-window duration in milliseconds. */
  increment(key: string, windowMs: number): number;

  /** Reset the counter for `key`. */
  reset(key: string): void;

  /** Return the time (epoch ms) when the entry for `key` expires, or 0. */
  ttl(key: string): number;
}

// ── In-memory implementation ──────────────────────────────────────

interface SlidingEntry {
  /** Array of request timestamps (epoch ms) inside the current window. */
  timestamps: number[];
}

class InMemoryStore implements RateLimitStore {
  private readonly store = new Map<string, SlidingEntry>();

  increment(key: string, windowMs: number): number {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Prune timestamps outside the sliding window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    entry.timestamps.push(now);
    return entry.timestamps.length;
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  ttl(key: string): number {
    const entry = this.store.get(key);
    if (!entry || entry.timestamps.length === 0) return 0;
    // The window expires `windowMs` after the oldest timestamp
    return entry.timestamps[0];
  }
}

/** Singleton store — swap implementation here when adding Redis. */
export const store: RateLimitStore = new InMemoryStore();

// ── Limit descriptor ──────────────────────────────────────────────

export interface RateLimitOpts {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (informational — best-effort). */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
}

/**
 * Check whether `key` has exceeded the given rate-limit window.
 *
 * Example:
 *   const result = checkRateLimit(clientIp(request), { windowMs: 15*60*1000, maxRequests: 100 });
 *   if (!result.allowed) return Response.json({ error: '...' }, { status: 429 });
 */
export function checkRateLimit(key: string, opts: RateLimitOpts): RateLimitResult {
  const count = store.increment(key, opts.windowMs);
  return {
    allowed: count <= opts.maxRequests,
    remaining: Math.max(0, opts.maxRequests - count),
    resetAt: store.ttl(key) + opts.windowMs,
  };
}

/**
 * Extract a client identifier from a Request object.
 * Prefers x-forwarded-for, falls back to x-real-ip, then a constant.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown-client';
}

/**
 * Build a rate-limit key that combines a namespace, the client IP,
 * and optionally the authenticated user ID for more granular tracking.
 *
 *   makeKey('api', ip)           → "rl:api:1.2.3.4"
 *   makeKey('auth', ip, uid)     → "rl:auth:1.2.3.4:uid_abc"
 */
export function makeKey(namespace: string, ip: string, userId?: string): string {
  return userId
    ? `rl:${namespace}:${ip}:${userId}`
    : `rl:${namespace}:${ip}`;
}
