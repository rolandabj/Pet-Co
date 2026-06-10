/**
 * Next.js Middleware — API Rate Limiting
 *
 * Applies sliding-window rate limits to all `/api/*` routes with
 * per-path tiers.  When the limit is exceeded the client receives
 * a clean HTTP 429 JSON response.
 *
 * Tiers (configurable via `LIMITS` below):
 *   default  – 100 req / 15 min    (GET reads, general access)
 *   strict   –  10 req / 15 min    (auth, account deletion)
 *   moderate –  30 req / 15 min    (mutations: bookings, reviews, pets, favourites)
 *
 * ═══════════════════════════════════════════════════════════════════
 * Store portability  (swap the store implementation with zero
 *                     middleware changes):
 *
 *   src/lib/rate-limit.ts  exports `store: RateLimitStore`
 *   └─ InMemoryStore  ←  works now (single-instance dev/pre-launch)
 *   └─ RedisStore     ←  implement the RateLimitStore interface
 *                         using `ioredis` and swap the import
 *
 * ═══════════════════════════════════════════════════════════════════
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, clientIp, makeKey } from '@/lib/rate-limit';

// ── Rate-limit tiers ──────────────────────────────────────────────

interface Tier {
  windowMs: number;
  maxRequests: number;
}

const LIMITS: Record<string, Tier> = {
  // ── Strict: sensitive / auth endpoints ───────────────────────
  strict: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  // ── Moderate: mutating endpoints ─────────────────────────────
  moderate: { windowMs: 15 * 60 * 1000, maxRequests: 30 },
  // ── Default: read-only access ────────────────────────────────
  default: { windowMs: 15 * 60 * 1000, maxRequests: 100 },
};

/**
 * Map a request method + pathname to a rate-limit tier key.
 * Returns `false` if the route is excluded from rate limiting.
 */
function resolveTier(method: string, pathname: string): string | false {
  // ── Strict tier ─────────────────────────────────────────────
  if (
    pathname.startsWith('/api/auth/delete-user')
  ) {
    return 'strict';
  }

  // ── Moderate tier ───────────────────────────────────────────
  if (
    /^\/api\/(bookings|reviews|messages|payments|me\/pets|me\/favorites|me\/account|admin\/payments\/batch-fee-collect)/.test(pathname) &&
    method !== 'GET'
  ) {
    return 'moderate';
  }

  // ── Default tier: all remaining /api routes ─────────────────
  if (pathname.startsWith('/api/')) {
    return 'default';
  }

  // Excluded (non-API routes pass through)
  return false;
}

// ── middleware ────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const method = request.method;
  const { pathname } = request.nextUrl;

  const tierKey = resolveTier(method, pathname);
  if (tierKey === false) {
    return NextResponse.next();
  }

  const tier = LIMITS[tierKey];
  const ip = clientIp(request);
  const rl = checkRateLimit(makeKey(`mw:${tierKey}`, ip), tier);

  // ── Rate-limit exceeded ─────────────────────────────────────
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(tier.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        },
      },
    );
  }

  // ── Under limit — attach informational headers ──────────────
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(tier.maxRequests));
  response.headers.set('X-RateLimit-Remaining', String(rl.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  return response;
}

// ── Matcher: only run on API routes ───────────────────────────────
export const config = {
  matcher: '/api/:path*',
};
