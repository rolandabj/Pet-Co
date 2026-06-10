# Pet-Co — Platform Blueprint & Current State

> **Last updated:** 2026-06-10  
> **Commit:** `d6e74f2` (docs & security commit — latest)  
> **Audit trail:** See `SCALABILITY-AUDIT.md`, `AUDIT-REPORT.md`, and `AGENTS.md`

---

## Project Overview

Pet-Co is a full-stack pet service marketplace connecting pet owners with local service providers including dog walkers, veterinarians, groomers, pet sitters, pet hotels, and pet shops. The platform supports user registration, provider discovery with rich profiles, booking with time-slot management, pet profile management, a favourites system, 1-5 star reviews with rating aggregation, contact forms, and a full administrative dashboard.

Authentication is handled primarily through **Firebase Auth** (Google Sign-In + email/password), with a local-auth fallback for development environments. All API routes are server-side protected by Firebase ID token verification, Zod schema validation (body size + shape), and sliding-window rate limiting with configurable per-path tiers.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server and client rendering, API routes, middleware |
| Authentication (client) | Firebase Auth (firebase/auth) | Google Sign-In popup, email/password, ID tokens |
| Authentication (server) | Firebase Admin SDK (firebase-admin) | ID token verification, admin role checks |
| Database | Cloud Firestore | Primary data store via gRPC (Admin SDK) and REST API |
| REST transport | google-auth-library + fetch | Server-side Firestore operations (bypasses gRPC) |
| Validation | Zod | Schema-driven request body validation |
| Rate limiting | Custom sliding-window (InMemoryStore) | Middleware + per-route defence-in-depth |
| Password hashing | bcryptjs | Local-auth credential storage (12 salt rounds) |
| Styling | Tailwind CSS | Utility-first styling |
| Deployment | Vercel (target) | Serverless Node.js functions |

---

## Application Structure



---

## Features & Capabilities

### Provider Directory

- Landing page displays a curated grid of provider types (Dog Walkers, Vets, Groomers, Hotels, Sitters, Pet Shops) with emoji, rating, and review count
- Services page (/services) lists all providers with client-side filtering and search
- Provider detail page (/provider/[id]) - SSR-fetched with full profile including: business name, description, contact info, logo, service menu with pricing and duration, product catalogue with stock status, operational hours / availability calendar, reviews list sorted newest-first, and interactive booking widget

### Booking System

- Time-slot booking with provider ID + date query
- Atomic slot reservation using deterministic document IDs (providerId_date_slot_serviceType) with Firestore .create() - prevents TOCTOU double-booking race
- Cooldown gate: 30-minute slot granularity enforced at write time
- Booking status workflow: pending -> confirmed -> completed -> cancelled
- Cooldown enforcement on the server: existing bookings within the same slot+service combo block new submissions at the database level

### Pet Profile Management

- CRUD via /api/me/pets - GET lists all pets for the authenticated user, POST adds a new one
- Per-pet fields: name, species type, breed, age, medical/behaviour notes
- All data stored server-side in Firestore - not in localStorage

### Favourites System

- Toggle favourite providers via /api/me/favorites
- GET returns user's favourites list (with optional providerId filter)
- POST adds a favourite with provider metadata (name, category, emoji, rating)
- DELETE removes a favourite by provider ID

### Reviews (1-5 Stars)

- POST /api/reviews - authenticated users submit a rating (1-5) + comment
- Author name resolution from the user's Firestore profile document
- Provider rating sync - running average recalculated on each new review
- Scales via Firestore transactions (see SCALABILITY-AUDIT.md section 4 for Cloud Function migration path)

### Contact Forms

- POST /api/messages with server-side validation:
  - Zod schema enforces name, email, subject (enum), message (max 2000 chars)
  - Honeypot field (_hp) - invisible to real users, bots auto-fill it, submission rejected
  - Written to Firestore via Admin SDK REST (bypasses client security rules)

### Admin Dashboard

- Six-tab interface: Users, Services (Providers), Bookings, Analytics, Payments, Reviews
- Role-gated: only Firestore role admin users can access (verified via requireAdmin())
- Paginated tables for bookings, providers, payments, and reviews (20 per page with cursor tokens)
- User management: merge of Firestore users collection + localAuth, deduplicated by ID, with delete capability
- Provider management: CRUD operations, fee collection status, detail inspection
- Booking management: status editing, detail inspection
- Payment management: status editing, batch fee collection, provider-level filtering, sort by date
- Analytics tab: revenue charts, platform fee tracking, monthly breakdown
- User detail modal: aggregated view of a user's pets, bookings, payments, and reviews

### Analytics (Admin Tab)

- Monthly booking and payment summaries fetched via dedicated REST endpoints
- Analytics data refreshes independently of paginated collection tables
- Revenue tracking with platform fee aggregation

---

## Security and Architecture Framework

### Authentication Layers

| Layer | Mechanism | Location |
|---|---|---|
| Client auth | Firebase Auth (Google popup + email/password) | src/lib/firebase.ts |
| Server token verification | verifyIdToken() via Firebase Admin SDK | src/lib/server-auth.ts |
| Admin boundary | Firestore role field check after token verification | src/lib/server-auth.ts:requireAdmin() |
| Local auth (dev only) | bcryptjs (12 salt rounds) - all writes blocked in production | src/lib/localAuth.ts |
| Session expiry | 30-day max session lifetime, enforced on init | src/lib/session.ts, AuthContext.tsx |
| Token freshness | Force-refresh on every app init to detect revoked tokens | AuthContext.tsx |

### Password Security

- bcryptjs with 12 salt rounds for all local-auth password storage
- Production paths disable localAuth.register(), localAuth.login(), and all localStorage writes
- In-memory session continuity only in production (no XSS exfiltration path from localStorage)

### Input Validation and Body Size Enforcement

- Zod schemas on every mutating API route (bookings, reviews, pets, favourites, payments, messages, delete-user, batch-fee-collect)
- readBoundedBodyJSON() - stream-level buffer with:
  - Hard 100 KB ceiling
  - Transfer-Encoding: chunked rejection
  - Content-Length fast-path reject
  - AbortController safety valve
- Schemas define exact field constraints: min/max string lengths, number ranges (rating 1-5), enum values, optional/nullable fields

### Exception Masking

- All API routes wrap handler logic in try/catch and return generic error on unhandled exceptions
- Zod validation errors return specific 400 messages
- Development mode only logs detailed error messages to console - never exposed to clients
- 404s from Firestore are swallowed or mapped to graceful null/false returns

### Rate Limiting Architecture

Two-layer defence-in-depth:

Middleware (global): 3 tiers (strict/moderate/default) applied by path+method
  mw:strict -> 10 req/15 min
  mw:moderate -> 30 req/15 min
  mw:default -> 100 req/15 min

Route handler (per-route): Inline rate limit with route-specific window+max
  delete-account -> 5 req/15 min
  delete-user -> 10 req/15 min
  messages -> 10 req/15 min

Store is a swap-able RateLimitStore interface (InMemoryStore currently - see SCALABILITY-AUDIT.md section 2 for Redis migration path).

### Content Security Policy

Comprehensive CSP injected via next.config.ts headers: default-src self, script-src self + Firebase SDK CDN + unsafe-inline (dev overlay only), connect-src Firestore REST + Firebase Auth + Identity Toolkit + Secure Token, frame-src Firebase Auth popup, form-action self.

### Additional Security Headers

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera, microphone, geolocation disabled
- X-DNS-Prefetch-Control: on

### Client-Side Production Guards

| Guard | Mechanism | File |
|---|---|---|
| localAuth.register/login blocked in production | isProduction() gate returns error | localAuth.ts |
| localAuth.setSessionFromFirebase skips localStorage in production | isProduction() gate skips save() + saveSession() | localAuth.ts |
| localAuth.getAllUsers returns empty list in production | isProduction() gate | localAuth.ts |
| AuthContext fallback to localAuth blocked in production | process.env.NODE_ENV check in 4 locations | AuthContext.tsx |
| Honeypot field on contact form | Zod schema rejects any non-empty _hp value | messages/route.ts |

### Server-Side Admin Boundary

- requireAdmin() in server-auth.ts verifies both:
  1. A valid Firebase ID token (cryptographic proof of identity)
  2. The Firestore users/{uid} document contains role admin
- Client-side role parameters in request bodies are not trusted - the server reads the role from Firestore directly

### API Route Security Posture

| Route | Methods | Auth | Validation | Rate-Limit Tier |
|---|---|---|---|---|
| /api/providers | GET | - | - | default (100/15m) |
| /api/bookings | GET, POST | Firebase token | createBookingSchema | moderate (30/15m) |
| /api/reviews | POST | Firebase token | createReviewSchema | moderate (30/15m) |
| /api/messages | POST | - | contactSchema + honeypot | moderate (30/15m) |
| /api/payments | GET, PATCH, DELETE | Firebase token | updatePaymentSchema | moderate (30/15m) |
| /api/me/pets | GET, POST | Firebase token | createPetSchema | moderate (30/15m) |
| /api/me/favorites | GET, POST, DELETE | Firebase token | createFavoriteSchema | moderate (30/15m) |
| /api/me/account | DELETE | Firebase token | - | strict (10/15m) |
| /api/auth/delete-user | POST | Admin token | deleteUserSchema | strict (10/15m) |
| /api/admin/payments/batch-fee-collect | POST | Admin token | batchFeeCollectSchema | moderate (30/15m) |
| /api/admin/users/[userId]/details | GET | Admin token | - | default (100/15m) |

---

## Security Audit Trail

| Document | Scope | Date |
|---|---|---|
| AUDIT-REPORT.md | Targeted P0 security audit (TOCTOU, body size bypass, auth orphan) | 2026-06-10 |
| SCALABILITY-AUDIT.md | High-concurrency scalability audit (5 vectors, 10 findings) | 2026-06-10 |
| AGENTS.md | Persistent memory - Firestore-REST debug notes, deployment rules | Ongoing |

---

## Current State (d6e74f2)

### Completed

- Firebase Auth with Google Sign-In + email/password
- Provider directory with rich profiles (services, products, availability, reviews)
- Booking system with atomic slot reservation (deterministic doc ID + .create())
- Pet profile management (CRUD via /api/me/pets)
- Favourites system (toggle, list, filter)
- 1-5 star reviews with provider rating aggregation
- Contact form with honeypot anti-spam
- Admin dashboard (6 tabs, paginated, role-gated)
- bcryptjs password hashing (12 rounds)
- Zod input validation on all mutation routes
- Stream-level body size enforcement (readBoundedBodyJSON, 100 KB)
- Rate limiting (middleware + per-route) with 3 tiers
- OAuth2 token caching with mutex (see firestore-admin-rest.ts)
- Content Security Policy + security headers
- Generic exception masking on all API routes
- Server-side admin role verification (Firestore-backed)
- Production isolation for localAuth (all writes blocked, no localStorage)
- Account deletion with cascading cleanup (Auth-first order)
- encodeURIComponent in docUrl() (path traversal prevention)
- 30-day session expiry + token freshness checks

### Known Gaps

- InMemoryStore rate limiter does not share state across serverless instances (needs Redis)
- Review aggregation writes to a single provider document (write hotspot - Cloud Function planned)
- Admin fetchCollection ignores pagination (silently truncates at approx. 300 docs)
- Account deletion runs synchronously (timeout risk at scale - background queue planned)
- No server-side aggregation queries for analytics (full collection fetches)
- Firestore REST fetch calls lack HTTP keep-alive pooling
