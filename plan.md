# Paws & Co. — Comprehensive Architecture Brain Dump

> **Last updated:** 2026-05-24  
> **Next.js 16.2.6 · App Router · TypeScript 5 · Tailwind CSS 4 · Firebase Firestore REST + SDK**

---

## Table of Contents

1. [Project Overview & Core Architecture](#1-project-overview--core-architecture)
2. [Authentication Ecosystem](#2-authentication-ecosystem)
3. [Database & Data Layer](#3-database--data-layer)
4. [Feature Manifest](#4-feature-manifest)
5. [Directory Map](#5-directory-map)
6. [Vulnerabilities, Technical Debt & Next Steps](#6-vulnerabilities-technical-debt--next-steps)

---

## 1. Project Overview & Core Architecture

### 1.1 Identity & Purpose

| Property | Value |
|---|---|
| **Name** | Paws & Co. |
| **Type** | Digital pet-care marketplace |
| **Users** | Pet Owners (`role: owner`), Service Providers (`role: provider`), Super Admins (`role: admin`) |
| **Business Model** | Commission-based (10% platform fee on bookings), ledger-only (no real payment gateway) |
| **Domain** | Multi-preview proxied via `work-*.prod-runtime.all-hands.dev` → localhost:12000 |

### 1.2 Tech Stack

| Layer | Technology | Version / Config |
|---|---|---|
| **Framework** | Next.js (App Router) | `16.2.6` |
| **Bundler** | Turbopack (dev), Webpack (production build) | — |
| **Language** | TypeScript | `^5` |
| **Styling** | Tailwind CSS | `^4` (`@import "tailwindcss"`, `@theme inline {}`, no `tailwind.config.ts`) |
| **Typography** | DM Serif Display (headings), DM Sans (body) | Google Fonts |
| **Auth** | Firebase Auth (Google OAuth 2.0) + custom email/password via `localAuth` | `firebase` `^12.13.0` |
| **Database** | Cloud Firestore | Dual-access: Firestore REST API (primary) + Firebase SDK (selective) |
| **Storage** | Firebase Storage | Provider logo images at `provider_logos/` |
| **Linting** | ESLint 9 (flat config) | `eslint` `^9`, `eslint-config-next` `16.2.6` |
| **PostCSS** | `@tailwindcss/postcss` | `^4` |

### 1.3 Server vs Client Component Strategy

| Route | Server Component Work | Client Component Work |
|---|---|---|
| `/` (Home) | — (fully client-side) | Firestore SDK `getDocs` for provider counts + testimonials |
| `/services` | REST fetch all providers, filter by `?type=` | `ServicesClient`: keyword search, filter chips, grid render |
| `/provider/[id]` | REST fetch provider + reviews via `provider-rest.ts` | `ProviderClient`: reviews CRUD, favorites, products, booking CTA, contact masking |
| `/booking` | — (fully client-side) | Slot engine, 10% fee calc, collision detection, pet selection |
| `/login` | — (fully client-side) | Google OAuth popup + redirect, email/password form |
| `/register` | — (fully client-side) | Role selector, email + Google flows |
| `/dashboard` | — (fully client-side) | `onSnapshot` live bookings, payments, pets, reviews |
| `/admin` | — (fully client-side) | Full CRUD modals, cascading deletes, analytics |
| `/about` | Static page | — |
| `/contact` | — (fully client-side) | Firestore SDK `addDoc` for contact messages |

### 1.4 Graceful Degradation Pattern

The entire Firebase stack degrades gracefully when env vars are missing:

```
Env vars missing?
├── getConfig() returns null
│   ├── initFirebase() returns null
│   │   ├── getFirebaseAuth()  → { auth: null, googleProvider: null }
│   │   ├── getFirestoreDb()   → null
│   │   └── getStorageDb()     → null
│   └── Every consumer guards with if (!db) return / if (!auth) ...
└── Falls back to localAuth (localStorage) + REST API (which only needs apiKey + projectId)
```

- `(window as any).__firebase_warned__` flag ensures the warning fires only once.
- No crash paths exist when Firebase is absent.
- Homepage, provider lists, and basic auth all work with local-only data.

### 1.5 Next.js 16 Specifics

- **`next.config.ts`** uses `allowedDevOrigins` array (parsed from `ALLOWED_DEV_ORIGINS` env var, comma-separated) to fix React hydration on proxied preview domains.
- **Image optimization:** `remotePatterns` configured for `firebasestorage.googleapis.com` — remote images from Storage render on `/provider/[id]` product showcase.
- **`force-dynamic`** on `/provider/[id]/page.tsx` bypasses full-route cache so provider edits appear instantly.
- **Turbopack root:** Explicitly set via `turbopack: { root: path.resolve(__dirname) }`.

---

## 2. Authentication Ecosystem

### 2.1 AuthProvider Architecture (`src/context/AuthContext.tsx`)

#### State Machine

```
┌─────────────────────────────────────────────────────────┐
│  AuthProvider                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  useEffect([], [])                                │   │
│  │  ├─ onAuthStateChanged(auth, fbUser)              │   │
│  │  │   ├─ fbUser exists? → setSessionFromFirebase() │   │
│  │  │   │                    → initUser(fbUser)       │   │
│  │  │   └─ fbUser null?    → localAuth fallback      │   │
│  │  │                        OR setUser(null)         │   │
│  │  └─ Firebase unavail?   → localAuth fallback      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  googleLogin(role?)                                     │
│  ├─ getExistingRole(uid) from Firestore (timeout 4s)   │
│  ├─ getRedirectResult (timeout 5s)                     │
│  ├─ signInWithPopup (timeout 60s)                      │
│  ├─ handleCredential(credential)                       │
│  │   ├─ resolvedRole = existingRole ?? role ?? 'owner' │
│  │   ├─ setUser(appUser) + setLoading(false)           │
│  │   └─ persistNewUser() if first-time                 │
│  └─ Error recovery:                                    │
│      ├─ cancelled       → silent return                │
│      ├─ popup-blocked   → signInWithRedirect fallback  │
│      ├─ timeout         → domain auth instructions     │
│      └─ unauth-domain   → Firebase Console instruction │
│                                                         │
│  login(email, password)                                 │
│  └─ localAuth.login() → setUser() + setLoading(false)  │
│                                                         │
│  register(email, password, name, role)                  │
│  ├─ localAuth.register() → setUser() + setLoading()    │
│  ├─ updateUserDocRest() — persist role to Firestore    │
│  └─ createProviderRest() — auto-provider doc for new   │
│       providers                                         │
│                                                         │
│  logout()                                               │
│  ├─ localAuth.logout() (BEFORE Firebase signOut)       │
│  ├─ firebaseSignOut(auth)                              │
│  └─ setUser(null) + setFirebaseUser(null)              │
└─────────────────────────────────────────────────────────┘
```

#### Key Design Decisions

| Decision | Rationale |
|---|---|
| `setUser()` called **before** Firestore enhancement in `initUser()` | Prevents flash-of-logged-out state on page reload |
| `localAuth.logout()` runs **before** `firebaseSignOut()` | Race condition: `onAuthStateChanged` fires during sign-out; local session must already be cleared so it doesn't re-initiate a session |
| `handleCredential` checks Firestore for existing role before routing | Returning users never see role-selection screen; role is immutable once set |
| `setLoading(false)` in `initUser` when `getFirestoreDb()` returns null | Prevents infinite spinner on dashboard after Google sign-in page reload |
| `timeout()` wrapper on all Firestore SDK calls | Firebase SDK `getDoc`/`getRedirectResult` can hang indefinitely in sandboxed environments |
| `persistNewUser()` is fire-and-forget | User sees dashboard immediately; Firestore write happens in background |

### 2.2 LocalAuth Module (`src/lib/localAuth.ts`)

| Feature | Detail |
|---|---|
| **Storage** | `localStorage`: `paws_users` (all registered), `paws_session` (current) |
| **Password hashing** | SHA-256 via `crypto.subtle.digest()` — Web Crypto API |
| **User ID format** | `user_<timestamp>` for email/password, Firebase `uid` or `google_<timestamp>` for Google |
| **API surface** | `register`, `login`, `logout`, `getCurrentUser`, `isLoggedIn`, `setSessionFromFirebase`, `updateProfile`, `getAllUsers`, `deleteUser`, `clearSession` |
| **Role sync** | `setSessionFromFirebase(firebaseUser, role?)` persists the resolved role to `localStorage` |
| **Google user tracking** | `setSessionFromFirebase` saves Google-authenticated users into `paws_users` so the admin panel can see them |
| **`getAllUsers()`** | Strips password field before returning — used by admin panel |

### 2.3 Admin Email → RBAC Migration

#### Current State (Dual-Auth Guard)

All admin-gated UI points use:
```typescript
user?.role === 'admin'  ||  user?.email === 'rolandabj@gmail.com'
```

This is a transitional pattern — the hardcoded email fallback ensures zero downtime while migrating to role-based access.

#### Files using the dual-auth guard

| File | Line(s) | Purpose |
|---|---|---|
| `src/app/admin/page.tsx` | 49-51 (isAdminUser function) | Admin panel gate |
| `src/components/Navbar.tsx` | 62, 117 | Desktop + mobile Admin link visibility |
| `src/app/dashboard/page.tsx` | ~365 | Sidebar Admin link |
| `src/app/provider/[id]/ProviderClient.tsx` | 29 | Contact information unmasking bypass |

#### Migration Status

| Step | Status |
|---|---|
| `UserRole` type expanded to include `'admin'` | ✅ Done |
| Dual-auth guards in all UI components | ✅ Done |
| Firestore `users` collection for `rolandabj@gmail.com` stamped with `role: 'admin'` | ✅ Done (4 docs updated) |
| Migration script `scripts/make-admin.ts` | ✅ Done (supports email + name lookup) |
| Cleanup: remove email fallback from all guards | ⏳ Future |
| Firebase Auth user deletion from admin panel | ⏳ Not yet implemented |

### 2.4 Known Auth Issues

| Issue | Status | Workaround |
|---|---|---|
| `onAuthStateChanged` + `googleLogin` double-init | Mitigated | `handleCredential` sets user + loading before returning; on page reload, `initUser` handles the second init |
| Google sign-in popup may not complete on preview domains | Environment-specific | User must authorize the domain in Firebase Console (Authentication → Settings → Authorized domains) |
| `localAuth.getAllUsers()` only sees users who logged in via this browser | By design | Firestore REST `getAllUsersRest()` returns all users across devices |
| Firebase Auth user record not deleted on cascading delete | Known gap | Must use Firebase Console or Admin SDK separately |

---

## 3. Database & Data Layer

### 3.1 Dual-Access Strategy

```
┌──────────────────────────────────────────────────────────┐
│                   Data Access Layer                       │
│                                                          │
│  ┌─────────────────────┐    ┌────────────────────────┐   │
│  │  Firestore REST API  │    │  Firebase SDK          │   │
│  │  (firestore-rest.ts) │    │  (firebase.ts + legacy)│   │
│  ├─────────────────────┤    ├────────────────────────┤   │
│  │  • All CRUD ops     │    │  • onSnapshot()        │   │
│  │  • Cascading deletes│    │    (live bookings)     │   │
│  │  • Provider updates  │    │  • getDocs()           │   │
│  │  • Booking/payment   │    │    (homepage counts)   │   │
│  │    operations        │    │  • getDoc()            │   │
│  │  • Review CRUD       │    │    (initUser role)     │   │
│  │  • User management   │    │  • addDoc()            │   │
│  └─────────────────────┘    │    (contact messages)   │   │
│                              │  • signInWithPopup/    │   │
│                              │    Redirect            │   │
│                              └────────────────────────┘   │
│                                                          │
│  Why both? REST avoids SDK hangs in sandboxed preview    │
│  environments. SDK provides real-time subscriptions.     │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Firestore Collections

| Collection | Doc ID | Key Fields | REST Helpers | SDK Usage |
|---|---|---|---|---|
| **`providers`** | Auto-ID or user ID | `name, businessName, type, category, rating, reviews, desc, tags, emoji, price, location, phone, email, logoUrl, services[], products[], availability{}, socialMedia{}, since` | `getAllProvidersRest, getProviderByIdRest, getProviderByEmailRest, updateProviderDocRest, updateProviderByIdRest, createProviderRest, deleteProviderDocRest, deleteProviderAccountRest` | `getDocs` (homepage count), `getDoc` (legacy detail) |
| **`bookings`** | Auto-ID | `providerId, userId, serviceType, date, time, timeSlot, price, currency, platformFee, total, status, customerPhone, customerName, instructions, petId, petName, providerName, providerBusinessName` | `getAllBookingsRest, getBookingsByProviderRest, getBookingsForProviderDateRest, addBookingRest, updateBookingRest, deleteBookingRest` | `onSnapshot` (provider dashboard live feed) |
| **`payments`** | Auto-ID | `bookingId, providerId, customerId, customerName, amount, currency, status, category, createdAt` | `getAllPaymentsRest, getUserPaymentsRest, addPaymentRest, updatePaymentRest, deletePaymentRest` | — |
| **`reviews`** | Auto-ID | `providerId, userId, userName, rating, comment, createdAt` | `getReviewsByProviderRest, getUserReviewsRest, getAllReviewsRest, addReviewRest, updateReviewRest, deleteReviewRest` | `getDocs` (homepage testimonials) |
| **`users`** | Firebase UID or `user_N` | `email, name, phone, photoURL, role, location` | `getAllUsersRest, getUserByIdRest, updateUserDocRest, deleteUserDocRest` | `getDoc` (initUser role fetch) |
| **`pets`** | Auto-ID | `userId, name, type, breed, age` | `getUserPetsRest, addPetRest, deletePetRest` | — |
| **`favorites`** | Auto-ID | `userId, providerId, providerName, category, emoji, rating` | `getUserFavoritesRest, findFavoriteIdRest, addFavoriteRest, removeFavoriteRest` | — |
| **`messages`** | Auto-ID | `name, email, subject, message, userId, createdAt` | — (uses SDK `addDoc`) | `addDoc` |

### 3.3 REST API Layer (`firestore-rest.ts`) — Deep Dive

#### Wire Format Converters

```typescript
// JS → Firestore REST
toFieldValue(v: unknown): Record<string, unknown>
// Handles: string, number (int/double), boolean, null, array, map, Date → timestamp

// Firestore REST → JS
fieldToValue(f: any): any
// Reverse of above
```

#### Query Patterns

| Pattern | Function | How it works |
|---|---|---|
| **Fetch single doc** | `fetchOne(collection, docId, mapFn)` | `GET /documents/{collection}/{docId}` → 404 returns `null` |
| **Fetch collection** | `fetchCollection(collection, filterFn?, mapFn?)` | `GET /documents/{collection}` → client-side filter + map |
| **Fetch where** | `fetchWhere(collection, field, value, mapFn)` | Wraps `fetchCollection` with equality filter — **no composite indexes needed** |
| **PATCH update** | `updateProviderByIdRest`, etc. | `PATCH /documents/{path}?updateMask.fieldPaths=X&updateMask.fieldPaths=Y` |
| **POST create** | `addBookingRest`, etc. | `POST /documents/{collection}` with auto-ID or ?documentId= for explicit ID |
| **DELETE** | `deleteBookingRest`, etc. | `DELETE /documents/{path}` |

#### Error Handling Convention

```typescript
// REST helpers throw on non-OK:
if (!res.ok) throw new Error(`Failed to X: ${res.status}`);

// UI callers wrap in try/catch:
try { ... } catch (err) {
  showToast('❌ Failed to ...', 'error');
}

// Cascading deletes use Promise.allSettled — individual failures don't block others
// Optional steps (doc already deleted) use try/catch with silent ignore
```

### 3.4 Cascading Delete — Service Provider (`deleteProviderAccountRest`)

```
deleteProviderAccountRest(providerId)
│
├─ 1. Query relational documents
│   ├─ bookings WHERE providerId == X
│   ├─ payments WHERE providerId == X
│   ├─ reviews  WHERE providerId == X
│   └─ favorites WHERE providerId == X OR targetId == X
│
├─ 2. Delete all relational documents (Promise.allSettled)
│
├─ 3. Fetch provider doc (for logoUrl + email + name)
│
├─ 4. Delete provider document (ignores 404)
│
└─ Returns: { deletedBookings, deletedPayments, deletedReviews,
               deletedFavorites, logoUrl, userEmail, userName }
```

**Caller (UI) must also:**
1. Delete Storage image at `logoUrl` path via Firebase SDK `deleteObject(ref(storage, path))`
2. Downgrade the associated user's Firestore role to `'owner'` via `updateUserDocRest`

### 3.5 Cascading Delete — Pet Owner (`deleteUserAccountRest`)

```
deleteUserAccountRest(userId)
│
├─ 1. Query relational documents (parallel)
│   ├─ pets       WHERE userId == X
│   ├─ bookings   WHERE userId == X
│   ├─ payments   WHERE customerId == X
│   ├─ reviews    WHERE userId == X
│   └─ favorites  WHERE userId == X
│
├─ 2. Collect unique affectedProviderIds from reviews
│
├─ 3. Delete all relational documents (Promise.allSettled)
│
├─ 4. Recalculate provider ratings for each affectedProviderId
│   └─ recalculateProviderRating(pid)
│       ├─ fetchWhere('reviews', 'providerId', pid)
│       ├─ compute avg = sum(rating) / count
│       └─ updateProviderByIdRest(pid, { reviews, rating })
│
├─ 5. Delete user document (ignores errors)
│
└─ Returns: { deletedPets, deletedBookings, deletedPayments,
               deletedReviews, deletedFavorites, recalculatedProviders }
```

### 3.6 Provider Rating Recalculation Engine

Invoked in **three scenarios**:

| Scenario | Trigger | Function |
|---|---|---|
| Review created | `ProviderClient.handleSubmitReview` | Fetches all reviews → computes avg → `updateProviderByIdRest` |
| Review deleted (admin) | `AdminPage.handleDeleteReview` | `getReviewsByProviderRest` → `updateProviderByIdRest` |
| Review edited (admin) | `AdminPage.handleSaveReview` | Same as delete |
| User account deleted | `deleteUserAccountRest` | `recalculateProviderRating(pid)` for each affected provider |

**Important:** When the **last** review is deleted, rating becomes `0.0` and reviews count becomes `0`.

### 3.7 Booking Conflict Detection

**Location:** `src/app/booking/page.tsx`

```
User selects provider + date
│
├─ getBookingsForProviderDateRest(providerId, date)
│   └─ Fetch all bookings → client-filter by providerId + date
│
├─ Generate time slots from provider.availability × service.duration
│
├─ Remove slots already booked (status: pending | confirmed | completed)
│   └─ Cancelled/declined bookings release their slots
│
└─ Race-condition guard: re-query at submit time, verify slot still free
```

**Known limitation:** Collision detection queries by `providerId` + `date` only. If booking data uses different field naming conventions for provider identification, some conflicts may be missed.

### 3.8 Offline/Static Fallback Data

**Location:** `src/lib/data.ts`
- 12 hardcoded provider entries across 6 service types.
- Used when Firestore is unreachable (env vars missing, network error, sandbox restrictions).
- Provides a fully functional demo experience without any backend.

---

## 4. Feature Manifest

### 4.1 Homepage (`src/app/page.tsx`)

| Feature | Implementation |
|---|---|
| **Dynamic category counts** | Firestore SDK `getDocs(collection(db, 'providers'))` → grouped by `type` → rendered as badges per service card |
| **Live testimonials** | `query(collection(db, 'reviews'), where('rating', '>=', 4), limit(3))` → renders review cards with stars, text, user avatar, "Verified Pet Owner" badge |
| **Stat counters** | Hardcoded (10K+ pet parents, 500+ providers, 98% satisfaction) |
| **CTA flow** | "Find a Service" → `/services`, "Browse Providers" → `/services` |
| **Null safety** | `if (!db) return` prevents crash when Firebase env vars missing |

### 4.2 Services List (`/services`)

| Feature | Implementation |
|---|---|
| **Server-side fetch** | Services page is a server component — REST fetch all providers from Firestore |
| **Filtering** | `?type=` query param → server-side filter → pass filtered list to client |
| **Search** | Client-side keyword matching against `businessName`, `name`, `category`, `tags`, `desc` |
| **Filter chips** | 7 buttons (All + 6 service types), `activeFilter` state controls visual active state |

### 4.3 Provider Profile (`/provider/[id]`)

| Feature | Implementation |
|---|---|
| **Server + Client split** | Server fetches provider + reviews via REST; `ProviderClient` handles interactivity |
| **Cache-busting** | `export const dynamic = 'force-dynamic'` — no route cache |
| **Contact masking** | Phone/email hidden from non-authenticated users; visible only to admin via dual-auth guard |
| **Google Maps link** | Primary: `provider.googleMapsUrl`; Fallback: `https://www.google.com/maps/search/?api=1&query={encoded location}` |
| **Favorite toggle** | Heart button → `findFavoriteIdRest` / `addFavoriteRest` / `removeFavoriteRest` |
| **Review CRUD** | Star rating (1-5) + comment → `addReviewRest` → re-fetch all → update provider rating |
| **Products showcase** | Horizontal scroll grid with Image component, currency formatting, stock badges |
| **Booking CTA** | "Book Now" → `/booking?providerId={id}` with pre-selected provider |

### 4.4 Booking Wizard (`/booking`)

| Feature | Implementation |
|---|---|
| **Provider pre-selection** | Reads `providerId` from URL → pre-fills dropdown + fetches custom services |
| **Pet selection** | `getUserPetsRest(uid)` → dropdown of user's registered pets |
| **Time slot generation** | From `provider.availability` + selected service `duration` → 30/60/90min increments |
| **Slot collision detection** | Fetches existing bookings for provider + date → removes conflicting slots |
| **10% platform fee** | `serviceFee * 0.10` → `serviceFee + platformFee = total` |
| **Booking + Payment creation** | `addBookingRest` + `addPaymentRest` in parallel |
| **Auth guard** | Redirects unauthenticated users to `/login` |

### 4.5 Owner Dashboard (`/dashboard`)

| Tab | Content |
|---|---|
| **Overview** | Upcoming bookings, recent payments, stats cards |
| **Bookings** | Full list with status pills, cancel action, real-time updates via `onSnapshot` |
| **Favorites** | Saved providers list with unfavorite button |
| **Profile** | Name, phone, location edit → `localAuth.updateProfile` + `updateUserDocRest` |
| **Reviews** | User's written reviews |
| **Payments** | Payment history table |
| **Pets** | CRUD for user's pets (name, type, breed, age) |
| **Sidebar Admin link** | Dual-auth guarded (`role === 'admin' \|\| email fallback`) |

**Self-deletion**: Danger Zone in Profile tab → modal requires typing "DELETE" → `deleteUserAccountRest` → `localAuth.logout()` → redirect to `/`.

### 4.6 Provider Dashboard (`/dashboard` → ProviderDashboard.tsx)

| Tab | Content |
|---|---|
| **Overview** | Earnings, active bookings, active listings, average rating, recent bookings table |
| **Services** | CRUD table for `ServiceItem[]`: name, price, duration, currency, description |
| **Products** | CRUD for `ProductItem[]`: name, price, image (Storage upload), stock toggle, currency |
| **Bookings** | Real-time via `onSnapshot` — status transitions (pending → confirmed → completed / cancelled) |
| **Reviews** | All reviews for this provider |
| **Business Profile** | Logo upload (Storage → downloadURL → provider doc), business name, email, phone, location, Google Maps URL, social media links, operational hours (7-day toggle), bio/description |

**Self-deletion**: Danger Zone → `deleteProviderAccountRest` → Storage cleanup → `localAuth.logout()` → redirect to `/`.

### 4.7 Admin Panel (`/admin`)

| Tab | Content |
|---|---|
| **Users** | List from `localAuth.getAllUsers()` + Firestore REST `getAllUsersRest()` — search, delete with cascading cleanup |
| **Services** | Full provider list with cascading delete button (all related data wiped + Storage cleanup + user role downgrade) |
| **Bookings** | Full booking list with status inline edit, cancel, delete — detail modal |
| **Payments** | Full payment ledger with status inline edit, delete — modal with customer profile + provider context + linked booking |
| **Reviews** | Full review list with inline rating/comment edit, delete — recalculates provider aggregates |
| **Analytics** | Monthly bookings bar chart, service distribution chart, revenue MTD — all computed from live Firestore data |

### 4.8 Multi-Currency System

**13 supported ISO codes:** USD, EUR, LBP, GBP, JPY, CNY, AED, SAR, EGP, CHF, INR, AUD, CAD

**Render path:**
1. Provider dashboard selects currency via combo-box input
2. Stored in Firestore as `currency` field on service/product
3. REST mappers read `currency: m.currency?.stringValue ?? 'USD'`
4. `formatProductPrice()` maps code → symbol or falls back to `{amount} {CODE}`
5. Displayed on provider profile retail grid and dashboard product table

### 4.9 Operational Hours Engine

- 7-day checkbox + time input UI in ProviderDashboard
- Data shape: `{ monday: { isOpen: boolean, start: string, end: string }, ... }`
- Persisted to Firestore `availability` map field via standalone save button
- Read by booking page to generate available time slots

---

## 5. Directory Map

```
Pet-Co/
├── plan.md                           ← This file — single source of truth
├── AGENTS.md                         ← OpenHands persistent agent memory
├── CLAUDE.md                         ← Legacy agent memory
├── README.md                         ← Project overview
├── next.config.ts                     ← allowedDevOrigins, images, turbopack
├── package.json                      ← Deps: next 16.2.6, react 19.2.4, firebase ^12.13.0
├── tsconfig.json                     ← TypeScript config (excludes scripts/)
├── postcss.config.mjs                ← PostCSS with @tailwindcss/postcss
├── eslint.config.mjs                 ← ESLint 9 flat config
├── .env.local.example                ← Env var template
│
├── scripts/
│   ├── make-admin.ts                 ← Firestore REST migration: promote user to admin (by email or name)
│   ├── reset-ratings.ts              ← Bulk reset provider ratings to zero
│   └── seed-firestore.ts             ← Initial provider data seeding
│
├── public/                           ← Static assets (favicon, SVGs, placeholders)
│
└── src/
    ├── app/                          ← Next.js App Router
    │   ├── layout.tsx                ← Root: ToastProvider → AuthProvider → Navbar + children + Footer
    │   ├── page.tsx                  ← Homepage (client): category counts, testimonials, hero
    │   ├── globals.css               ← Tailwind 4 @theme, custom keyframes
    │   │
    │   ├── login/
    │   │   └── page.tsx              ← Login form + Google OAuth button
    │   ├── register/
    │   │   └── page.tsx              ← Registration with role selection + Google
    │   │
    │   ├── services/
    │   │   ├── page.tsx              ← [Server] REST-fetch providers, ?type= filter
    │   │   └── ServicesClient.tsx    ← [Client] search, filter chips, card grid
    │   │
    │   ├── provider/
    │   │   └── [id]/
    │   │       ├── page.tsx          ← [Server] REST-fetch provider + reviews, force-dynamic
    │   │       └── ProviderClient.tsx ← [Client] reviews, favorites, products, contact masking
    │   │
    │   ├── booking/
    │   │   └── page.tsx              ← [Client] booking wizard, slot engine, conflict detection
    │   │
    │   ├── dashboard/
    │   │   ├── page.tsx              ← [Client] Owner dashboard: 7 tabs, self-delete
    │   │   └── ProviderDashboard.tsx ← [Client] Provider dashboard: 6 tabs, full CRUD
    │   │
    │   ├── admin/
    │   │   └── page.tsx              ← [Client] Admin panel: 6 tabs, cascading deletes, analytics
    │   │
    │   ├── about/
    │   │   └── page.tsx              ← Static about page
    │   ├── contact/
    │   │   └── page.tsx              ← Contact form → Firestore messages collection
    │   │
    │   └── api/
    │       └── providers/
    │           └── route.ts          ← API proxy: server-side Firestore provider fetch
    │
    ├── components/
    │   ├── Navbar.tsx                ← Fixed nav: logo, links, auth state, mobile hamburger
    │   ├── Footer.tsx                ← 4-column footer: services, company, support, social
    │   └── Toast.tsx                 ← ToastProvider + useToast hook (3s auto-dismiss)
    │
    ├── context/
    │   └── AuthContext.tsx           ← Auth orchestrator: Firebase SDK + localAuth + RBAC
    │
    └── lib/
        ├── types.ts                  ← AppUser, ServiceProvider, ServiceItem, ProductItem, Booking, DaySchedule
        ├── firebase.ts               ← Firebase SDK singleton with null-safe lazy loaders
        ├── localAuth.ts              ← localStorage auth: SHA-256, session persistence, offline fallback
        ├── firestore-rest.ts         ← PRIMARY DATA LAYER: all REST helpers, cascading deletes, converters
        ├── provider-rest.ts          ← Provider REST fetch helpers (legacy, used by provider detail server component)
        ├── formatProductPrice.ts     ← 13-currency formatter with symbol mapping
        ├── data.ts                   ← Static fallback provider data (12 entries)
        ├── providers.ts              ← Legacy Firestore SDK provider helpers
        ├── favorites.ts              ← Legacy Firestore SDK favorite helpers
        └── reviews.ts                ← Legacy Firestore SDK review helpers
```

---

## 6. Vulnerabilities, Technical Debt & Next Steps

### 6.1 Security Gaps

| # | Issue | Severity | Details |
|---|---|---|---|
| **S1** | No Firebase Auth user deletion on cascading delete | **High** | `deleteUserAccountRest` clears Firestore user doc and all relational data, but the Firebase Authentication user record persists. Must use Admin SDK or Firebase Console to fully delete the auth account. |
| **S2** | Review provider-role rejection only at API level | **Medium** | `addReviewRest` checks `data.userRole === 'provider'` and throws, but the client-side UI also checks — malicious user could bypass via direct REST calls. Mitigation: Firestore Security Rules should reject provider reviews at the database level. |
| **S3** | No rate limiting on booking/review endpoints | **Medium** | No throttling anywhere. A bot could spam bookings or reviews. Should add middleware or Firestore Rules with rate limits. |
| **S4** | Admin panel accessible by email fallback | **Low** (Transitional) | Hardcoded `rolandabj@gmail.com` in 4 files. If email changes, all gates break. Migrate fully to `role === 'admin'` once migration is verified. |
| **S5** | API key exposed in client-side REST calls | **Informational** | `NEXT_PUBLIC_FIREBASE_API_KEY` is visible in browser network requests. This is by design — Firebase API keys are meant to be public (Firestore Security Rules enforce real access control). |
| **S6** | No Firestore Security Rules documented or deployed | **High** | All REST calls use the API key with public access. Without deployed Security Rules, any authenticated or unauthenticated user can potentially read/write any document. |

### 6.2 Technical Debt

| # | Item | Impact | Effort |
|---|---|---|---|
| **D1** | Firestore SDK + REST API duality | Confusing to maintain; two code paths for similar operations. Legacy SDK files (`providers.ts`, `favorites.ts`, `reviews.ts`) are rarely used but still exist. | Medium (consolidate to REST-only) |
| **D2** | `localAuth.getAllUsers()` is browser-only | Admin panel only shows users who logged in from that specific browser. Firestore REST `getAllUsersRest()` shows cross-device users but they're not merged in the UI. | Low (merge both sources) |
| **D3** | Hook ordering constraint in booking page | `timeSlots` `useMemo` must be declared before auth guard. Fragile — any reordering will crash with "Rendered fewer hooks than expected." | Low (lift to a sub-component) |
| **D4** | Hardcoded static footer links | Blog, Careers, Press, Terms of Service, Privacy Policy all have `cursor-default` spans instead of real links. | Low (create pages) |
| **D5** | `onSnapshot` unsubscription in ProviderDashboard | The real-time listener is set up with `useEffect(() => { ... return () => unsub(); }, [userId])`. If `userId` changes, the old listener is cleaned up. But `userId` comes from `props`, not from auth context — if auth state changes without `userId` changing, stale listeners could accumulate. | Low |
| **D6** | Payment system is ledger-only | No real payment gateway. All amounts are simulated. `platformFee` is calculated but never actually collected. | High (integrate Stripe/other) |
| **D7** | `plan.md` and `AGENTS.md` duplication | Both files contain overlapping project documentation. `AGENTS.md` focuses on task tracking; `plan.md` is the architecture reference. These should be kept in sync. | Low |

### 6.3 Missing Features

| # | Feature | Priority | Notes |
|---|---|---|---|
| **F1** | Firebase Auth user deletion in cascading delete | High | Admin SDK `admin.auth().deleteUser(uid)` from a Cloud Function or secure server endpoint |
| **F2** | Firestore Security Rules | High | Must restrict: users can only read/write their own data; providers can only update their own profile; admin role has full access |
| **F3** | Email/password via Firebase Auth (not just localAuth) | Medium | Currently, email/password auth only uses `localAuth` (localStorage). In production, should use Firebase `createUserWithEmailAndPassword` / `signInWithEmailAndPassword` |
| **F4** | Provider registration email verification | Medium | No email verification step — anyone can register as a provider. Should add verification. |
| **F5** | Pagination for admin tables | Medium | Admin tables load all documents at once. For large datasets, this will be slow. Add server-side pagination via Firestore REST `pageToken` + `pageSize`. |
| **F6** | Image optimization for product images | Medium | Products use `next/image` but provider logos use raw `<img>` tags. Add `next/image` for logos with proper sizing. |
| **F7** | i18n / multi-language support | Low | All UI is in English. No i18n framework. |
| **F8** | Mobile push notifications | Low | No push notification system for booking updates. |
| **F9** | Real booking confirmation email | Low | No email notification when a booking is made or updated. |

### 6.4 Scaling Bottlenecks

| # | Bottleneck | Impact | Mitigation |
|---|---|---|---|
| **B1** | `fetchCollection` without pagination | All "fetch all" operations load every document in a collection into memory. For `bookings`, `payments`, `reviews`, this will become slow at 10K+ documents. | Add `pageSize` + `pageToken` support to `fetchCollection` |
| **B2** | Client-side filtering (`fetchWhere`) | Uses `fetchCollection` with in-memory `.filter()`. For large collections, this downloads all documents and filters on the client. | Use Firestore structured queries with `runQuery` REST endpoint when composite indexes exist |
| **B3** | `localAuth` localStorage limits | Local storage has ~5-10MB limit. If thousands of users register on the same browser, `paws_users` will overflow. | Not a real concern for single-user dev/preview; production uses Firebase Auth |
| **B4** | No request caching | Every page load triggers a fresh Firestore REST fetch. No SWR, React Query, or Next.js data cache for provider lists. | Add `next: { revalidate: 60 }` for non-critical lists, or implement SWR |

### 6.5 Known Bugs & Quirks

| # | Issue | Status |
|---|---|---|
| **Q1** | `new Date('2024-01-15')` interpreted as UTC → off-by-one day in negative timezone offsets | Fixed via manual date construction |
| **Q2** | Google sign-in popup timeout on preview domains — 60s timeout shows Firebase Console instructions | Documented behavior |
| **Q3** | `initUser()` skipping `setLoading(false)` when `getFirestoreDb()` returns null | Fixed (added `setLoading(false)` before early return) |
| **Q4** | `getRedirectResult` (5s timeout) runs on every `googleLogin()` call even when not returning from redirect | By design — harmless |
| **Q5** | Provider `_firestoreId` vs numeric `id` confusion | Dual ID system; `_firestoreId` is the actual document name, `id` may be numeric from legacy data. All operations should prefer `_firestoreId`. |

### 6.6 Immediate Next Steps (Priority Order)

1. **Deploy Firestore Security Rules** (S6) — without these, the database is publicly writable
2. **Add Firebase Auth user deletion** to cascading delete flows (S1, F1)
3. **Remove hardcoded admin email fallback** once RBAC migration is verified (S4)
4. **Add rate limiting** to booking/review Firestore endpoints (S3)
5. **Consolidate to REST-only** data layer; remove legacy SDK files (D1)
6. **Add pagination** to admin tables (F5)
7. **Implement real payment gateway** (D6)
8. **Add email verification** for provider registration (F4)

---

*This document is the single source of truth for the Paws & Co. codebase.  
Keep it updated as the architecture evolves.*
