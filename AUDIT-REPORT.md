# Pet-Co — Targeted Security Audit Report

> **Auditor:** Senior Application Security Engineer  
> **Date:** 2026-06-10  
> **Scope:** 5 high-risk areas — path traversal & error leakage, TOCTOU booking race, localAuth production isolation, cascading deletion partial failures, Content-Length bypass  
> **Codebase:** `main` (commit `d6e74f2`)

---

## Table of Contents

1. [Finding 1 — REST Client Path Traversal & Error Leakage](#1-custom-rest-client-path-traversal--error-leakage)
2. [Finding 2 — Atomic Booking Race Condition (TOCTOU)](#2-atomic-booking-race-condition-toctou)
3. [Finding 3 — LocalAuth Dev Fallback Production Isolation](#3-isolation-of-localauth-dev-fallback)
4. [Finding 4 — Partial Failure States in Cascading Deletion](#4-partial-failure-states-in-cascading-deletion)
5. [Finding 5 — Content-Length Header Bypass in checkBodySize](#5-content-length-header-bypassing-checkbodysize)

---

## 1. Custom REST Client Path Traversal & Error Leakage

### 1.1 Files Inspected

- `src/lib/firestore-admin-rest.ts` (server-side, OAuth2-authenticated)
- `src/lib/firestore-rest.ts` (client-side, Firebase ID token + API key)

### 1.2 Server-Side (`firestore-admin-rest.ts`) — ✅ Clean

All dynamic URL construction uses `encodeURIComponent()` on both `collection` and `docId`:

```typescript
// Line 48 — deleteDocRest
const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;

// Line 65 — getDocRest
const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;

// Line 144 — updateDocRest
const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?${params.toString()}`;
```

`encodeURIComponent` encodes `/` as `%2F`, `..` remains as `..` but since the preceding path segments are well-formed and the result is a single path segment, path traversal sequences like `../../users/abc` become a literal document ID of `..%2F..%2Fusers%2Fabc` in Firestore — they cannot traverse up the URL path. **No path traversal is possible.**

The `collection` parameter is never user-controlled — all callers pass hardcoded string literals (`'bookings'`, `'users'`, `'pets'`, `'providers'`, etc.):

| Caller | Collection | Source |
|---|---|---|
| `DELETE /api/me/account` | `'bookings'`, `'payments'`, `'reviews'`, `'favorites'`, `'pets'`, `'providers'`, `'users'` | Hardcoded literal |
| `POST /api/payments` PATCH | `'payments'` | Hardcoded literal |
| `GET /api/admin/users/[userId]/details` | `'users'`, `'pets'`, `'bookings'`, `'payments'`, `'reviews'` | Hardcoded literal |

**Error leakage** — the thrown errors include the collection name, docId, and Firestore response body:

```typescript
// Line 56
throw new Error(`DELETE ${collection}/${docId} failed: ${res.status} ${body}`);
// Line 72
throw new Error(`GET ${collection}/${docId} failed: ${res.status} ${body}`);
// Line 166
throw new Error(`PATCH ${collection}/${docId} failed: ${res.status} ${body}`);
```

This is **mitigated by design**: every caller wraps these calls in try/catch blocks that return generic error messages (`'An internal server error occurred.'`). The detailed errors are only logged server-side when `NODE_ENV === 'development'`. In production, no Firestore path or response body reaches the client. ✅

### 1.3 Client-Side (`firestore-rest.ts`) — ⚠️ Missing encodeURIComponent

The `docUrl()` helper at line 290 does **not** use `encodeURIComponent`:

```typescript
function docUrl(collection: string, docId?: string) {
  const base = `${FIRESTORE_BASE}/${collection}`;
  return docId ? `${base}/${docId}` : base;
}
```

**Risk analysis:** The `collection` parameter is always a hardcoded string literal in every caller (e.g., `docUrl('pets')`, `docUrl('bookings', bookingId)`). The `docId` parameter comes from Firestore document IDs that were returned by previous server queries — these are alphanumeric Firestore auto-IDs or user UIDs, none of which can contain path-traversal sequences.

**However**, if a document ID were manually crafted (via the Firebase Console or a direct API call) to contain `../../`, it would traverse the URL path in `firestore-rest.ts`. For example, if a document ID were `../../users/admin`, the URL would become `.../documents/pets/../../users/admin` → resolved by the HTTP client to `.../documents/users/admin`.

**Exploitability:** Low. Firestore document IDs are controlled by the server (auto-generated) or must pass the `users/{userId}` security rule which checks `request.auth.uid == userId`. An attacker cannot create a document with an arbitrary path-traversal ID without already having elevated privileges.

**Recommendation:** Add `encodeURIComponent` to `docUrl()` as a defence-in-depth measure — it costs nothing and eliminates the theoretical vector.

### 1.4 Verdict

| Issue | Severity | Status |
|---|---|---|
| Path traversal via `docId` (server-side) | ✅ None | `encodeURIComponent` used everywhere |
| Path traversal via `docId` (client-side) | 🟡 Low | Missing in `docUrl()` — theoretical risk only |
| Error leakage to client | ✅ None | All errors caught and replaced with generic messages |
| Error leakage in dev logs | ✅ Acceptable | Gated behind `NODE_ENV === 'development'` |

---

## 2. Atomic Booking Race Condition (TOCTOU)

### 2.1 File Inspected

- `src/app/api/bookings/route.ts` — `POST` handler (lines 56–155)

### 2.2 The Vulnerability

The double-booking guard at lines 75–100 implements a classic **Time-of-Check to Time-of-Use (TOCTOU)** pattern:

```
Step 1 (TOCHECK) — Read:  existingSnap = await db.collection('bookings')
                          .where('providerId', '==', body.providerId)
                          .where('date', '==', body.date).get();
                          // → Check if slot is free

Step 2 (TOUSE)   — Write: bookingRef = await db.collection('bookings')
                          .add(bookingData);
                          // → Create the booking
```

Between Step 1 and Step 2, a concurrent request can also pass the same check:

```
Time  Request A                  Request B
 │    Read: no conflict ✅       (waiting)
 │    (network latency)         Read: no conflict ✅
 │    Write: booking created    (still sees no conflict)
 │                              Write: booking ALSO created ❌
 ▼                              → DOUBLE-BOOKED!
```

### 2.3 Exploit Path

1. Attacker sends two simultaneous `POST /api/bookings` requests with identical `providerId`, `date`, `timeSlot`, and `serviceType`
2. Both requests execute the `existingSnap` query before either executes the `add()` write
3. Both see zero conflicting bookings
4. Both create their booking document
5. The same slot is double-booked

The rate limiter (30 req / 15 min per IP) does not prevent this — two requests arriving within a few milliseconds of each other will both pass the rate limit check.

### 2.4 Remediation — Deterministic Document ID

Firestore does not support composite unique constraints, but the `create()` method (via `doc().create()`) atomically fails if a document already exists at that path. By deriving a deterministic document ID from the unique booking slot, we get an atomic conflict check:

```typescript
// ── Atomic double-booking guard using deterministic doc ID ─────────
const slotKey = `${body.providerId}_${body.date}_${slot}_${body.serviceType}`
  .replace(/[^a-zA-Z0-9_-]/g, '_');

try {
  await db.collection('bookings').doc(slotKey).create({
    userId: decoded.uid,
    serviceType: body.serviceType,
    providerId: body.providerId,
    // ... all other fields ...
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
} catch (err: any) {
  // Firebase throws ALREADY_EXISTS if the doc already exists
  if (err.code === 'already-exists' || err.message?.includes('already exists')) {
    return NextResponse.json(
      { error: 'This time slot has already been booked.' },
      { status: 409 },
    );
  }
  throw err; // Unexpected error — let the outer catch handle it
}
```

This is **atomic** because the `create()` write and the conflict detection happen as a single Firestore operation — no separate read phase means no TOCTOU window.

**Alternative:** Use `db.runTransaction()` to read and write atomically. However, Firestore transactions have a maximum document write limit and can be slower. The deterministic-ID approach is simpler and equally effective for this single-document conflict.

### 2.5 Verdict

| Issue | Severity | Status |
|---|---|---|
| TOCTOU double-booking race | 🔴 High | Reproducible race window exists |
| Remediation proposed | — | Deterministic `doc(slotKey).create()` eliminates the read-before-write gap |

---

## 3. Isolation of LocalAuth Dev Fallback

### 3.1 Files Inspected

- `src/lib/localAuth.ts` — password hashing + localStorage persistence
- `src/context/AuthContext.tsx` — auth state management + fallback logic
- `src/app/admin/page.tsx` — admin user list merging

### 3.2 Finding A: No Production Guard

The `LocalAuth` class has **no mechanism to disable itself in production**. It is imported eagerly at the top of `AuthContext.tsx`:

```typescript
// AuthContext.tsx line 5 — top-level import, always evaluated
import { localAuth } from '@/lib/localAuth';
```

The constructor (lines 23–32) reads/writes `localStorage` on every instantiation. While `localStorage` is inaccessible during SSR (guarded by `typeof window !== 'undefined'`), the singleton is still created, the class is loaded into memory, and all its methods are fully callable.

### 3.3 Finding B: Transient Firebase Failure Fallback

The `login()` function (lines 206–251 of AuthContext.tsx) has the following fallback logic:

```typescript
try {
  const { auth } = getFirebaseAuth();
  if (auth) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    // ... Firebase success path ...
    return { user: appUser };
  }
} catch (err: unknown) {
  const fbErr = err as { code?: string };
  if (fbErr.code) {
    // Return Firebase error — do NOT fall through
    return { error: msg };
  }
  // No fbErr.code means Firebase configuration issue — fall through to localAuth
}

// 2) Fallback to localAuth
const result = await localAuth.login(email, password);
```

**The bug:** If Firebase is configured and operational, but `signInWithEmailAndPassword()` throws an error **without a `.code` property** (e.g., a network timeout, a deserialization failure, or an SDK internal error), the code falls through to `localAuth.login()`. In production, `localAuth` will have the user's Firebase credentials from a previous `setSessionFromFirebase()` call (which runs on every `onAuthStateChanged`), so `localAuth.login()` will **succeed** — returning a **different user object** with a potentially different ID than the Firebase UID.

This breaks `effectiveUserId`:

```typescript
// AuthContext.tsx line 385
effectiveUserId: firebaseUser?.uid ?? user?.id ?? null,
```

If `localAuth.login()` succeeds but Firebase did not, `firebaseUser` remains `null` and `effectiveUserId` falls back to the `localAuth` `user.id` (which is `user_<timestamp>` — never a Firebase UID). This causes downstream API calls (`/api/me/pets`, `/api/me/favorites`, etc.) to fail because the Firestore-backend expects the Firebase UID.

### 3.4 Finding C: setSessionFromFirebase Writes Password Hashes to localStorage

Every successful Firebase authentication triggers `localAuth.setSessionFromFirebase()` (line 162 of AuthContext.tsx):

```typescript
const appUser = localAuth.setSessionFromFirebase({
  uid: fbUser.uid,
  email: fbUser.email || '',
  name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
  photoURL: fbUser.photoURL,
}, undefined, authMethod);
```

This writes the user's profile (name, email, role, UID) to localStorage under `paws_session`, and the full user list (including `password` field for email/password users) under `paws_users`. For Google-authenticated users, no password hash is stored (`password` is `undefined`), but the user's PII (email, name, photoURL) is persisted to unencrypted client-side storage.

**XSS risk:** If any XSS vulnerability exists in the application, an attacker can extract `localStorage.getItem('paws_users')` and obtain the complete list of registered user profiles.

### 3.5 Finding D: Admin Panel Merges Local Users in Production

The admin panel at `src/app/admin/page.tsx` line 163:

```typescript
const localOnlyUsers = localAuth.getAllUsers();
const combined = [...firestoreUsers, ...localOnlyUsers];
```

This means the **admin's own localStorage users are merged into the admin panel user list**. If an admin logs into Firebase on a shared/public machine, their localStorage from that session persists, and the admin panel shows those local-only users alongside real Firestore users. This is primarily a data hygiene issue rather than a security vulnerability, but it can cause confusion and operational mistakes.

### 3.6 Remediation

**1. Production gate in `localAuth`:** Add a static check that prevents all write operations in production:

```typescript
class LocalAuth {
  private static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  async register(...) {
    if (LocalAuth.isProduction()) {
      return { error: 'Local auth is disabled in production.' };
    }
    // ...
  }

  async login(...) {
    if (LocalAuth.isProduction()) {
      return { error: 'Local auth is disabled in production.' };
    }
    // ...
  }

  setSessionFromFirebase(...) {
    if (LocalAuth.isProduction()) return; // Never persist Firebase creds to localStorage
    // ...
  }
}
```

**2. Hardened fallback guard in `AuthContext.tsx`:** After a Firebase Auth call fails, check whether Firebase **is** configured before falling through. If Firebase was reachable enough to return an error (any error), never fall to localAuth:

```typescript
} catch (err: unknown) {
  const fbErr = err as { code?: string; message?: string };
  
  // If Firebase Auth was reachable at all (has a code OR a message from the SDK),
  // do NOT fall through to localAuth.
  if (fbErr.code || (getFirebaseAuth().auth !== null)) {
    return { error: msg };
  }
  // Only fall through if Firebase is genuinely not configured
  // (auth object is null, no SDK available)
}
```

**3. Remove `setSessionFromFirebase` localStorage writes in production:**

```typescript
setSessionFromFirebase(...) {
  if (process.env.NODE_ENV === 'production') {
    // Still return the AppUser for in-memory state, but don't persist
    // Firebase credentials to localStorage where XSS can steal them.
    return appUser;
  }
  // ... existing persistence logic ...
}
```

### 3.7 Verdict

| Issue | Severity | Status |
|---|---|---|
| No production guard in LocalAuth | 🟡 Medium | Fallback can activate on transient Firebase errors |
| PII persisted to localStorage via `setSessionFromFirebase` | 🟡 Medium | XSS exfiltration of user profiles |
| `effectiveUserId` mismatch after localAuth fallback | 🟡 Medium | Breaks downstream API calls |
| Admin panel shows local-only users | 🟢 Low | Data hygiene, not a direct exploit |

---

## 4. Partial Failure States in Cascading Deletion

### 4.1 File Inspected

- `src/app/api/me/account/route.ts` — `DELETE` handler (lines 17–112)

### 4.2 Execution Chain

The deletion executes 7 distinct steps sequentially:

```
Step 1: Query relational docs     (runQueryRest × 5)     → READ ONLY
Step 2: Get provider doc          (getDocRest)            → READ ONLY
Step 3: Batch delete relational   (deleteDocsBatch)       → WRITE
Step 4: Delete provider doc       (deleteDocRest)         → WRITE
Step 5: Get user doc              (getDocRest)            → READ
Step 6: Delete user doc           (deleteDocRest)         → WRITE
Step 7: Delete Firebase Auth      (auth.deleteUser)       → WRITE
```

### 4.3 Failure Scenarios

**Scenario A — Step 3 fails (batch delete):**
- Exception thrown → outer catch → HTTP 500
- No documents deleted (step 3 never completed)
- **State:** Clean. The user can retry. ✅

**Scenario B — Step 3 succeeds, Step 4 fails:**
- All relational docs are deleted
- Provider doc still exists
- Auth user still exists
- Outer catch → HTTP 500
- **State:** Orphaned. Relational data is gone but the provider/user records and Auth user remain. User cannot recover relational data. Re-running deletes the rest. ⚠️

**Scenario C — Steps 3–6 succeed, Step 7 fails:**
- All Firestore documents have been deleted
- Firebase Auth user record still exists
- `auth.deleteUser()` throws → HTTP 500
- **State:** The user got a 500 error, but everything except the Auth record was deleted. The Auth user is an orphan — they can't log in (no Firestore user doc) but their email is still tied to a Firebase Auth account. Re-running the deletion will succeed (Firestore docs are already gone, `deleteDocRest` returns 404 → `false`, and Step 7 will fail again for the same reason). 🚩

**Scenario D — Network timeout during Step 1 (query phase):**
- The `runQueryRest` calls use `fetch` with no explicit timeout configuration
- If Firestore is slow, the `Promise.all` hangs
- Next.js function timeout (default 60s on serverless) terminates the request
- **State:** Clean. Nothing was written. User can retry. ✅

### 4.4 The Orphan Problem

The most problematic state: **Scenario C** where the Firebase Auth user is orphaned.

```typescript
// Line 91 — The last step
await auth.deleteUser(decoded.uid);
```

If this fails (e.g., the service account lacks the `firebase.auth.delete` permission, or the Auth API is temporarily unavailable):

1. All Firestore data is gone
2. The user cannot sign up again with the same email (`email-already-in-use`)
3. The admin cannot find the user in the Firestore-backed admin panel (user doc is deleted)
4. The Firebase Auth orphan must be cleaned up manually via the Firebase Console

### 4.5 Remediation

**Option A — Reorder: delete Auth user FIRST:**

```typescript
// 1. Delete Firebase Auth user FIRST — if this fails,
//    no Firestore data was touched, and the user can retry safely.
await auth.deleteUser(decoded.uid);

// 2. Then delete all Firestore data (idempotent — 404s are harmless)
await deleteDocsBatch(relationalDocs);
await deleteDocRest('providers', providerId);
// etc.

// 3. Report success
return NextResponse.json({ deleted: true, ... });
```

If Auth delete fails, the user retries and everything still works. If it succeeds but subsequent Firestore deletes fail, the user can retry and the Firestore deletes are idempotent. The worst case is an orphaned provider document with no Auth record — but that's easier to detect and clean up than a Firebase Auth orphan.

**Option B — Log and return partial success:**

If reordering is not desired, at minimum provide meaningful error reporting so the caller knows what was deleted and what wasn't:

```typescript
const results = {
  bookingsDeleted: false,
  paymentsDeleted: false,
  // ...
  authDeleted: false,
};
try { await deleteDocsBatch(relationalDocs); results.bookingsDeleted = true; } catch (e) { /* log */ }
try { await deleteDocRest('providers', providerId); results.providerDeleted = true; } catch (e) { /* log */ }
// ...
return NextResponse.json({ deleted: Object.values(results).every(Boolean), details: results });
```

**Option C — Add an AbortController timeout to the fetch calls:**

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
const res = await fetch(url, { signal: controller.signal, ... });
clearTimeout(timeoutId);
```

This prevents the request from hanging for the full serverless timeout before any write occurs.

### 4.6 Verdict

| Issue | Severity | Status |
|---|---|---|
| Auth user orphaned if step 7 fails after Firestore cleanup | 🔴 High | Firestore data lost, Auth user stuck, manual cleanup required |
| No rollback for partial failures | 🟡 Medium | Acceptable for pre-launch; mitigate by reordering Auth delete first |
| No explicit fetch timeouts | 🟢 Low | Could cause request hangs |

---

## 5. Content-Length Header Bypassing (checkBodySize)

### 5.1 File Inspected

- `src/lib/validation.ts` — `checkBodySize()` (lines 11–23)

### 5.2 The Vulnerability

The current implementation blindly trusts the client-supplied `Content-Length` header:

```typescript
export function checkBodySize(request: Request): void {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new Error('Request body too large');
  }
}
```

There are two bypass techniques:

**Bypass 1 — Chunked Transfer Encoding:**

If the client sends `Transfer-Encoding: chunked` without a `Content-Length` header, the check evaluates as:

```typescript
const contentLength = null; // No Content-Length header present
if (null && Number(null) > 100_000) {  // short-circuit: null is falsy
  // Never enters this block
}
```

The check passes trivially, and the client can stream an unlimited chunked body.

**Bypass 2 — Small Header, Large Body:**

```
Content-Length: 100
Body: <exactly 100 bytes of harmless JSON>
```

The check passes (100 ≤ 102400), but then the route handler calls `await request.json()`, which parses the body. Zod validates the structure but **not the byte count of individual string fields**. A valid JSON payload within the schema constraints is naturally limited by the Zod `max()` constraints (e.g., `message: z.string().max(2000)` limits each string, but many strings with max lengths could combine to exceed 100 KB without Zod rejecting it — if the payload is structurally valid).

Actually, with Zod's `.max()` on each string field and the fixed structure of the schemas, the maximum theoretical payload size is bounded. For example, `createBookingSchema` has ~20 fields with a max of 100 chars each → ~2 KB total. The Zod parsing happens after `request.json()` has already read the entire body into memory, so the memory is consumed before Zod validates.

### 5.3 The Real Risk — Memory Exhaustion

The critical issue is that `request.json()` parses the entire body into memory **before** any validation occurs:

```typescript
// 1. checkBodySize(request)  ← checks Content-Length header (trusted by client)
// 2. await request.json()    ← reads ENTIRE body into memory
// 3. schema.parse(body)      ← validates structure
```

An attacker can send a `Content-Length: 100` header followed by a 500 MB+ chunked body. `request.json()` will attempt to parse the entire stream, consuming memory proportional to the body size. This can cause:

- **Memory exhaustion** on the Node.js server (OOM kill)
- **Slowloris-style** resource starvation (slow stream that keeps the connection open for minutes)

### 5.4 Remediation — Stream Body Truncation

Proper enforcement requires reading the body as a stream and truncating at the limit:

```typescript
const MAX_BODY_BYTES = 100 * 1024; // 100 KB

export async function checkBodySize(request: Request): Promise<void> {
  const contentLength = request.headers.get('content-length');
  const isChunked = request.headers.get('transfer-encoding')?.toLowerCase().includes('chunked');
  
  // Reject chunked encoding entirely — we can't trust the size
  if (isChunked) {
    throw new Error('Transfer-Encoding chunked is not supported');
  }
  
  // If Content-Length is present and exceeds limit, reject immediately
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new Error('Request body too large');
  }
  
  // If no Content-Length but body exists, use a tee'd stream reader
  // to count bytes as they arrive, aborting at the limit.
  if (!contentLength && request.body) {
    const reader = request.body.getReader();
    let totalBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        throw new Error('Request body too large');
      }
    }
    
    // Reconstruct the body for downstream parsing
    // Note: Next.js Request objects are single-use — once the body
    // stream is consumed, it cannot be read again.
  }
}
```

**Important caveat for Next.js:** `Request` bodies are single-use readable streams in the Web API. Once consumed (by `getReader()` or `json()`), they cannot be re-read. The workaround is to either:

1. **Replace `request.json()` with a manual parse** after streaming: read the body into a bounded `Uint8Array`, then `JSON.parse()` it, then validate with Zod
2. **Apply the body size check inside a `before` handler** (custom wrapper) that clones the request: `request.clone().body?.getReader()`

For the simplest effective fix, use approach 1 — replace `request.json()` with `readBoundedBodyJSON(request, MAX_BODY_BYTES)`:

```typescript
export async function readBoundedBodyJSON<T>(request: Request, maxBytes: number): Promise<T> {
  const contentLength = request.headers.get('content-length');
  
  // Reject chunked encoding
  if (request.headers.get('transfer-encoding')?.toLowerCase().includes('chunked')) {
    throw new Error('Request body too large');
  }
  
  // If Content-Length says it's too big, reject immediately
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error('Request body too large');
  }
  
  // Read the body stream in chunks, accumulating but enforcing the cap
  const reader = request.body?.getReader();
  if (!reader) {
    // No body — let JSON.parse handle the empty case
    return JSON.parse('{}') as T;
  }
  
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new Error('Request body too large');
    }
    chunks.push(value);
  }
  
  // Concatenate and parse
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(combined)) as T;
}
```

Then in each route handler, replace:
```typescript
checkBodySize(request);               // ← old: trusts Content-Length header
const body = schema.parse(await request.json());
```
with:
```typescript
const body = schema.parse(await readBoundedBodyJSON(request, MAX_BODY_BYTES));
```

This removes the `checkBodySize()` call entirely and enforces the limit at the stream level.

### 5.5 Verdict

| Issue | Severity | Status |
|---|---|---|
| Chunked encoding bypasses size check entirely | 🔴 High | Trivially exploitable for memory exhaustion |
| Content-Length header is client-supplied and untrustworthy | 🟡 Medium | Can be set to any value |
| No stream-level byte counting | 🔴 High | Body is fully read before any enforcement |
| Remediation proposed | — | `readBoundedBodyJSON()` → stream-level truncation |

---

## Summary & Priority Remediation Plan

| # | Finding | Severity | File(s) | Effort |
|---|---|---|---|---|
| 1 | TOCTOU race condition in booking creation | 🔴 **High** | `src/app/api/bookings/route.ts` | Low — deterministic `doc(slotKey).create()` |
| 2 | Content-Length bypass via chunked encoding | 🔴 **High** | `src/lib/validation.ts` | Medium — `readBoundedBodyJSON()` stream reader |
| 3 | Auth user orphaned after partial deletion failure | 🔴 **High** | `src/app/api/me/account/route.ts` | Low — reorder `auth.deleteUser()` to execute first |
| 4 | LocalAuth fallback on transient Firebase errors | 🟡 **Medium** | `src/context/AuthContext.tsx` | Low — add `NODE_ENV` guard + hardened fallback check |
| 5 | PII persisted to localStorage via `setSessionFromFirebase` | 🟡 **Medium** | `src/lib/localAuth.ts` | Low — skip `save()`/`saveSession()` in production |
| 6 | Missing `encodeURIComponent` in client-side `docUrl()` | 🟢 **Low** | `src/lib/firestore-rest.ts` | Trivial — wrap `docId` in `encodeURIComponent()` |

### Immediate (Week 1)

| Priority | Fix |
|---|---|
| P0 | **TOCTOU booking race** — Replace read-then-write with deterministic `doc(slotKey).create()` |
| P0 | **Content-Length bypass** — Replace `checkBodySize` + `request.json()` with `readBoundedBodyJSON()` |
| P0 | **Auth user orphan** — Reorder `auth.deleteUser()` to execute first in `DELETE /api/me/account` |

### Short-Term (Week 2)

| Priority | Fix |
|---|---|
| P1 | **LocalAuth production guard** — Block all writes in production; harden Firebase error fallback logic |
| P1 | **setSessionFromFirebase localStorage** — Skip persistence in production |
| P2 | **docUrl encodeURIComponent** — Add defence-in-depth encoding |

---

*Report generated from commit `d6e74f2`. All code references are line-accurate as of the audit date.*
