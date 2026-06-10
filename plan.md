# Pet-Co — Architectural Blueprint & Current State

> **Last updated:** 2026-06-10
> **Next.js 16.2.6 · App Router · TypeScript 5 · Tailwind CSS 4 · Firebase Firestore · Firebase Admin SDK · Zod 4 · bcryptjs**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Application Structure](#3-application-structure)
4. [Features & Capabilities](#4-features--capabilities)
5. [Security & Architecture Framework](#5-security--architecture-framework)

---

## 1. Project Overview

Pet-Co (branded "Paws & Co.") is a full-stack, dual-sided pet-service marketplace that connects **pet owners** with **service providers**. Owners browse, book, and review providers across six categories (Dog Walking, Vet Visits, Grooming, Pet Hotels, Pet Sitting, Pet Shops). Providers manage their business profile, services, products, availability, and incoming bookings. Platform administrators have a central admin panel with tabbed data management, financial analytics, user oversight, and batch fee collection.

The application is built on Next.js 16 (App Router) with Firebase Auth for authentication and Firestore for persistence. It uses a triple-access data pattern (Firebase SDK → Firestore REST API → localStorage fallback) to handle sandboxed/container environments where gRPC can silently fail. Server-side API routes delegate all Firestore operations to a REST-only helper that authenticates via `google-auth-library` OAuth2 credentials, completely bypassing the Admin SDK's gRPC transport.

---

## 2. Tech Stack

### 2.1 Core Runtime

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.2.6 |
| **Bundler** | Turbopack (dev) / Webpack (prod) | — |
| **Language** | TypeScript | ^5 |
| **Styling** | Tailwind CSS | ^4 (PostCSS) |
| **Typography** | DM Serif Display + DM Sans | Google Fonts (layout.tsx) |
| **Linting** | ESLint 9 + eslint-config-next | 16.2.6 |
| **React** | React 19 DOM | 19.2.4 |

### 2.2 Authentication

| System | Package | Runtime | Purpose |
|---|---|---|---|
| **Firebase Auth (client)** | `firebase` ^12.13.0 | Browser | Google OAuth popup + Email/Password sign-in |
| **Firebase Admin Auth (server)** | `firebase-admin` ^13.10.0 | Node.js | ID token verification (`verifyIdToken`) |
| **LocalAuth fallback** | `bcryptjs` ^3.0.3 | Browser (localStorage) | Dev fallback when Firebase env vars absent |
| **OAuth2 service account** | `google-auth-library` | Node.js | OAuth2 token for Firestore REST API calls |

### 2.3 Database & Storage

| System | Purpose | Access Method |
|---|---|---|
| **Cloud Firestore** | Primary database | Triple-access: SDK → REST API → localStorage |
| **Firebase Storage** | Provider logo images | Firebase Storage SDK |
| **Server-side Firestore** | Admin API routes | `firestore-admin-rest.ts` (OAuth2 REST, no gRPC) |

### 2.4 Validation & Security

| Package | Version | Purpose |
|---|---|---|
| `zod` | ^4.4.3 | Server-side request body schemas + type inference |
| `bcryptjs` | ^3.0.3 | Password hashing (12 salt rounds, localAuth fallback) |
| `@types/bcryptjs` | ^2.4.6 | TypeScript definitions |

### 2.5 Firebase Project Configuration

- **Project ID:** `pet-co-fc4d6`
- **Firestore location:** nam5 (us-central)
- **Auth providers:** Email/Password, Google
- **Security rules:** `firestore.rules` (deploy from local machine — not from sandbox)

---

## 3. Application Structure

```
Pet-Co/
├── next.config.ts                      # CSP, HSTS, Permissions-Policy, dev origins, image remotes
├── firestore.rules                     # Firestore security rules (role-based access)
├── tsconfig.json                       # Path alias @/ → ./src/*
├── package.json                        # Dependencies & scripts
├── .env.local.example                  # Required environment variable template
│
├── scripts/
│   ├── setup.sh                        # Install deps + create .env.local from env vars
│   └── dev.sh                          # Start dev server with proxy-domain auto-detection
│
├── src/
│   ├── middleware.ts                   # Rate-limit middleware (3 tiers, /api/* only)
│   │
│   ├── app/
│   │   ├── layout.tsx                  # Root layout: AuthProvider, Navbar, Footer, fonts
│   │   ├── page.tsx                    # Homepage: hero, service cards, stats, how-it-works
│   │   │
│   │   ├── login/page.tsx              # Email/password login + Google OAuth
│   │   ├── register/page.tsx           # Registration with role selection
│   │   ├── about/page.tsx              # About page
│   │   ├── contact/page.tsx            # Contact form with honeypot
│   │   ├── privacy/page.tsx            # Privacy policy
│   │   ├── terms/page.tsx              # Terms of service
│   │   │
│   │   ├── services/
│   │   │   ├── page.tsx                # Provider listing (server component)
│   │   │   └── ServicesClient.tsx      # Client-side filter/search/sort
│   │   │
│   │   ├── provider/
│   │   │   └── [id]/
│   │   │       ├── page.tsx            # Provider detail (SSR via REST helpers)
│   │   │       └── ProviderClient.tsx  # Client-side booking/review interaction
│   │   │
│   │   ├── booking/page.tsx            # Booking flow (date, time, service selection)
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # Owner dashboard (favorites, pets, reviews)
│   │   │   └── ProviderDashboard.tsx   # Provider dashboard (earnings, bookings, profile mgmt)
│   │   │
│   │   ├── admin/page.tsx              # Admin panel (tabs: users, providers, bookings,
│   │   │                               #   payments, reviews, analytics)
│   │   │
│   │   └── api/
│   │       ├── providers/route.ts      # GET  — list all providers (public, no auth)
│   │       ├── messages/route.ts       # POST — contact form (honeypot + zod + rate-limited)
│   │       │
│   │       ├── bookings/route.ts       # GET  — booked slots by providerId+date
│   │       │                           # POST — create booking (atomic double-booking guard)
│   │       │
│   │       ├── payments/route.ts       # GET  — user payments by role
│   │       │                           # PATCH — update status by bookingId (ownership check)
│   │       │                           # DELETE — delete by bookingId
│   │       │
│   │       ├── reviews/route.ts        # POST — create review (syncs provider rating)
│   │       │
│   │       ├── me/
│   │       │   ├── pets/route.ts       # GET, POST — list/create user's pets
│   │       │   ├── favorites/route.ts  # GET, POST, DELETE — manage favorites
│   │       │   └── account/route.ts    # DELETE — cascading account deletion (7 collections)
│   │       │
│   │       ├── auth/
│   │       │   └── delete-user/route.ts# POST/DELETE — admin-only Firebase Auth user deletion
│   │       │
│   │       └── admin/
│   │           ├── payments/
│   │           │   └── batch-fee-collect/route.ts  # POST — batch update feeCollected
│   │           └── users/
│   │               └── [userId]/details/route.ts   # GET — full user detail (pets, bookings, payments, reviews)
│   │
│   ├── components/
│   │   ├── Navbar.tsx                  # Glassmorphism nav with auth state
│   │   ├── Footer.tsx                  # Footer with animated links
│   │   └── Toast.tsx                   # Toast notification component
│   │
│   ├── context/
│   │   └── AuthContext.tsx             # Auth state management + session expiry enforcement
│   │
│   └── lib/
│       ├── types.ts                    # AppUser, ServiceProvider, Booking, etc.
│       ├── validation.ts               # Zod schemas + checkBodySize (100 KB limit)
│       ├── rate-limit.ts               # RateLimitStore interface + InMemoryStore + checkRateLimit
│       ├── session.ts                  # 30-day session expiry, ID-token refresh
│       ├── server-auth.ts              # requireFirebaseUser / requireAdmin (Firestore role check)
│       │
│       ├── firebase.ts                 # Client Firebase init (lazy, graceful degradation)
│       ├── firebase-admin.ts           # Server Firebase Admin init (lazy, singleton)
│       │
│       ├── firestore-rest.ts           # Client-side Firestore REST + localStorage fallback
│       ├── firestore-admin-rest.ts     # Server-side Firestore REST (OAuth2, no gRPC)
│       ├── provider-rest.ts            # Client-side provider/review REST helpers
│       ├── me-api.ts                   # Client-side API wrappers (pets, favorites, payments, etc.)
│       ├── localAuth.ts                # localStorage-based auth (bcryptjs, dev fallback)
│       ├── data.ts                     # Static provider seed data
│       └── formatProductPrice.ts       # Price formatting utility
```

---

## 4. Features & Capabilities

### 4.1 Provider Directory

- **Browse:** Six service categories presented on the homepage (Dog Walking, Vet Visit, Dog Hotel, Pet Sitting, Grooming, Pet Shop) with emoji icons
- **Search/Filter/Sort:** Client-side text search across provider names/descriptions, category filtering, and sort by rating (via `ServicesClient.tsx`)
- **Provider Profiles:** Detail page (`/provider/[id]`) with services list (name, price, duration), retail products, weekly availability schedule, contact info, social media links, embedded Google Maps location, rating/review history
- **Server-side rendering:** Provider data fetched via Firestore REST API at request time (SSR), not client-side hydration

### 4.2 Booking System

- **Booking flow:** Date picker → time slot selection (fetched from `GET /api/bookings?providerId=&date=`) → service type selection → price breakdown display → confirmation
- **Atomic double-booking guard:** `POST /api/bookings` performs a server-side conflict check against the same provider+date+serviceType+slot before creating the document. Conflicting bookings receive HTTP 409
- **Cascading payment ledger:** Each booking automatically creates a payment entry in the `payments` collection with `status: 'pending'`
- **Rate-limited creation:** Booking creation is limited to 30 requests per 15 minutes per IP (middleware tier `moderate` + inline `checkRateLimit`)
- **Status lifecycle:** Bookings flow through `pending` → `confirmed` → `completed` / `cancelled` / `declined`. Payments update mirror the booking status changes

### 4.3 Pet Profile Management

- **CRUD operations:** `GET /api/me/pets` and `POST /api/me/pets` — pets are scoped to the authenticated user via Firebase ID token UID
- **Data fields:** name (required), type/species (required), breed, age, medical notes — validated server-side via Zod `createPetSchema`
- **Ownership enforcement:** Server-side `requireFirebaseUser` uses `decoded.uid` as the document owner — no client-supplied `userId` parameter
- **Client-side API:** `fetchMyPets()` / `addMyPet()` in `me-api.ts` automatically attach the Bearer token

### 4.4 Favorites System

- **Toggle favorites:** Add and remove provider favorites via `POST /api/me/favorites` and `DELETE /api/me/favorites?providerId=xxx`
- **Duplicate-aware:** POST handler checks for existing favorites before creating a new document — returns the existing one if already favorited
- **Dashboard display:** Owner dashboard shows saved favorites with provider name, category, emoji, and rating
- **Rest-based fallback:** Uses the full 4-layer fallback chain (SDK → runQuery → GET-by-ID → localStorage) for reliable reads in sandboxed environments

### 4.5 Reviews & Ratings

- **Rating range:** 1–5 stars, validated server-side via `createReviewSchema`
- **Provider sync:** After a review is created, the server aggregates all reviews for that provider and updates the `rating` (average) and `reviews` (count) fields on the provider document
- **Ownership rules:** The Review Firestore security rule prevents providers from reviewing themselves (`getUserData().role != 'provider'`)
- **Admin management:** Admin panel allows editing (rating, comment) and deleting reviews, with automatic re-aggregation after deletion

### 4.6 Contact Form

- **Server-only write:** Contact form submissions are proxied through `POST /api/messages` using the Admin SDK service account — client-side Firestore writes are explicitly blocked (`allow create: if false`)
- **Honeypot spam filter:** A hidden `_hp` field must be empty (invisible to real users, auto-filled by bots); Zod rejects non-empty values
- **Rate-limited:** 10 requests per 15 minutes per IP (strict tier)
- **Dev-gated error logging:** Firestore write failures are logged only in development mode; clients always receive a generic message

### 4.7 Admin Dashboard

- **Multi-tab interface:** Users, Providers, Bookings, Payments, Reviews, and Analytics tabs — all with server-side pagination (cursor-based via `nextPageToken`)
- **User directory:** Merged view of Firestore Auth users + `localAuth` localStorage users, deduplicated by ID. Admin can delete users via `POST /api/auth/delete-user`
- **Provider financials:** Detail modal with date-range gross revenue / platform fee calculations, fee history table, and batch fee collection
- **Payment ledger:** Service Cost / Platform Fee / Total breakdown columns, provider filter dropdown, date sort toggle, payment detail modal with status editing
- **Business Analytics:** CSS stacked bar chart (Platform Revenue vs Provider Payouts over 12 months), KPI cards (Total Users with MoM growth, Active Providers, Total Platform Fees, Revenue MTD), Top 3 Providers leaderboard with 🥇🥈🥉 medals, monthly bookings bar chart, service distribution breakdown
- **Review management:** Edit rating/comment, delete, with automatic re-aggregation of provider averages

### 4.8 Provider Dashboard

- **Metric cards:** Total Earnings MTD, Active Bookings count, Active Listings, Average Rating — all computed from live Firestore data via REST API
- **Business profile management:** Edit business name, description, logo upload, contact info, location, social media links, operational hours per day
- **Service listings:** Add/edit/remove services with name, price, duration, description, currency
- **Product inventory:** Add/edit/remove retail products with price, image, stock status, currency
- **Booking management:** View incoming bookings with confirm/complete/cancel actions
- **Cascading account deletion:** `DELETE /api/me/account` removes all relational documents (bookings, payments, reviews, favorites, pets), then the provider doc, then the user doc, and finally the Firebase Auth user record

---

## 5. Security & Architecture Framework

### 5.1 Password Security — bcryptjs (12 Rounds)

`src/lib/localAuth.ts` handles email/password registration and login as a dev/fallback auth layer when Firebase environment variables are unavailable. All passwords are hashed with **bcryptjs** using 12 salt rounds before being written to localStorage.

```
register(email, password, name, role):
  hashedPassword = bcrypt.hash(password, 12)   ← 12 salt rounds
  store { ..., password: hashedPassword }

login(email, password):
  user = findByEmail(email)
  bcrypt.compare(password, user.password)       ← constant-time comparison
```

The previous implementation used PBKDF2 via `crypto.subtle.deriveBits` (SHA-256, 100,000 iterations). Since the application is pre-launch with zero email/password users, all PBKDF2 code was removed entirely — no migration or backward compatibility logic is needed.

- **Removed:** `deriveKey()`, `generateSalt()`, `toHex()`, `hashPassword()`, `verifyPassword()`, `PBKDF2_ITERATIONS`, `SALT_BYTES`, `DERIVED_KEY_BYTES`, `HASH_ALGORITHM`
- **No legacy path:** The `register()` function never stored a PBKDF2 hash in production, so no `isLegacyHash()` check or migration flow is present

### 5.2 Admin Boundary — Server-Side Firestore Role Verification

Administrative operations are protected by a **two-factor verification chain** that cannot be bypassed by client-side request manipulation:

```
requireAdmin(request):
  1. requireFirebaseUser(request)
     a. Extract Bearer token from Authorization header
     b. adminAuth.verifyIdToken(token)          ← cryptographic token verification
     c. Return decoded token (contains uid, email, etc.)

  2. Firestore role check
     a. getDocRest('users', decoded.uid)         ← REST API (not client-facing)
     b. Read callerDoc.role field
     c. If role !== 'admin', throw 'Admin access required'
```

**Key properties:**
- The admin role is fetched server-side from Firestore using the OAuth2-authenticated REST helper (`firestore-admin-rest.ts` — not the client SDK)
- The Firebase ID token is cryptographically verified by the Admin SDK — a client cannot forge or tamper with it
- Even if a client sends `{ role: 'admin' }` in a request body, the server ignores it and reads the actual role from the Firestore user document
- **Routes protected by `requireAdmin()`:**
  - `POST /api/auth/delete-user` — Firebase Auth user deletion
  - `POST /api/admin/payments/batch-fee-collect` — Batch fee collection
  - `GET /api/admin/users/[userId]/details` — Full user detail lookup

### 5.3 Server-Side Input Validation — Zod Schemas

Every POST, PUT, and PATCH endpoint validates the request body against a **typed Zod schema** before any database operation:

| Route | Schema | Key Constraints |
|---|---|---|
| `POST /api/bookings` | `createBookingSchema` | `providerId` (uid), `serviceType` (1-100 chars), `date` (required), `price`/`platformFee`/`total` (non-negative), `currency` (max 10 chars, default USD) |
| `POST /api/reviews` | `createReviewSchema` | `providerId` (uid), `rating` (1–5 integer), `comment` (max 2000 chars) |
| `POST /api/me/pets` | `createPetSchema` | `name` (1–100), `type` (1–100), `breed`/`age` (max 100, optional), `notes` (max 2000) |
| `POST /api/me/favorites` | `createFavoriteSchema` | `providerId` (uid), `providerName` (max 100), `emoji` (max 20), `rating` (0–5) |
| `PATCH /api/payments` | `updatePaymentSchema` | `bookingId` (uid), `status` (enum: paid, pending, unpaid) |
| `POST /api/auth/delete-user` | `deleteUserSchema` | `uid` (min 1 char) |
| `POST /api/admin/payments/batch-fee-collect` | `batchFeeCollectSchema` | `paymentIds` (array of non-empty strings, min 1), `collected` (boolean, default true) |
| `POST /api/messages` | `contactSchema` | `name` (1–100), `email` (valid email, max 320), `subject` (enum: general/support/partner/provider/feedback), `message` (1–2000), `_hp` (honeypot: must be `''` or `undefined`) |

**Additional body-size guard:** `checkBodySize(request)` checks the `Content-Length` header and rejects any payload exceeding 100 KB before parsing begins.

### 5.4 Generic Error Masking

All API route catch blocks return **generic, architecture-agnostic error messages** to prevent internal details from leaking to the client:

```typescript
// Every route follows this pattern:
try {
  // ... business logic ...
} catch (error: any) {
  if (process.env.NODE_ENV === 'development') {
    // Detailed logging happens server-side only
    console.error('POST /api/xxx failed:', error?.message);
  }
  // Client always receives a generic message
  return NextResponse.json(
    { error: 'An internal server error occurred.' },
    { status: 500 },
  );
}
```

**Specific leak mitigations:**
- **Firestore errors:** `firestore-admin-rest.ts` functions throw errors containing HTTP status codes and response bodies (e.g., `DELETE users/abc failed: 403 ...`). These are caught by route handlers and replaced with generic messages — never forwarded to the client
- **Validation errors:** Zod errors are caught explicitly and return only `error.message || 'Validation failed'` — not the full Zod error object tree
- **Auth errors:** `'Missing Authorization Bearer token'` and `'Admin access required'` are returned as-is (safe, no architecture details)
- **404 vs 403 vs 500:** The server distinguishes "not found" (404) from "forbidden" (403) from "internal error" (500) but never includes stack traces, database names, Firestore document paths, or gRPC error codes
- **Contact form:** The `messages/route.ts` originally threw `new Error(\`Firestore write failed: ${res.status} ${errBody}\`)` — now uses a dev-gated `console.error` with a generic throw message

### 5.5 Rate Limiting — Global Middleware + Per-Route Defense

A **two-layer rate-limiting architecture** protects all API endpoints:

#### Layer 1: Next.js Middleware (`src/middleware.ts`)

Runs on every `/api/:path*` request before reaching the route handler. Uses a **`RateLimitStore` interface** with an `InMemoryStore` implementation (swappable to Redis by implementing the same interface — `increment()`, `reset()`, `ttl()`).

| Tier | Limit | Routes |
|---|---|---|
| **Default** | 100 req / 15 min | All remaining `/api/*` routes (GET reads, general access) |
| **Moderate** | 30 req / 15 min | Mutating endpoints: `/api/bookings`, `/api/reviews`, `/api/messages`, `/api/payments`, `/api/me/pets`, `/api/me/favorites`, `/api/me/account`, `/api/admin/payments/batch-fee-collect` (non-GET only) |
| **Strict** | 10 req / 15 min | `/api/auth/delete-user` (admin user deletion) |

When exceeded, middleware returns HTTP 429 with:
```json
{ "error": "Too many requests, please try again later." }
```
Plus headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

#### Layer 2: Inline Per-Route Checks (Defence-in-Depth)

Sensitive endpoints apply a **second `checkRateLimit()` call** inside the route handler, keyed to the authenticated user ID (not just IP):

| Route | Limit | Key |
|---|---|---|
| `POST /api/bookings` | 30 req / 15 min | IP-based (`makeKey('booking', ip)`) |
| `POST /api/auth/delete-user` | 10 req / 15 min | IP-based |
| `POST /api/messages` | 10 req / 15 min | IP-based |
| `DELETE /api/me/account` | 5 req / 15 min | IP + User ID (`makeKey('delete-account', ip, uid)`) |

#### Store Abstraction — Redis Migration Path

```typescript
// src/lib/rate-limit.ts
export interface RateLimitStore {
  increment(key: string, windowMs: number): number;
  reset(key: string): void;
  ttl(key: string): number;
}

// Current implementation (dev/pre-launch):
export const store: RateLimitStore = new InMemoryStore();

// Production — swap to Redis:
// const redis = new Redis(REDIS_URL);
// export const store: RateLimitStore = new RedisStore(redis);
//
// No changes needed in middleware.ts or any route file.
```

### 5.6 Security Headers — `next.config.ts`

All responses carry the following security headers (configured via Next.js `headers()` in `next.config.ts`):

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | 2-year HSTS with subdomain coverage + preload |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer header leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disables unused browser features + FLoC opt-out |
| `X-DNS-Prefetch-Control` | `on` | Optimises DNS resolution for external resources |
| `Cross-Origin-Resource-Policy` | `same-origin` | Prevents cross-origin resource reads |

**Content-Security-Policy (CSP):**
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.firebase.com https://*.firebaseio.com https://apis.google.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https:;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://*.googleapis.com https://*.firebase.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com;
frame-src 'self' https://*.firebaseapp.com;
manifest-src 'self';
base-uri 'self';
form-action 'self';
```

### 5.7 Session Expiration — 30-Day Maximum

The `src/lib/session.ts` module enforces a secondary session age boundary on top of Firebase Auth's built-in token lifecycle:

- **`recordSessionStart()`** — saves the session creation timestamp to `localStorage` after login/register
- **`enforceSessionExpiry()`** — checks whether the session has exceeded 30 days; returns `true` if expired
- **`isSessionFresh()`** — lightweight freshness check (no side effects)
- **`forceTokenRefresh()`** — calls `getIdToken(true)` on the Firebase user object to force a token refresh on app startup. If the call fails (user deleted, token revoked), the caller signs the user out
- **Integration:** `AuthContext.tsx` calls `enforceSessionExpiry()` in the `onAuthStateChanged` handler and on app mount — expired sessions force a complete logout

### 5.8 Owner Verification — No Client-Supplied Owner Parameters

Every mutating API route that creates a data document (booking, pet, favorite, review) derives the **owner userId** exclusively from the Firebase ID token's `decoded.uid` — never from the request body:

```typescript
// POST /api/me/pets  —  user supplies { name, type, breed, age, notes }
// The route handler:
const decoded = await requireFirebaseUser(request);  // ← cryptographically verified
const pet = {
  ...body,                    // ← name, type, etc.
  userId: decoded.uid,        // ← server-sourced owner, NOT from body
};
```

If a malicious client sends `{ ...body, userId: 'some-other-uid' }` the extra field is simply ignored — the spread is overwritten by `decoded.uid`. Zod schemas do not even define a `userId` field for owner-scoped resources, so extraneous properties are silently stripped.

### 5.9 NoSQL Injection — All Queries Are Parameterized

The codebase contains **zero** raw query string construction. All database operations use one of:

- **Firebase Admin SDK:** `.collection('pets').where('userId', '==', decoded.uid).get()` — fully parameterized by the SDK
- **Firestore REST API:** Structured queries via `fieldFilter` objects — the `runQueryRest()` helper takes typed `field`, `op`, and `value` parameters that are serialized as Firestore typed values, never interpolated as strings
- **REST document access:** All collection/document names are passed through `encodeURIComponent()` — never concatenated from user input

---

*This document is the single source of truth for the Pet-Co codebase. Update it whenever the architecture, dependencies, or security posture changes.*
