# Pet-Co — High-Concurrency Scalability Audit

> **Auditor:** Principal Cloud Architect  
> **Date:** 2026-06-10  
> **Scope:** 5 high-scale failure vectors — socket exhaustion, rate-limiter isolation, execution timeout, document contention, unbounded memory merges  
> **Target Load:** Thousands of concurrent active users

---

## Table of Contents

1. [Socket Exhaustion & Token Latency in Custom REST Engine](#1-socket-exhaustion--token-latency-in-custom-rest-engine)
2. [Memory Pollution & State Leakage in Rate Limiting](#2-memory-pollution--state-leakage-in-rate-limiting)
3. [Execution Timeout Risks in Cascading Deletions](#3-execution-timeout-risks-in-cascading-deletions)
4. [Document Contention & Hotspotting on Review Aggregations](#4-document-contention--hotspotting-on-review-aggregations)
5. [Unbounded In-Memory Merges in Admin Panel](#5-unbounded-in-memory-merges-in-admin-panel)

---

## 1. Socket Exhaustion & Token Latency in Custom REST Engine

### 1.1 File Inspected

- `src/lib/firestore-admin-rest.ts` (lines 1–216)
- `src/lib/firebase-admin.ts` (lines 1–52)

### 1.2 Architecture

The application deliberately bypasses the Firebase Admin SDK's gRPC transport (which silently fails in sandboxed environments) in favour of raw HTTP REST calls via `fetch()` authenticated by `google-auth-library` OAuth2 tokens. Every exported function follows this pattern:

```typescript
export async function getDocRest(collection: string, docId: string) {
  const token = await getAccessToken();   // ← OAuth2 token fetch
  const url = `${FIRESTORE_BASE}/...`;     // ← URL construction
  const res = await fetch(url, {           // ← HTTP request
    headers: { Authorization: `Bearer ${token}` },
  });
  // ...
}
```

### 1.3 Finding A: No Connection Pooling / Keep-Alive

Every `fetch()` call opens a **new TCP connection** to `firestore.googleapis.com`. Node.js 18+ `fetch` is built on `undici`, which has connection pooling by default, but:

- **No explicit `keepalive: true`** is set on any fetch call. The default undici behaviour in Node.js 18/20 reuses connections within the same `Dispatcher` pool, but the per-function fetch calls don't share a custom dispatcher or agent.
- **On Vercel Edge/Serverless:** Each invocation runs in an isolated container with no HTTP connection reuse across invocations. Every serverless function call does a full TLS handshake.
- **Under load (1,000+ req/s):** Each TLS handshake takes 100–300 ms before the first byte of database operation. With 5 Firestore REST calls per request (common pattern), this adds 0.5–1.5 seconds of TLS overhead before any query executes.

**Projected impact at scale:**

| Concurrent requests | TLS handshakes per second | Firestore REST calls | Latency added |
|---|---|---|---|
| 500 | 2,500 | 2,500 | 250–750 ms |
| 2,000 | 10,000 | 10,000 | 1–3 s |
| 10,000 | 50,000 | 50,000 | Connection pool exhaustion |

### 1.4 Finding B: Token Cache Stampede

The `getAccessToken()` function (lines 20–42) caches the OAuth2 token in a module-level variable:

```typescript
let cachedToken: { value: string; expires: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60000) {
    return cachedToken.value;
  }
  const auth = new GoogleAuth({ credentials: {...}, scopes: [...] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  // ...
}
```

**Problem — No lock on refresh:** When the token expires and 50 concurrent requests all call `getAccessToken()` simultaneously, they all see `Date.now() >= cachedToken.expires - 60000` and ALL 50 initiate a new OAuth2 token fetch. This causes:

1. **Thundering herd** against Google's OAuth2 endpoint
2. **Rate limiting** from Google's token endpoint (default: ~100 req/min)
3. **Serial amplification:** Each token fetch takes 200–500 ms, and 50 concurrent fetches can take down the authentication path

### 1.5 Finding C: Fresh TLS for Each GoogleAuth Client

Each token refresh creates a `new GoogleAuth({...})` instance with fresh credentials. The `google-auth-library` internally performs:

1. Parse the private key (RSA)
2. Create a JWT assertion
3. POST to `https://oauth2.googleapis.com/token`
4. Parse the response

This is CPU-intensive (RSA signing) and network-intensive — doing it 50 times concurrently under token expiry will cause CPU spike and latency degradation.

### 1.6 Remediation

**Fix A — Dedicated HTTP Agent with Keep-Alive:**

```typescript
import { Agent as HttpAgent } from 'undici'; // Node 18+ — or use https.Agent

// -- snip --

// Shared HTTP agent with connection pooling
const FIRESTORE_AGENT = new HttpAgent({
  keepAliveTimeout: 30_000,     // Keep idle connections for 30 s
  keepAliveMaxTimeout: 60_000,
  connections: 256,              // Max concurrent connections per origin
  pipelining: 1,                 // Firestore HTTP/1.1 — no pipelining
});

async function firestoreFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    dispatcher: FIRESTORE_AGENT,  // Reuse the pooled agent
  });
}
```

Then replace every bare `fetch()` call with `firestoreFetch()`.

For serverless environments where connection reuse is impossible (Vercel, Netlify), add a **pre-warm connection** at module init:

```typescript
// Pre-warm — starts TLS handshake at cold start before the first request arrives
const WARM_PROMISE = fetch('https://firestore.googleapis.com/robots.txt')
  .catch(() => { /* best-effort */ });
```

**Fix B — Token Refresh with Mutex:**

```typescript
let tokenRefreshPromise: Promise<string> | null = null;

export async function getAccessToken(): Promise<string> {
  // Fast path: token is fresh
  if (cachedToken && Date.now() < cachedToken.expires - 60000) {
    return cachedToken.value;
  }

  // Mutex path: only one caller fetches; others wait on the same promise
  if (!tokenRefreshPromise) {
    tokenRefreshPromise = refreshToken();
  }

  try {
    const token = await tokenRefreshPromise;
    tokenRefreshPromise = null;
    return token;
  } catch (err) {
    tokenRefreshPromise = null;
    throw err;
  }
}

async function refreshToken(): Promise<string> {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY ?? '')
        .replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  cachedToken = {
    value: token.token ?? '',
    expires: token.res?.data?.expires_in
      ? Date.now() + (token.res.data.expires_in as number) * 1000
      : Date.now() + 3600_000,
  };
  return cachedToken.value;
}
```

This ensures that under token expiry, exactly ONE request fetches the new token and all others wait on the same async promise.

**Fix C — Pre-emptively Refresh at 50% TTL:**

```typescript
export async function getAccessToken(): Promise<string> {
  // Refresh when less than 50% of TTL remains (smooths the transition)
  if (cachedToken && Date.now() < cachedToken.expires - (cachedToken.expires - Date.now()) * 0.5) {
    return cachedToken.value;
  }
  // ...
}
```

---

## 2. Memory Pollution & State Leakage in Rate Limiting

### 2.1 Files Inspected

- `src/middleware.ts` (lines 1–77)
- `src/lib/rate-limit.ts` (lines 1–128)

### 2.2 Finding A: InMemoryStore is Per-Instance

The `InMemoryStore` (rate-limit.ts lines 38–68) stores all rate-limit state in a `Map<string, SlidingEntry>` that lives inside the Node.js process memory.

```typescript
const store: RateLimitStore = new InMemoryStore();
```

**Under multi-instance deployment (Vercel Serverless, Docker swarm, K8s):**

| Instance | Key `rl:default:1.2.3.4` | Count |
|---|---|---|
| Instance A | 75 requests | ✅ Allowed |
| Instance B | 35 requests | ✅ Allowed |
| Instance C | 45 requests | ✅ Allowed |
| **Total** | **155 requests** | ❌ Limit of 100 exceeded |

The rate limit is **effectively non-functional** beyond a single instance. An attacker can send 100 requests per instance and never get a 429.

### 2.3 Finding B: Unbounded Key Retention / Memory Leak

The `increment()` method pushes a timestamp on every call:

```typescript
entry.timestamps.push(now);
return entry.timestamps.length;
```

Under sustained load:

- **1,000 unique IPs × 50 req/min × 15 min window = 750,000 timestamps** stored in memory
- Each timestamp is a `number` (8 bytes) + array overhead (~40 bytes) + Map entry (~80 bytes) ≈ 128 bytes per entry
- **Total: ~96 MB for 750k entries** — problematic but not catastrophic
- **Under bot attack:** 10,000 IPs × 100 req/min = **1.5 billion timestamps** → **> 100 GB** → OOM kill

**No eviction mechanism exists.** The only cleanup is the `filter()` on each `increment()` call, which filters timestamps outside the current window. But if an IP stops sending requests, its entry remains in the Map forever.

### 2.4 Finding C: Sliding-Window Precision vs Memory Trade-off

The current approach stores every individual timestamp to maintain precise sliding-window semantics. This is the most memory-intensive approach possible. A fixed-window counter would use O(1) per key instead of O(n).

### 2.5 Remediation

**Fix A — Redis/Upstash Implementation of RateLimitStore:**

```typescript
// src/lib/rate-limit-redis.ts
import { Redis } from '@upstash/redis';

export class RedisStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  increment(key: string, windowMs: number): number {
    // Use Redis sorted set with microsecond-resolution score for
    // sliding-window precision. EXPIRE auto-cleanup handles eviction.
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Atomic: remove outside window, add current, count, set TTL
    const script = `
      redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
      redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
      local count = redis.call('ZCARD', KEYS[1])
      redis.call('EXPIRE', KEYS[1], math.ceil(tonumber(ARGV[4]) / 1000))
      return count
    `;
    
    return this.redis.eval(
      script,
      [key],                              // KEYS[1]
      [windowStart, now, `${now}:${Math.random()}`, windowMs]  // ARGV
    ) as unknown as number;
  }

  reset(key: string): void {
    this.redis.del(key);
  }

  ttl(key: string): number {
    // Return the score of the oldest entry, or 0 if empty
    const result = this.redis.zrange(key, 0, 0, { withScores: true });
    if (!result || result.length < 2) return 0;
    return result[1] as number;
  }
}
```

**Production switch in rate-limit.ts:**

```typescript
// For Vercel/Upstash (edge-compatible):
import { Redis } from '@upstash/redis';
export const store: RateLimitStore = process.env.UPSTASH_REDIS_URL
  ? new RedisStore(new Redis({ url: process.env.UPSTASH_REDIS_URL, token: process.env.UPSTASH_REDIS_TOKEN }))
  : new InMemoryStore();

// For self-hosted Redis:
// export const store: RateLimitStore = new RedisStore(new Redis(process.env.REDIS_URL!));
```

**Fix B — Fixed-Window InMemoryStore for Single-Instance (Fallback):**

Even for development, the fixed-window approach drastically reduces memory:

```typescript
class FixedWindowMemoryStore implements RateLimitStore {
  private readonly store = new Map<string, { count: number; resetAt: number }>();

  increment(key: string, windowMs: number): number {
    const now = Date.now();
    let entry = this.store.get(key);
    
    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      this.store.set(key, entry);
      return 1;
    }
    
    entry.count++;
    return entry.count;
  }

  reset(key: string): void { this.store.delete(key); }

  ttl(key: string): number {
    const entry = this.store.get(key);
    return entry?.resetAt ?? 0;
  }
}
```

Memory per key: ~24 bytes (1 number + 1 number) vs ~128 bytes + N timestamps. And keys auto-expire when their window passes (next increment resets them). No unbounded growth.

**Fix C — Periodic Eviction for the Current InMemoryStore:**

If sticking with the sliding-window approach, add a periodic eviction sweep:

```typescript
class InMemoryStore implements RateLimitStore {
  private readonly store = new Map<string, SlidingEntry>();
  private lastSweep = Date.now();

  constructor() {
    // Evict stale entries every 60 seconds
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.sweep(), 60_000);
    }
  }

  private sweep() {
    const now = Date.now();
    const maxWindowMs = 15 * 60 * 1000; // Largest window across all tiers
    for (const [key, entry] of this.store.entries()) {
      const oldest = entry.timestamps[0];
      if (!oldest || now - oldest > maxWindowMs * 2) {
        this.store.delete(key);
      }
    }
  }
}
```

---

## 3. Execution Timeout Risks in Cascading Deletions

### 3.1 File Inspected

- `src/app/api/me/account/route.ts` (lines 1–123)

### 3.2 Execution Profile

The handler performs a sequential chain of HTTP requests across 5+ Firestore REST calls. Under realistic data volumes:

| Step | Operation | HTTP Calls | Latency (p95) |
|---|---|---|---|
| 1 | `auth.deleteUser()` | 1 (Firebase Auth REST) | 300–800 ms |
| 2 | `runQueryRest` × 5 | 5 (Firestore `:runQuery`) | 1–5 s |
| 3 | `getDocRest('providers')` | 1 | 200–500 ms |
| 4 | `deleteDocsBatch()` | 1 (Firestore `:commit`) | 500–2000 ms |
| 5 | `deleteDocRest('providers')` | 1 | 200–500 ms |
| 6 | `getDocRest('users')` + `deleteDocRest('users')` | 2 | 400–1000 ms |
| **Total** | | **11 HTTP calls** | **2.6–9.8 s** |

### 3.3 The Serverless Timeout Wall

**Vercel Pro plan:** Serverless functions **time out at 10 seconds** for the Hobby plan, 60 seconds for Pro, 900 seconds for Enterprise.

For a user with:
- 1,000+ historical bookings
- 500+ payments
- 200+ reviews
- 50+ pets

The `runQueryRest` calls (step 2) each return large result sets. Firestore REST `:runQuery` responses for 1,000 documents can be 2–5 MB. Five concurrent queries = 10–25 MB of JSON parsing in a single function invocation. This alone can take 5–10 seconds on Vercel's limited CPU allocation.

### 3.4 The Partial Failure Cascade

If the function hits the 10-second limit halfway through step 4 (`deleteDocsBatch`):
1. Auth user is already deleted (step 1) — can't fail
2. Queries already completed
3. `deleteDocsBatch` partially executed or fully executed
4. Steps 5–6 (`deleteDocRest` for provider + user) never run

**Result:** Provider doc and user doc remain in Firestore with no Auth user to own them. These are **orphaned documents** that must be cleaned up manually.

### 3.5 Remediation

**Fix A — Delegate to Background Queue:**

The only production-grade solution is to decouple the deletion from the HTTP request lifecycle:

```typescript
// POST /api/me/account — returns immediately, queues the actual work
export async function DELETE(request: Request) {
  const decoded = await requireFirebaseUser(request);
  
  // Remove Auth immediately — fast, single operation
  const auth = getAdminAuth();
  await auth.deleteUser(decoded.uid);
  
  // Enqueue async cleanup — the actual heavy work
  await enqueueDeletionJob({ uid: decoded.uid, email: decoded.email });
  
  return NextResponse.json({ 
    accepted: true, 
    message: 'Account deletion started. This may take a few minutes.' 
  });
}
```

**Background queue options:**

| Option | Platform | Runtime |
|---|---|---|
| **Vercel Queues** | Vercel Pro+ | Node.js 18+ |
| **Google Cloud Tasks** | Firebase/GCP | Any |
| **BullMQ + Redis** | Self-hosted | Node.js |
| **SQS + Lambda** | AWS | Any |

Example using **Vercel Queues** (`@vercel/kv` + `@upstash/queue`):

```typescript
import { Client } from '@upstash/queue';

const queue = new Client({
  url: process.env.QSTASH_URL!,
  token: process.env.QSTASH_TOKEN!,
});

async function enqueueDeletionJob(payload: { uid: string; email: string }) {
  // POST to our own API endpoint that runs as a background function
  await queue.enqueue({
    destination: `${process.env.BASE_URL}/api/me/account/cleanup`,
    body: payload,
  });
}
```

**Fix B — Parallelise Query Phase (Partial Mitigation):**

Even without a background queue, the query phase can be optimised:

```typescript
// Current: 5 sequential-ish queries via Promise.all
// Problem: each query loads ALL docs into memory

// Better: Use Firestore aggregation queries (count only) where possible,
// or batch delete by collection without loading into memory first

// Best: Use `firestore-admin` gRPC batch operations that support
// collection group deletions natively (not available via REST)

// Incremental improvement: stream the batch delete in pages
const PAGE_SIZE = 100;

async function deleteAllInCollection(collection: string, field: string, value: string) {
  let token: string | null = null;
  do {
    const { data, nextPageToken } = await queryPaginated(collection, field, value, PAGE_SIZE, token);
    if (data.length > 0) {
      await deleteDocsBatch(data.map(d => ({ collection, docId: d.id })));
    }
    token = nextPageToken;
  } while (token);
}
```

**Fix C — Vercel `maxDuration` Configuration:**

Add a `maxDuration` export to the route file for the 900-second Enterprise limit:

```typescript
// src/app/api/me/account/route.ts
export const maxDuration = 300; // 5 minutes (Vercel Pro+)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

---

## 4. Document Contention & Hotspotting on Review Aggregations

### 4.1 File Inspected

- `src/app/api/reviews/route.ts` (lines 10–87)

### 4.2 The Hotspot Pattern

Every review creation triggers a synchronous read-modify-write on the **provider document**:

```typescript
// Step 1 — Read ALL reviews for the provider
const allReviewsSnap = await db
  .collection('reviews')
  .where('providerId', '==', body.providerId)
  .get();

// Step 2 — Compute aggregates
let totalStars = 0;
allReviewsSnap.forEach((doc) => { totalStars += doc.data().rating || 0; });
providerRating = totalStars / allReviewsSnap.size;

// Step 3 — Write to the single provider document
await db.collection('providers').doc(body.providerId).update({
  rating: providerRating,
  reviews: providerReviews,
});
```

### 4.3 The Firestore Write Limit

Firestore enforces a **maximum of 1 write per second on any individual document** (the "1-write-per-second-per-doc" limit). For a popular provider receiving 5+ concurrent reviews:

```
Time  Request A                    Request B                    Request C
 │    Read: all reviews (count:200, sum:850 → avg 4.3)
 │    (network latency)
 │                                Read: all reviews (count:200, sum:850 → avg 4.3)
 │    Write: rating=4.3, reviews=201 ✅
 │                                (still computing from stale data)
 │                                                              Read: all reviews (count:201, sum:854 → avg 4.25)
 │                                Write: rating=4.3, reviews=201 ❌ CONTENTION
 │                                                              Write: rating=4.25, reviews=202 ✅
 │    (A writes, B writes based  →  B's stale read overwrites A's value)
 │    on pre-A data)
 ▼
                    FINAL: rating=4.25, reviews=202
                    (Should be: rating ≈ weighted average of all 202, reviews=202)
                    → LOST UPDATE (A's rating contribution was overwritten)
```

Additionally, the `get()` call loading ALL reviews for the provider has **quadratic complexity**: a provider with 10,000 reviews loads 10,000 documents into the function's memory, every time a single review is posted.

### 4.4 Remediation

**Fix A — Distributed Counter with Firestore Transactions:**

Replace the synchronous read-all-then-write with an **increment-only transaction** on the provider document:

```typescript
// Client-side — just save the review
const ref = await db.collection('reviews').add(review);

// Increment aggregates atomically with a transaction
try {
  await db.runTransaction(async (transaction) => {
    const providerRef = db.collection('providers').doc(body.providerId);
    const providerDoc = await transaction.get(providerRef);
    
    if (!providerDoc.exists) return;
    
    const currentRating = providerDoc.data()?.rating || 0;
    const currentReviews = providerDoc.data()?.reviews || 0;
    
    // Running average: new_avg = (old_avg * old_count + new_rating) / (old_count + 1)
    const newTotal = currentRating * currentReviews + body.rating;
    const newCount = currentReviews + 1;
    const newAvg = parseFloat((newTotal / newCount).toFixed(1));
    
    transaction.update(providerRef, {
      rating: newAvg,
      reviews: newCount,
    });
  });
} catch (err) {
  // Transaction retries on contention automatically (up to 5 times)
  if (process.env.NODE_ENV === 'development') {
    console.error('Failed to sync provider aggregates:', err);
  }
}
```

This reduces per-request reads from "all reviews" (potentially thousands) to "just the provider document" (1 doc). The transaction handles concurrent writes — if multiple requests hit the same provider document simultaneously, Firestore retries the failed transactions automatically.

**Fix B — Deferred Aggregation with Firestore Cloud Function (True Scale):**

For providers with thousands of reviews, even the transaction approach has a single-document hotspot. The gold standard is **eventual consistency via a Cloud Function**:

```typescript
// firebase-cloud-functions/review-aggregator/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onReviewWritten = functions.firestore
  .document('reviews/{reviewId}')
  .onWrite(async (change, context) => {
    const providerId = (change.after?.data()?.providerId || change.before?.data()?.providerId) as string;
    
    // Recalculate from all reviews (runs async, not in request path)
    const reviewsSnap = await admin.firestore()
      .collection('reviews')
      .where('providerId', '==', providerId)
      .get();
    
    let totalStars = 0;
    reviewsSnap.forEach(doc => { totalStars += doc.data().rating || 0; });
    const count = reviewsSnap.size;
    const avg = count > 0 ? parseFloat((totalStars / count).toFixed(1)) : 0;
    
    await admin.firestore()
      .collection('providers')
      .doc(providerId)
      .update({ rating: avg, reviews: count });
  });
```

With this approach, the API route just writes the review and returns immediately. The Cloud Function handles aggregation asynchronously. The provider document is still a hotspot, but it's no longer in the critical path of the API response.

**Fix C — Immediate Mitigation: Cap Full-Review Reads:**

While implementing transactions, at minimum add a safety cap to prevent OOM:

```typescript
// Review read is paginated with a hard cap
const MAX_REVIEWS_READ = 1000;
const cappedSnap = await db.collection('reviews')
  .where('providerId', '==', body.providerId)
  .limit(MAX_REVIEWS_READ)
  .get();
```

---

## 5. Unbounded In-Memory Merges in Admin Panel

### 5.1 Files Inspected

- `src/app/admin/page.tsx` (lines 1–190+)
- `src/lib/firestore-rest.ts` — `getAllUsersRest()` (line 1317), `fetchCollection()` (line 324)

### 5.2 The Unbounded Load Pattern

The admin panel's user list is constructed by:

1. Calling `getAllUsersRest()` which calls **`fetchCollection('users')`** — an UN-paginated REST list of the entire `users` collection
2. Merging with `localAuth.getAllUsers()` (all localStorage users)
3. Deduplicating by ID in a `Map<string, AppUser>`
4. Rendering the full list in-memory

```typescript
// admin/page.tsx lines 162–187
const [firestoreUsers] = await Promise.all([getAllUsersRest()]);
const localOnlyUsers = localAuth.getAllUsers();
const combined = [...firestoreUsers, ...localOnlyUsers];
// ... entire array in memory, deduplicated ...
setAllUsers(Array.from(uniqueUsersMap.values()));
```

**The `fetchCollection('users')` call at line 324:**

```typescript
async function fetchCollection<T>(collection: string, ...) {
  const res = await authGet(docUrl(collection));  // ← NO pageSize
  const json = await res.json();
  let docs = (json.documents || []).map(...);     // ← ALL documents in one response
  // ...
}
```

### 5.3 Failure at Scale

| Registered users | Document count | Response size | Memory per response |
|---|---|---|---|
| 1,000 | ~1,000 | ~2 MB | ~4 MB (parsed JS objects) |
| 10,000 | ~10,000 | ~20 MB | ~40 MB |
| 100,000 | ~100,000 | ~200 MB | >400 MB → **OOM** |

Firestore REST `documents` list endpoint has a **default page size of ~300 documents** and a **maximum of 1 MB per response**. Beyond 300 documents, the API returns a `nextPageToken` which `fetchCollection` **completely ignores** — it only reads the first page!

So `getAllUsersRest()` actually returns at most ~300 users (one page), not all users. This is a **silent data loss bug**: the admin panel shows an incomplete user list without indicating truncation.

### 5.4 The localAuth Amplifier

Even though `localAuth.getAllUsers()` returns `[]` in production (after our previous fix), in development/preview it returns ALL users from localStorage. If an admin has been testing with hundreds of users, this doubles the in-memory merge overhead.

### 5.5 Remediation

**Fix A — Paginated User Fetch (Backend):**

Replace `getAllUsersRest()` with a cursor-based paginated version:

```typescript
// src/lib/firestore-rest.ts

export async function getUsersPaginated(
  pageSize = 50,
  pageToken?: string | null,
): Promise<PaginatedResult<UserDoc>> {
  return fetchPaginatedCollection('users', pageSize, pageToken, mapUserDoc);
}

// Keep getAllUsersRest but WITH full pagination (handle nextPageToken loop)
export async function getAllUsersRest(): Promise<UserDoc[]> {
  const all: UserDoc[] = [];
  let token: string | null = null;
  const PAGE_SIZE = 300; // Max Firestore page size

  do {
    const { data, nextPageToken } = await getUsersPaginated(PAGE_SIZE, token);
    all.push(...data);
    token = nextPageToken;
  } while (token);

  return all;
}
```

**Fix B — Admin Panel: Server-Side Paginated API:**

Create a dedicated admin API endpoint that streams paginated results:

```typescript
// src/app/api/admin/users/route.ts
export async function GET(request: Request) {
  const decoded = await requireAdmin(request);
  const { searchParams } = new URL(request.url);
  const pageToken = searchParams.get('pageToken');
  const pageSize = Math.min(Number(searchParams.get('pageSize')) || 50, 200);
  
  const { data, nextPageToken } = await getUsersPaginated(pageSize, pageToken);
  
  return NextResponse.json({ users: data, nextPageToken });
}
```

Then in `admin/page.tsx`, fetch users via this API on scroll/pagination events.

**Fix C — Admin Panel: Immediate Client-Side Band-Aid:**

Until the backend pagination is complete, add a hard cap to the client:

```typescript
// admin/page.tsx — minimal fix for the immediate pagination gap
const [firestoreUsers] = await Promise.all([getAllUsersRest()]);

// Guard: if the response was truncated (full page returned), show a warning
const PAGE_SIZE_ESTIMATE = 300;
if (firestoreUsers.length >= PAGE_SIZE_ESTIMATE && !firestoreUsers.includes('...')) {
  console.warn('Admin: user list may be truncated by Firestore page limit');
  // TODO: implement full pagination — see SCALABILITY-AUDIT.md §5.5
}
```

**Fix D — Paginated Tables for ALL Admin Tabs:**

The same unbounded pattern affects `getAllBookingsRest()` (line 924), `getAllPaymentsRest()` (line 1033), `getAllProvidersRest()` (line 527), and `getAllReviewsRest()` (line 620) which are used for **analytics calculations** (KPI cards, charts). These also silently truncate to 300 documents:

| Function | Used for | Impact |
|---|---|---|
| `getAllBookingsRest()` | Analytics KPI: Revenue MTD, booking charts | Silent undercount |
| `getAllPaymentsRest()` | Analytics KPI: Platform fees, financial chart | Silent undercount |
| `getAllProvidersRest()` | Provider list + Admin KPI: Active providers | Silent undercount |
| `getAllReviewsRest()` | Analytics: average rating, review distribution | Silent undercount |

**Fix for analytics:** Replace full-collection fetches with **Firestore aggregation queries** or **Cloud Functions** that pre-compute analytics:

```typescript
// src/app/api/admin/analytics/route.ts (new)
export async function GET(request: Request) {
  await requireAdmin(request);
  
  // Use Firestore aggregation queries (count, sum) — no document reading
  const [userCount, bookingStats, paymentStats] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('bookings').aggregate({
      totalRevenue: AggregateField.sum('total'),
      activeBookings: AggregateField.count(),
    }).get(),
    db.collection('payments').aggregate({
      totalFees: AggregateField.sum('platformFee'),
      monthlyRevenue: AggregateField.sum('total'),
    }).get(),
  ]);
  
  return NextResponse.json({
    totalUsers: userCount.data().count,
    // ...
  });
}
```

---

## Summary & Priority Remediation Plan

### Critical (P0 — Blocks scaling entirely)

| # | Finding | Vector | Effort |
|---|---|---|---|
| 1 | **OAuth2 token thundering herd** — 50 concurrent refreshes on expiry | `firestore-admin-rest.ts:getAccessToken()` | Low — add mutex on refresh |
| 2 | **InMemoryRateLimiter per-instance isolation** — rate limits are cross-instance blind | `rate-limit.ts:store` | Medium — implement `RedisStore` + swap singleton |
| 3 | **Unpaginated analytics reads** — all analytics silently truncate at ~300 docs | `firestore-rest.ts:fetchCollection` | Medium — replace with aggregation queries |

### High (P1 — Will fail at moderate scale)

| # | Finding | Vector | Effort |
|---|---|---|---|
| 4 | **No connection pooling** — fresh TCP/TLS per fetch call | `firestore-admin-rest.ts:fetch()` | Low — shared `undici.Agent` with `keepalive` |
| 5 | **Serverless timeout in cascading deletion** — ~10 s for 1,000 docs | `account/route.ts:DELETE` | High — delegate to background queue |
| 6 | **Provider document write hotspot** — 1 write/s limit on rating aggregation | `reviews/route.ts:POST` | Medium — Firestore transactions + deferred Cloud Function |
| 7 | **InMemoryStore unbounded key growth** — no eviction under bot attack | `rate-limit.ts:InMemoryStore` | Low — periodic sweep + fixed-window fallback |

### Medium (P2 — Needs addressing before GA)

| # | Finding | Vector | Effort |
|---|---|---|---|
| 8 | **Admin user list truncation** — silently shows only 300 users | `admin/page.tsx` + `fetchCollection` | Medium — server-side paginated API |
| 9 | **Review aggregation reads all reviews** — O(n) per write | `reviews/route.ts:POST` | Low — running average via transaction |
| 10 | **Token refresh pre-emptive scheduling** | `firestore-admin-rest.ts` | Low — 50% TTL threshold |

### Quick-Win Implementation Order

```
Week 1 (P0 — unblock scaling):
  ├── OAuth2 mutex (firestore-admin-rest.ts)          → 30 min
  ├── InMemoryStore eviction sweep + fixed-window     → 1 hr
  └── Analytics aggregation queries (admin API)       → 3 hr

Week 2 (P1 — prevent failures at 1k+ concurrent):
  ├── Redis/Upstash RateLimitStore                    → 4 hr
  ├── Review aggregation transaction                  → 2 hr
  ├── Connection pooling with undici Agent            → 1 hr
  └── Admin paginated user API                        → 4 hr

Week 3 (P1+P2 — production hardening):
  ├── Deferred deletion via background queue          → 8 hr
  ├── Cloud Function for review aggregation           → 6 hr
  └── Pre-emptive OAuth2 refresh at 50% TTL           → 30 min
```

---

*Report generated from commit `d6e74f2`. All code references are line-accurate as of the audit date.*
