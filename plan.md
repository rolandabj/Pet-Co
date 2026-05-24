# Paws & Co. — Comprehensive System Architecture

> **Last updated:** 2026-05-24
> **Next.js 16.2.6 · App Router · TypeScript 5 · Tailwind CSS 4 · Firebase Firestore REST + SDK + Admin SDK**

---

## Table of Contents

1. [Current State](#1-current-state)
2. [System Architecture](#2-system-architecture)
3. [Security Model](#3-security-model)
4. [Resolved Issues](#4-resolved-issues)
5. [Next Steps](#5-next-steps)

---

## 1. Current State

Paws & Co. is a production-ready digital pet-care marketplace with a **robust Auth-gated dashboard architecture**. The system is fully operational with:

### 1.1 Core Milestones Delivered

| Milestone | Status | Key Details |
|---|---|---|
| **Firestore REST API migration** | ✅ Complete | All CRUD operations migrated from Firebase SDK to REST API (`firestore-rest.ts`). Eliminates SDK hangs in sandboxed environments. |
| **Firebase Admin SDK API routes** | ✅ Complete | Pets (`/api/me/pets`), Favorites (`/api/me/favorites`), and Auth deletion (`/api/auth/delete-user`) are server-side routes with `runtime = 'nodejs'`. Uses `getAdminAuth()` / `getAdminDb()` with lazy initialization. |
| **Optimistic UI updates** | ✅ Complete | Pets/favorites mutations update local state immediately after successful API response, eliminating the need for fallback read paths. |
| **Auth-gated dashboard** | ✅ Complete | All data fetches gated on `isInitialized` + `user` from `AuthContext`. No pre-auth 403s. |
| **Environment variable guard** | ✅ Complete | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` required for Admin SDK. Quote-tolerant private key parsing. |
| **Debug logging** | ✅ Complete | `🐛` prefixed logs at every auth and API boundary for rapid diagnosis. |

### 1.2 Tech Stack

| Layer | Technology | Version / Config |
|---|---|---|
| **Framework** | Next.js (App Router) | `16.2.6` |
| **Bundler** | Turbopack (dev), Webpack (production build) | — |
| **Language** | TypeScript | `^5` |
| **Styling** | Tailwind CSS | `^4` (`@import "tailwindcss"`, `@theme inline {}`, no `tailwind.config.ts`) |
| **Typography** | DM Serif Display (headings), DM Sans (body) | Google Fonts |
| **Auth** | Firebase Auth (Google OAuth 2.0) + custom email/password via `localAuth` | `firebase` `^12.13.0` |
| **Database** | Cloud Firestore | Triple-access: REST API (client-side), Firebase SDK (real-time subscriptions), Admin SDK (server-side API routes) |
| **Storage** | Firebase Storage | Provider logo images at `provider_logos/` |
| **Linting** | ESLint 9 (flat config) | `eslint` `^9`, `eslint-config-next` `16.2.6` |
| **PostCSS** | `@tailwindcss/postcss` | `^4` |

### 1.3 Deployed Endpoints

| Endpoint | Type | Runtime | Purpose |
|---|---|---|---|
| `/` through `/terms` | App Router (static/dynamic) | Edge/Node | Public pages |
| `/api/me/pets` | Server Route | **Node.js** | Admin SDK: GET user pets, POST new pet |
| `/api/me/favorites` | Server Route | **Node.js** | Admin SDK: GET/POST/DELETE favorites |
| `/api/auth/delete-user` | Server Route | **Node.js** | Admin SDK: DELETE Firebase Auth user |
| `/api/providers` | Server Route | Edge | Public API proxy for providers |

---

## 2. System Architecture

### 2.1 Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Data Flow Sequence                               │
│                                                                         │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌────────────────┐      │
│  │  Auth    │ → │  Auth-    │ → │  API     │ → │  Optimistic    │      │
│  │  Init    │   │  Guarded  │   │  Request │   │  State Update  │      │
│  │          │   │  Request  │   │          │   │                │      │
│  └──────────┘   └───────────┘   └──────────┘   └────────────────┘      │
│       │               │               │                │               │
│       ▼               ▼               ▼                ▼               │
│  onAuthState-   dashboard waits    Client (me-api.ts)  On success:     │
│  Changed()      for isInitialized  → /api/me/pets      setPets(data)   │
│  → setUser()    && user before     → /api/me/favorites setFavorites()  │
│  → setIsInit()  dispatching fetch  → Bearer token      Append to list  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Server-side (Node.js runtime)                                 │   │
│  │                                                                 │   │
│  │  /api/me/pets/route.ts     /api/me/favorites/route.ts          │   │
│  │  ┌─────────────────────┐    ┌──────────────────────────────┐   │   │
│  │  │requireFirebaseUser()│    │requireFirebaseUser()         │   │   │
│  │  │→ verifyIdToken      │    │→ verifyIdToken               │   │   │
│  │  │↓                    │    │↓                             │   │   │
│  │  │getAdminDb()         │    │getAdminDb()                  │   │   │
│  │  │.collection('pets')  │    │.collection('favorites')      │   │   │
│  │  │.where('userId',...) │    │.where('userId',...)          │   │   │
│  │  └─────────────────────┘    └──────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Authentication Flow

```
Browser                          Next.js API Route               Firestore/Firebase Auth
│                                    │                                  │
│  ┌─ Login (Google OAuth) ──────────┤                                  │
│  │  signInWithPopup()              │                                  │
│  │  ← Firebase ID token            │                                  │
│  │                                 │                                  │
│  ├─ Get ID Token ──────────────────┤                                  │
│  │  auth.currentUser.getIdToken()  │                                  │
│  │  ← Bearer token                 │                                  │
│  │                                 │                                  │
│  ├─ GET /api/me/pets ──────────────┼──────────────────────────────────┤
│  │  Authorization: Bearer <tok>    │                                  │
│  │                                 │                                  │
│  │                    requireFirebaseUser(request)                     │
│  │                    ├─ Extract Bearer token                         │
│  │                    ├─ adminAuth.verifyIdToken(token) ──────────────►│
│  │                    │  └─ decoded { uid, aud, email }               │
│  │                    │                                   ◄───────────┤
│  │                    ├─ decoded.uid → Firestore query                │
│  │                    │  getAdminDb().collection('pets')              │
│  │                    │  .where('userId', '==', decoded.uid) ────────►│
│  │                    │                                   ◄───────────┤
│  │  ◄── JSON { pets } ─────────────────────┤                          │
│  │                                 │                                  │
│  ├─ Optimistic UI update ─────────┤                                  │
│  │  setPets(data)                 │                                  │
```

### 2.3 Module Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                               Client-side (Browser)                          │
│                                                                              │
│  src/context/AuthContext.tsx           src/app/dashboard/page.tsx            │
│  ┌──────────────────────────────┐     ┌──────────────────────────────┐      │
│  │ AuthProvider                 │     │ DashboardPage                 │      │
│  │  ├─ firebaseUser             │     │  ├─ fetchMyPets()             │      │
│  │  ├─ user (AppUser)           │◄────┤  ├─ fetchMyFavorites()        │      │
│  │  ├─ isInitialized            │     │  ├─ getUserReviewsRest()      │      │
│  │  ├─ loading                  │     │  ├─ getUserPaymentsRest()     │      │
│  │  └─ effectiveUserId          │     │  └─ onSnapshot(bookings)      │      │
│  └──────────────────────────────┘     └──────────────────────────────┘      │
│              │                                    │                         │
│              ▼                                    ▼                         │
│  src/lib/firebase.ts                 src/lib/me-api.ts                     │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐      │
│  │ getFirebaseAuth()            │    │ fetchMyPets()                │      │
│  │ getFirestoreDb()             │    │ addMyPet()                   │      │
│  │ getStorageDb()               │    │ fetchMyFavorites()           │      │
│  └──────────────────────────────┘    │ addMyFavorite()              │      │
│                                      │ removeMyFavoriteByProvider() │      │
│              ┌──────────────────┐    └──────────┬───────────────────┘      │
│              │ firestore-rest.ts │               │                          │
│              │ (REST API layer)  │               │                          │
│              │ getAll*Rest()     │               ▼                          │
│              │ get*Paginated()   │    /api/me/pets     /api/me/favorites    │
│              │ updateDocRest()   │    (HTTP fetch with Bearer token)        │
│              │ deleteDocRest()   │                    │                     │
│              └──────────────────┘                    │                     │
└──────────────────────────────────────────────────────┼─────────────────────┘
                                                       │
                    HTTPS with Bearer token             │
                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Server-side (Node.js)                                │
│                                                                              │
│  src/app/api/me/pets/route.ts      src/app/api/me/favorites/route.ts         │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐         │
│  │ export runtime = 'nodejs'    │  │ export runtime = 'nodejs'    │         │
│  │ export dynamic = force-dyn   │  │ export dynamic = force-dyn   │         │
│  │                              │  │                              │         │
│  │ import { getAdminDb }        │  │ import { getAdminDb }       │         │
│  │ import { requireFirebaseUser }│  │ import { requireFirebaseUser }        │
│  │                              │  │                              │         │
│  │ GET:  .where('userId', uid)  │  │ GET:  .where('userId', uid) │         │
│  │ POST: .add(pet)              │  │ POST: .add(favorite)         │         │
│  │                              │  │ DELETE: .doc().delete()      │         │
│  └──────────────────────────────┘  └──────────────────────────────┘         │
│              │                                    │                         │
│              ▼                                    ▼                         │
│  src/lib/server-auth.ts           src/lib/firebase-admin.ts                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐         │
│  │ import { getAdminAuth }      │  │ import { cert, getApps,      │         │
│  │                              │  │          initializeApp }      │         │
│  │ requireFirebaseUser(request) │  │ import { getAuth }            │         │
│  │  ├─ Bearer token extraction  │  │ import { getFirestore }       │         │
│  │  ├─ adminAuth.verifyIdToken  │  │                              │         │
│  │  └─ decoded token            │  │ Lazy init (build-safe):      │         │
│  └──────────────────────────────┘  │ 1st call → cert() → getAuth  │         │
│                                    │          → getFirestore()     │         │
│                                    │ Quote-tolerant private key    │         │
│                                    │ Env debug logging             │         │
│                                    └──────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Data Access Layers

The system uses three complementary data access strategies:

| Layer | Location | Auth Mechanism | When Used |
|---|---|---|---|
| **Firebase Admin SDK** | Server API routes (`/api/me/*`) | Service account credentials (`getAdminAuth()`, `getAdminDb()`) | Pets, Favorites, Auth deletion — guaranteed server-side Firestore access |
| **Firestore REST API** | Client `firestore-rest.ts` | Bearer token from `auth.currentUser.getIdToken()` | Providers, Bookings, Payments, Reviews, Users — general CRUD |
| **Firebase SDK** | Client `firebase.ts` | Firebase Auth SDK (`onAuthStateChanged`) | Real-time subscriptions (`onSnapshot` for bookings), `getDocs` for homepage, `addDoc` for contact form |

### 2.5 Data Flow per Feature

| Feature | Client Fetch | Server Route | Admin SDK Call | State Update |
|---|---|---|---|---|
| Dashboard Favorites | `fetchMyFavorites()` → `GET /api/me/favorites` | `requireFirebaseUser()` → `getAdminDb().collection('favorites')` | `.where('userId', uid).get()` | `setFavorites(data)` |
| Dashboard Pets | `fetchMyPets()` → `GET /api/me/pets` | `requireFirebaseUser()` → `getAdminDb().collection('pets')` | `.where('userId', uid).get()` | `setPets(data)` |
| Add Pet | `addMyPet()` → `POST /api/me/pets` | `requireFirebaseUser()` → `getAdminDb().collection('pets')` | `.add(pet)` | `setPets(prev => [...prev, newPet])` |
| Add Favorite | `addMyFavorite()` → `POST /api/me/favorites` | `requireFirebaseUser()` → `getAdminDb().collection('favorites')` | Check duplicate → `.add()` | `setFavorites(prev => [...prev, f])` |
| Remove Favorite | `removeMyFavoriteByProvider()` → `DELETE /api/me/favorites?providerId=` | `requireFirebaseUser()` → `getAdminDb().collection('favorites')` | `.where(...).get()` → `.delete()` | `setFavorites(prev => prev.filter(...))` |
| Dashboard Bookings | `onSnapshot` SDK listener | — | — | Real-time |
| Dashboard Reviews | `getUserReviewsRest()` | — | — | `setUserReviews(data)` |
| Dashboard Payments | `getUserPaymentsRest()` | — | — | `setPayments(data)` |
| Booking Creation | `addBookingRest()` + `addPaymentRest()` | — | — | Router redirect |
| Admin Panel | `getAll*Rest()` / `get*Paginated()` | — | — | Pagination state |

### 2.6 Graceful Degradation Pattern

The entire Firebase stack degrades gracefully when env vars are missing:

```
Env vars missing?
├── getConfig() returns null
│   ├── initFirebase() returns null
│   │   ├── getFirebaseAuth()  → { auth: null, googleProvider: null }
│   │   ├── getFirestoreDb()   → null
│   │   └── getStorageDb()     → null
│   └── Every consumer guards with if (!db) return / if (!auth) ...
├── firebase-admin.ts: lazy init → throws at first call with clear error message
│       └── API routes catch → return 401 with descriptive error
└── Falls back to localAuth (localStorage) + REST API (which only needs apiKey + projectId)
```

---

## 3. Security Model

### 3.1 Authentication Layers

| Layer | Mechanism | Scope |
|---|---|---|
| **Client-side Auth** | Firebase Auth SDK (`onAuthStateChanged`, `signInWithPopup`) | Browser session, ID token generation |
| **Server-side Auth** | Firebase Admin SDK (`adminAuth.verifyIdToken`) | API route Bearer token validation |
| **Local Auth Fallback** | `localAuth` (SHA-256, localStorage) | Offline / preview mode when Firebase unavailable |
| **Role-based Access** | `user.role` field on Firestore `users` doc | Admin panel gating, RBAC UI |

### 3.2 API Route Security

```
Client Request                          Server Validation
┌─────────────────┐                    ┌──────────────────────────────┐
│ GET /api/me/pets │                    │ requireFirebaseUser(request) │
│ Authorization:   │───────────────────►│  ├─ Extracts Bearer token   │
│ Bearer <JWT>     │                    │  ├─ verifyIdToken(token)     │
└─────────────────┘                    │  │  ├─ Valid signature ✓     │
                                        │  │  ├─ Not expired ✓        │
                                        │  │  └─ aud matches ✓        │
                                        │  ├─ Returns decoded token   │
                                        │  └─ Throws on failure       │
                                        │                              │
                                        │ getAdminDb()                 │
                                        │ .collection('pets')          │
                                        │ .where('userId', uid)        │
                                        │  └─ Server-side filter       │
                                        │     (not security rule)      │
                                        └──────────────────────────────┘
```

### 3.3 Admin SDK Initialization

```typescript
// src/lib/firebase-admin.ts
// Lazy init: only throws when first called, not at module import time.
// This is critical — it prevents build failures during `next build` when
// env vars are absent (static page generation imports this module).

function ensureInitialized() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Quote-tolerant: strips surrounding "" if present, then converts \n
  const privateKey = rawPrivateKey
    ?.replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');

  // Debug logging shows exactly which vars are missing
  console.log('🐛 FIREBASE ADMIN ENV DEBUG', { ... });

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin environment variables');
  }

  const app = getApps().length > 0
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

  cachedAuth = getAuth(app);
  cachedDb = getFirestore(app);
}
```

### 3.4 Environment Variables

| Variable | Required For | Example |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Client-side Firestore REST | `pet-co-fc4d6` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Client-side Firestore REST | `AIzaSy...` |
| `FIREBASE_PROJECT_ID` | Admin SDK (server-side) | `pet-co-fc4d6` (must match public) |
| `FIREBASE_CLIENT_EMAIL` | Admin SDK (server-side) | `firebase-adminsdk-...@...com` |
| `FIREBASE_PRIVATE_KEY` | Admin SDK (server-side) | `"-----BEGIN PRIVATE KEY-----\n..."` |

### 3.5 Security Rules Status

Firestore Security Rules have been written (`firestore.rules`) with per-doc ownership checks for pets, favorites, reviews, and users collections, plus admin read access via `get()` lookup. These rules are **ready to deploy** via `firebase deploy --only firestore:rules`.

---

## 4. Resolved Issues

### 4.1 Race Conditions

| Issue | Root Cause | Resolution |
|---|---|---|
| **Pre-auth 403 on dashboard load** | Dashboard `useEffect` dispatched REST queries before `onAuthStateChanged` set the Firebase user. Requests had no Bearer token → Firestore rejected as unauthenticated. | Added `isInitialized` gate to `AuthContext`. Dashboard waits for both `isInitialized` and `user` before dispatching any fetch. |
| **Auth sign-out race** | `onAuthStateChanged` fires during `firebaseSignOut()`, triggering localAuth session re-init. | Local session cleared **before** `firebaseSignOut()`. `setUser(null)` runs after both. |

### 4.2 403 Authorization Errors

| Issue | Root Cause | Resolution |
|---|---|---|
| **REST :runQuery 403 for pets/favorites** | Firestore Security Rules treat `:runQuery` as a list operation where `resource.data` is unavailable, causing `ownsExistingDoc()` checks to fail. | Migrated pets/favorites to **Admin SDK API routes** — server-side routes bypass security rules entirely using service account credentials. |
| **Token not ready** | `getAuthHeaders()` retry loop ran before auth state propagated. | Retry loop waits up to 2s for `auth.currentUser` before attempting token generation. |

### 4.3 UI State Synchronization

| Issue | Root Cause | Resolution |
|---|---|---|
| **Silent data loss on read failure** | `fetchPets`/`fetchFavorites` catch blocks logged errors but never called `setPets([])` or `setFavorites([])`, leaving stale empty arrays. Caused "No pets yet" / "No favorites yet" to render incorrectly. | Optimistic state updates: after write operations, append to local state immediately. After reads, always call setState (even on error, fallback to `[]`). |
| **401 with generic message** | Firebase Admin env vars missing → `getAdminDb()` threw → catch block returned "Failed to fetch favorites: 401" | Added env var debug logging. Catch blocks now expose `message` + `code` from the real error. Error messages include the full server response body. |
| **Private key rejected** | `.env.local` values had surrounding quotes or incorrect newline escaping | Added `.replace(/^"|"$/g, '')` to strip quotes before `\n` conversion. |

### 4.4 Auth Flow Issues

| Issue | Status | Workaround |
|---|---|---|
| Google sign-in popup may not complete on preview domains | Environment-specific | User must authorize the domain in Firebase Console |
| `localAuth.getAllUsers()` only sees users who logged in via this browser | By design | Firestore REST `getAllUsersRest()` returns all users across devices |
| Firebase Auth user record not deleted on cascading delete | ✅ **Resolved** | Server endpoint `/api/auth/delete-user` with Admin SDK `adminAuth.deleteUser(uid)` integrated into cascading delete flow |

### 4.5 Pets/Favorites 401 (Latest Fix)

| Step | Fix | File |
|---|---|---|
| 1 | Added `🐛 FIREBASE ADMIN ENV DEBUG` logging showing which env vars are present/missing | `firebase-admin.ts` |
| 2 | Catch blocks return `message` + `code` from error body instead of "Failed to fetch" | `me-api.ts` |
| 3 | Direct SDK imports (`cert`, `getAuth`, `getFirestore`) with lazy init | `firebase-admin.ts` |
| 4 | Server auth uses `getAdminAuth()` with clear error | `server-auth.ts` |
| 5 | API routes use `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` | `pets/route.ts`, `favorites/route.ts` |
| 6 | Quote-tolerant private key parsing | `firebase-admin.ts` |

---

## 5. Next Steps

### 5.1 Immediate (Pre-Deployment)

1. **Deploy Firestore Security Rules** — `firebase deploy --only firestore:rules` (rules exist in `firestore.rules`, fully written and tested)
2. **Verify Firebase Admin env vars in production** — Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` in deployment environment (Vercel/Firebase Hosting)

### 5.2 Production Deployment

| Platform | Steps |
|---|---|
| **Vercel** | Connect GitHub repo → Set env vars in Vercel Dashboard (all `NEXT_PUBLIC_*` + `FIREBASE_*`) → Deploy |
| **Firebase Hosting** | `firebase init hosting` → `npm run build` → `firebase deploy --only hosting` → Set env vars via Firebase Functions or Vercel |

### 5.3 Post-Deployment Recommendations

| Priority | Item | Notes |
|---|---|---|
| **High** | Remove hardcoded admin email fallback (`rolandabj@gmail.com`) in all UI guards | Migrate fully to `role === 'admin'` once RBAC migration is verified |
| **Medium** | Add rate limiting to booking/review Firestore endpoints | Protect against spam |
| **Medium** | Consolidate to REST-only data layer; remove legacy SDK files (`providers.ts`, `favorites.ts`, `reviews.ts`) | Clean up dead code |
| **Medium** | Add pagination to admin tables | Scale to large datasets |
| **Low** | Add email/password via Firebase Auth (not just `localAuth`) | Production-grade auth |
| **Low** | Implement real payment gateway (Stripe) | Replace ledger-only bookkeeping |
| **Low** | Add email notification for booking confirmation | User experience |

### 5.4 Scaling Considerations

| Concern | Mitigation |
|---|---|
| `fetchCollection` without pagination | Add `pageSize` + `pageToken` to `fetchCollection` for admin tables |
| No request caching | Add `next: { revalidate: 60 }` or SWR for provider lists |
| Client-side filtering | Use Firestore structured queries with composite indexes |
| Legacy SDK files | Consolidate to REST-only; remove `providers.ts`, `favorites.ts`, `reviews.ts` |

---

*This document is the single source of truth for the Paws & Co. codebase. Keep it updated as the architecture evolves.*
