# Paws & Co. — Digital Marketplace Platform

## 1. Project Identity Overview

- **Title:** Paws & Co. Digital Marketplace Platform
- **Core Purpose:** Connecting pet parents seamlessly with validated multi-category service providers (veterinarians, pet sitters, pet shops, groomers, dog hotels, dog walkers).
- **Global Administrator Profile:** `rolandabj@gmail.com` — exclusive access to `/admin` panel with full CRUD over users, providers, bookings, payments, and reviews.
- **Business Model:** Commission-based marketplace — platform takes a 10% fee on bookings. No real payment gateway; ledger-only simulation.

## 2. Core Tech Stack & Framework Architecture

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 16.2.6 — App Router architecture, Turbopack compilation engine |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 (`@import "tailwindcss"`, `@theme inline {}` tokens, custom utilities) |
| **Typography** | DM Serif Display (headings), DM Sans (body) — served via Google Fonts |
| **Authentication** | Google Firebase Auth — Google OAuth 2.0 (redirect + popup flows) + custom email/password via `localAuth` (SHA-256, localStorage) |
| **Database** | Google Cloud Firestore — primary data layer via **Firestore REST API** (`firestore-rest.ts`); Firebase SDK used selectively for real-time listeners (`onSnapshot`) and homepage aggregations |
| **Storage** | Firebase Storage — bucket path `provider_logos/` for business logo image assets |
| **Dev Server** | `localhost:12000`, accessed cross-origin via proxy domain with `allowedDevOrigins` in `next.config.ts` |

### Hybrid Firestore Strategy
| Mode | Where Used | Rationale |
|---|---|---|
| **Firestore REST API** | Services, provider detail, booking, dashboards, admin, contact | Avoids SDK timeouts in sandboxed/cross-origin dev environments. All mutations go through REST. |
| **Firebase SDK (`onSnapshot`)** | `dashboard/page.tsx` (bookings), `ProviderDashboard.tsx` | Real-time listener for live booking status updates. |
| **Firebase SDK (`getDocs`)** | `page.tsx` homepage | One-shot aggregation counts + testimonials. |

### Graceful Firebase Environment Variable Degradation
**Location:** `src/lib/firebase.ts`
- `getConfig()` validates `apiKey`, `authDomain`, `projectId` — returns `null` if missing.
- All SDK exports (`getFirebaseAuth`, `getFirestoreDb`, `getStorageDb`) return **`null`** when Firebase is not configured, instead of crashing.
- Every consumer across the codebase uses null-safe guards:
  - `if (!db) return;` / `if (!auth) { ... }` patterns.
  - `(window as any).__firebase_warned__` — warns once in console, then silently degrades.
- The app relies on `localAuth` for auth and REST helpers for data when Firebase env vars are absent.

## 3. Global Project Directory Structure Map

```
Paws & Co. (Pet-Co)/
├── plan.md                              # Project technical brief (this file) — SINGLE SOURCE OF TRUTH
├── AGENTS.md                            # Persistent agent memory for context continuity
├── CLAUDE.md                            # Additional agent guidelines (legacy)
├── README.md                            # Project overview readme
├── .env.local.example                   # Firebase + OAuth + ALLOWED_DEV_ORIGINS template
├── .gitignore                           # Ignored: node_modules, .next, .env.local*, next-env.d.ts
├── next.config.ts                       # allowedDevOrigins (env | fallback), image remotePatterns, Turbopack root
├── package.json                         # Deps: next 16.2.6, react 19.2.4, firebase ^12.13.0, tailwindcss 4, typescript 5
├── tsconfig.json                        # TypeScript configuration
├── scripts/
│   ├── reset-ratings.ts                 # Bulk reset provider rating/review fields to zero
│   └── seed-firestore.ts                # Seed Firestore with initial provider data
├── src/
│   ├── app/                             # Next.js App Router pages
│   │   ├── layout.tsx                   # Root layout — AuthProvider, ToastProvider, Navbar, Footer, globals.css
│   │   ├── page.tsx                     # Home/Landing page — client component, live Firestore category counts, live testimonials from reviews
│   │   ├── globals.css                  # Tailwind 4 @theme (colors, fonts), custom keyframes (fade-in-up, modal-in, etc.)
│   │   ├── login/page.tsx              # Login — email/password (localAuth) + Google OAuth (popup + redirect fallback)
│   │   ├── register/page.tsx           # Register — role selector (owner/provider), email + Google flows
│   │   ├── services/
│   │   │   ├── page.tsx                # Services index — server component, Firestore REST fetch, ?type= filter
│   │   │   └── ServicesClient.tsx      # Services list — client component, keyword search, filter chips
│   │   ├── provider/
│   │   │   └── [id]/
│   │   │       ├── page.tsx            # Provider detail — server component, force-dynamic (cache-busting)
│   │   │       └── ProviderClient.tsx  # Provider detail UI — client component, reviews, favorites, products, contact masking
│   │   ├── booking/page.tsx            # Booking wizard — client component, dynamic time slots, 10% fee calc, conflict detection
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # Pet Owner dashboard — 7 tabs (overview, bookings, favorites, pets, profile, reviews, payments)
│   │   │   └── ProviderDashboard.tsx   # Service Provider dashboard — 6 tabs (services, products, bookings, reviews, profile/logistics)
│   │   ├── admin/page.tsx              # Admin panel — 6 tabs (users, services, bookings, payments, reviews, analytics)
│   │   ├── about/page.tsx              # About Us — static informational page
│   │   ├── contact/page.tsx            # Contact — form submission via Firestore SDK
│   │   └── api/providers/route.ts      # API proxy route for server-side Firestore provider access
│   ├── components/
│   │   ├── Navbar.tsx                  # Fixed top nav — logo, nav links, auth buttons (login/register/user menu), mobile hamburger
│   │   ├── Footer.tsx                  # Footer — 4-column link layout, social icons, copyright
│   │   └── Toast.tsx                   # Toast notification system — context + provider, 3s auto-dismiss, success|error|info types
│   ├── context/
│   │   └── AuthContext.tsx             # Auth state orchestrator — Firebase onAuthStateChanged, googleLogin (popup→redirect fallback), localAuth sync, null-safe Firebase guards
│   └── lib/
│       ├── types.ts                    # TypeScript interfaces — AppUser, ServiceProvider, ServiceItem, ProductItem, BookingDoc, etc.
│       ├── data.ts                     # Static fallback provider data (12 entries across 6 service types)
│       ├── firebase.ts                 # Firebase SDK singleton init — lazy loaders return null on missing env vars (graceful degradation)
│       ├── localAuth.ts                # Custom email/password auth — SHA-256 hashing via Web Crypto API, localStorage persistence
│       ├── firestore-rest.ts           # PRIMARY DATA LAYER — all Firestore REST API helpers, cascading deletes, CRUD for all collections
│       ├── provider-rest.ts            # Provider REST fetch helpers — getProviderByIdRest, mapServiceProvider
│       ├── formatProductPrice.ts       # Currency formatter — 13 ISO codes mapped to symbols ($, €, £, ¥, ₹, etc.)
│       ├── providers.ts                # (Legacy) Firestore SDK helpers for providers — null-safe guarded
│       ├── favorites.ts                # (Legacy) Firestore SDK helpers for favorites — null-safe guarded
│       └── reviews.ts                  # (Legacy) Firestore SDK helpers for reviews — null-safe guarded
```

## 4. Comprehensive Feature Manifest & Custom Business Logic

### 4A. Dynamic Homepage Aggregations
**Location:** `src/app/page.tsx`
- On mount, executes `getDocs(query(collection(db, 'providers')))` via Firebase SDK to count all provider documents grouped by `type` field.
- Renders real-time category badge counts per service type (shops, walkers, vets, hotels, sitters, grooming).
- Count labels are plural-aware via `countLabels` lookup map (e.g. `1 shop` vs `3 shops`).
- Null-safe: `if (!db) return` prevents crash when Firebase env vars are missing.

### 4B. True Testimonial Synchronization
**Location:** `src/app/page.tsx`
- Queries `reviews` collection filtering `where('rating', '>=', 4)` with `limit(3)` via Firebase SDK.
- Renders live review cards with rating stars, text, user name, "Verified Pet Owner" badge.
- Reads `review.text || review.comment` for flexible field naming.
- Falls back to a loading message when no reviews exist yet.

### 4C. Role-Based Contact Access Masking
**Location:** `src/app/provider/[id]/ProviderClient.tsx`
- **Phone and email are strictly hidden** from non-authenticated users.
- **Admin bypass only:** Contact fields render exclusively when `user?.email === 'rolandabj@gmail.com'`.
- Customer phone is fetched from user profile doc at booking time (never exposed publicly on provider cards).
- General authenticated users see service details and booking CTA but not direct contact info.

### 4D. Streamlined Call-to-Action Flows
- Hero CTAs route directly to `/services` — no intermediate friction.
- "Book Now" on provider profile → `/booking?providerId={id}` with pre-selected provider.
- "Join as Pet Owner" → `/register`, "List Your Service" → `/register?provider=true`.
- Unauthenticated interactions (favorite, review, book) redirect to `/login`.

### 4E. Google Maps GPS Navigation Sync
**Location:** `src/app/provider/[id]/ProviderClient.tsx`
- **Primary:** `provider.googleMapsUrl` → clickable "Open in Google Maps" link.
- **Fallback:** `provider.location` → auto-encoded Google Maps search redirect (`https://www.google.com/maps/search/?api=1&query={encoded}`).
- Both use `target="_blank" rel="noopener noreferrer"`.

### 4F. Isolated Multi-Service Booking Calendars
**Location:** `src/app/booking/page.tsx`
- Time slot engine generates slots from provider availability × service duration.
- Collision detection unique to **provider + service**: filters out times matching existing `pending | confirmed | completed` bookings where both `providerId` AND `serviceId` match.
- Cancelled/declined bookings release their slots.
- Race-condition guard re-queries bookings at submit time to prevent double-booking.

### 4G. Admin Financial Ledger Modals
**Location:** `src/app/admin/page.tsx`
- Payment modal: booking ID, total, date, customer/provider info, status.
- Event propagation isolation: `e.stopPropagation()` on dropdowns, rows, and modals to prevent nested UI conflicts.
- Booking detail popup: service fee, platform fee (10%), total, currency, status.
- Inline edit: status dropdowns and review editing without navigation.

### 4H. Custom Media Storage Pipelines
**Location:** `src/app/dashboard/ProviderDashboard.tsx`
- Logo upload pipeline: `file → storage ref → uploadBytes → getDownloadURL`.
- Logo URL persisted to provider doc via `updateProviderByIdRest`.
- Displayed on services catalog cards, provider profile hero, and dashboard preview.

### 4I. Searchable Multi-Currency Matrix
**Locations:** `src/app/dashboard/ProviderDashboard.tsx`, `src/lib/formatProductPrice.ts`
- Combo-box input with 13 currencies (USD, EUR, LBP, GBP, JPY, CNY, AED, SAR, EGP, CHF, INR, AUD, CAD).
- `onMouseDown` + `e.preventDefault()` + `e.stopPropagation()` eliminates blur/click race condition in dropdown.
- `formatProductPrice()` maps codes to symbols or falls back to `{amount} {CODE}`.
- Firestore REST mappers read `currency: m.currency?.stringValue ?? 'USD'`.
- Rendered on public profile retail grid and dashboard product table.

### 4J. Zero-Lag Route Updates
**Location:** `src/app/provider/[id]/page.tsx`
- `export const dynamic = 'force-dynamic'` bypasses Next.js route cache entirely.
- Removed `next: { revalidate: 60 }` from all fetch calls.
- Provider edits appear instantly on the public view without cache purging.

### 4K. Review Aggregation Engine
**Locations:** `src/lib/firestore-rest.ts`, `src/app/dashboard/ProviderDashboard.tsx`, `src/app/admin/page.tsx`

**On creation:**
1. Review doc written via `addReviewRest()` or Firebase SDK `addDoc()`.
2. All remaining reviews for that provider are re-fetched.
3. Average rating computed: `sum(rating) / count`.
4. Provider doc updated via `updateProviderByIdRest` with `reviews: N, rating: X.X`.

**On deletion (admin panel):**
1. `deleteReviewRest(reviewId)` removes the review doc.
2. Remaining reviews fetched via `getReviewsByProviderRest(providerId)`.
3. Rating recomputed and written to provider doc.

**Shared helper — `recalculateProviderRating(providerId)`** (private in `firestore-rest.ts`):
```typescript
async function recalculateProviderRating(providerId: string): Promise<void> {
  const remaining = await fetchWhere('reviews', 'providerId', providerId, ...);
  const total = remaining.length;
  const sumStars = remaining.reduce((sum, r) => sum + r.rating, 0);
  const avg = total > 0 ? sumStars / total : 0;
  await updateProviderByIdRest(providerId, { reviews: total, rating: parseFloat(avg.toFixed(1)) });
}
```
- Deleting the **last** review → `reviews: 0, rating: 0.0`.
- Rating edit in admin recalculates from scratch.

### 4L. Provider Operational Hours Form
**Location:** `src/app/dashboard/ProviderDashboard.tsx`
- 7-day toggle UI with `isOpen` + `start`/`end` time inputs per day.
- Explicit `handleDayToggle()` using functional state update to avoid stale React synthetic events.
- Backed by Firestore `availability` map field.
- Standalone save writes only the `availability` field (no other provider data touched).

### 4M. Favorites System
**Locations:** `src/lib/firestore-rest.ts`, `src/app/provider/[id]/ProviderClient.tsx`, `src/app/dashboard/page.tsx`
- Heart icon toggles via `findFavoriteIdRest` / `addFavoriteRest` / `removeFavoriteRest`.
- Favorites tab in user dashboard lists saved providers with name, category, emoji, rating.
- Unauthenticated favorite attempts redirect to `/login`.
- Uses REST API exclusively — no SDK needed.

### 4N. Firebase Auth Error Recovery
**Location:** `src/context/AuthContext.tsx`
- Popup closed by user → silent cancel (no error shown).
- Popup blocked by browser → falls back to `signInWithRedirect`.
- Timeout (5s for redirect, 15s for popup) → shows domain authorization instructions.
- Unauthorized domain → shows Firebase Console whitelist instructions.
- Race condition fix: `setUser` called before Firestore enhancement to prevent flash of logged-out state.

### 4O. Cascading Delete — Service Provider Accounts
**Location:** `src/lib/firestore-rest.ts` — `deleteProviderAccountRest(providerId)`

**Purpose:** Complete account teardown for service providers, wiping all related data and returning metadata for post-deletion cleanup.

**Execution order:**
1. **Query relational data** — fetches bookings, payments, reviews by `providerId`, and favorites by `providerId` OR `targetId` (convention variance).
2. **Delete all relational documents** via `Promise.allSettled` (non-blocking).
3. **Fetch provider doc** before deletion to extract `logoUrl`, `email`, `name` for caller cleanup.
4. **Delete the provider document** (ignores 404 if already gone).
5. **Returns** `{ deletedBookings, deletedPayments, deletedReviews, deletedFavorites, logoUrl, userEmail, userName }`.

**Caller responsibilities (dashboard UI):**
- Delete the Storage image at the `logoUrl` path.
- Downgrade the associated Firebase Auth user role (admin management).

**Admin access:** `admin/page.tsx` has a dedicated "Delete Provider (All Data)" button that calls this function.

### 4P. Cascading Delete — Pet Owner (User) Accounts
**Location:** `src/lib/firestore-rest.ts` — `deleteUserAccountRest(userId)`

**Purpose:** Complete account teardown for pet owners, wiping all related data and recalculating provider ratings.

**Execution order:**
1. **Query relational data** — fetches all user-owned documents in parallel: pets (via `userId`), bookings (`userId`), payments (`customerId`), reviews (`userId`), favorites (`userId`).
2. **Collect affected provider IDs** — extracts unique `providerId` values from reviews for rating recalculation.
3. **Delete all relational documents** via `Promise.allSettled`.
4. **Recalculate provider ratings** — calls `recalculateProviderRating(pid)` for each affected provider.
5. **Delete the user document** (ignores errors if already gone).
6. **Returns** `{ deletedPets, deletedBookings, deletedPayments, deletedReviews, deletedFavorites, recalculatedProviders }`.

**Access points:**
| Entry Point | File | UX Pattern |
|---|---|---|
| **Self-delete (user)** | `src/app/dashboard/page.tsx` | Danger Zone in Profile tab → modal requires typing "DELETE" → calls REST → `localAuth.logout()` → redirect to `/` |
| **Admin delete** | `src/app/admin/page.tsx` | "Delete" button in Users tab → calls REST → `localAuth.deleteUser()` → toast with full summary |

### 4Q. Provider Dashboard — Self-Deletion
**Location:** `src/app/dashboard/ProviderDashboard.tsx`
- Danger Zone section in the profile/logistics tab.
- Confirmation modal requires typing "DELETE".
- Calls `deleteProviderAccountRest(targetDocId)`.
- On success: deletes Storage logo, shows toast summary, calls `localAuth.logout()`, redirects to `/`.

### 4R. Null-Safety Guards Across All Firebase Access Points
**Files affected:** `AuthContext.tsx`, `favorites.ts`, `reviews.ts`, `providers.ts`, `firestore-rest.ts`, `ProviderDashboard.tsx`
- Every call to `getFirestoreDb()`, `getStorageDb()`, `getFirebaseAuth()` is guarded with `if (!db) return` / `if (!auth) { ... }`.
- `AuthContext.tsx` returns early and falls back to `localAuth.getCurrentUser()` when Firebase Auth is unavailable.
- Eliminates TypeScript errors and runtime crashes when Firebase env vars are unset.

## 5. Data Architecture

### Firestore Collections

| Collection | Document ID Convention | Key Fields | Used By |
|---|---|---|---|
| `providers` | Firestore auto-ID or numeric | name, type, category, rating, reviews, desc, tags, emoji, price, location, phone, email, businessName, logoUrl, services[], products[], availability{}, socialMedia{} | All pages |
| `bookings` | Firestore auto-ID | providerId, userId, serviceType, date, time, price, currency, status, customerPhone, instructions, timeSlot, platformFee, total | Booking, dashboards, admin |
| `payments` | Firestore auto-ID | bookingId, providerId, customerId, customerName, amount, currency, status, category, createdAt | Booking, dashboards, admin |
| `reviews` | Firestore auto-ID | providerId, userId, userName, rating, comment, createdAt | Provider page, dashboards, admin, home |
| `users` | Firebase UID or `user_N` | uid, email, name, phone, photoURL, role | Auth, dashboards, admin |
| `pets` | Firestore auto-ID | userId, name, type, breed, age | Booking, dashboard |
| `favorites` | Firestore auto-ID | userId, providerId, providerName, category | Provider page, dashboard |
| `messages` | Firestore auto-ID | name, email, subject, message, userId, createdAt | Contact page |

### REST API Layer (`firestore-rest.ts`)
- **Primary data access** for all pages — avoids Firebase SDK sandbox hanging in cross-origin dev.
- **`toFieldValue()` / `fieldToValue()`** — bidirectional JS ↔ Firestore REST wire format converters.
  - Supports: string, number (integer/double), boolean, null, array, map, timestamp.
- **`fetchCollection()`** — generic GET with optional client-side `filterFn` and `mapFn` (no composite indexes needed).
- **`fetchWhere(collection, field, value, mapFn)`** — shorthand for equality-based client-side filtering.
- **`fetchOne(collection, docId, mapFn)`** — single document fetch with 404 → null.
- **Field-level PATCH** via `updateProviderByIdRest`, `updateBookingRest`, etc. — uses `updateMask.fieldPaths` so only specified fields are overwritten.
- **Cascading delete functions:** `deleteProviderAccountRest`, `deleteUserAccountRest` — multi-collection queries + batch deletes + rating recalculation.
- **Private helper:** `recalculateProviderRating(providerId)` — shared utility used by both user and admin deletion flows.

### Review Doc Interface (`ReviewDoc`)
```typescript
interface ReviewDoc {
  id: string;
  providerId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: string;
}
```

### Booking Doc Interface (`BookingDoc`)
```typescript
interface BookingDoc {
  id: string; userId: string; serviceType: string; providerId: string;
  providerName: string; providerBusinessName?: string; customerName?: string;
  customerPhone?: string; customerEmail?: string; currency?: string;
  date: string; time: string; timeSlot?: string; instructions?: string;
  petId?: string; petName?: string; price: number; platformFee: number;
  total: number; status: string; createdAt?: string;
}
```

## 6. Auth System Architecture

### Firebase Auth (Primary — Online)
- **Init:** Singleton via `getApps()`, lazy initialization from `initFirebase()`.
- **Provider:** Google OAuth 2.0 with optional custom `client_id` from `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Session restore:** `onAuthStateChanged` in `AuthContext.tsx` auto-restores sessions on page load.
- **Login flow:** `googleLogin()` attempts `getRedirectResult` (5s timeout) → falls back to `signInWithPopup` (15s timeout).
- **User creation:** `register` + `login` both sync with `localAuth.setSessionFromFirebase()` for local session parity.

### Local Auth (Fallback — Offline-First)
- **Storage:** `localStorage` under keys `paws_users` (all registered users) and `paws_session` (current session).
- **Hashing:** SHA-256 via `crypto.subtle.digest()` — passwords never stored in plaintext.
- **API surface:** `register`, `login`, `logout`, `getCurrentUser`, `updateProfile`, `getAllUsers`, `deleteUser`, `clearSession`.
- **Session object (`AppUser`):** `{ id, email, name, role, photoURL, createdAt, authMethod }`.
- **Admin sync:** Admin panel uses `localAuth.getAllUsers()` to list users, and `localAuth.deleteUser()` after Firestore cascading delete.

### Auth Guard Strategy
- `useAuth()` returns `{ user, loading, firebaseUser, login, register, googleLogin, logout, updateProfile, requireAuth }`.
- Protected pages check `loading || !user` → show spinner or redirect to `/login`.
- Provider dashboard identity is resolved via email lookup (`getProviderByEmailRest`), not by role claim.
- Admin access uses hardcoded email check: `user?.email === 'rolandabj@gmail.com'`.

## 7. Key Design Patterns & Constraints

### Server + Client Component Split
| Route | Server Work | Client Work |
|---|---|---|
| `/services` | REST fetch all providers, pass to client | `ServicesClient`: search, filter, grid render |
| `/provider/[id]` | REST fetch single provider | `ProviderClient`: reviews, favorites, products, booking CTA |
| `/booking` | — (fully client-side) | Requires auth, real-time slot generation, 10% fee calc |
| `/dashboard` | — (fully client-side) | `onSnapshot` for live booking updates |
| `/admin` | — (fully client-side) | CRUD modals, provider cascading delete, user cascading delete |

### Hook Ordering Constraint (Critical)
- All React hooks **must be declared in fixed order** before any early return.
- `timeSlots` `useMemo` in booking page is hoisted above the auth guard to prevent `Rendered fewer hooks than expected` crash.

### Date Parsing — Local vs UTC
- `new Date('2024-01-15')` is interpreted as UTC → off-by-one day error in negative timezone offsets.
- **Fix:** Manual local date construction via `dateString.split('-').map(Number)` instead of `new Date()`.

### Toast Notification System
- `ToastProvider` wraps app in root `layout.tsx`.
- `useToast()` returns `showToast(message: string, type: 'success' | 'error' | 'info')`.
- Auto-dismisses after 3 seconds; renders checkmark or X icons per type.

### REST API Error Handling
- All REST helpers throw on non-OK responses.
- UI callers wrap in try/catch and surface errors via `showToast('❌ ...', 'error')`.
- `deleteUserAccountRest` and `deleteProviderAccountRest` use `Promise.allSettled` for deletions (non-fatal individual failures) and `try/catch` for optional steps (doc already deleted).

## 8. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes (for Firebase features) | Firebase REST API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes (for Firebase features) | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes (for Firebase features) | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional | Storage bucket URL |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Optional | Firebase app ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `ALLOWED_DEV_ORIGINS` | Optional | Comma-separated proxy domains for cross-origin React hydration |

**Graceful degradation:** When `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, or `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are missing, the Firebase SDK initializers return `null`, and the app falls back to `localAuth` + REST API (which still works if the project ID is available from env).

## 9. Tailwind CSS Theme

| Token | Value | Usage |
|---|---|---|
| `--font-heading` | DM Serif Display, Georgia, serif | All headings |
| `--font-body` | DM Sans, sans-serif | Body text |
| `--color-primary` | #E86A33 | CTAs, active states, brand accent |
| `--color-primary-dark` | #D4552A | Hover states |
| `--color-primary-light` | #F5A07A | Light accents |
| `--color-secondary` | #2C3E50 | Default text color |
| `--color-accent` | #3AB795 | Secondary buttons, success indicators |
| `--color-bg` | #FFF8F0 / #FDFBF7 | Page backgrounds |

**Custom keyframes:** `fade-in-up` (0.6s, translateY 20→0), `modal-in` (0.3s, scale 95→100 + fade), `slide-in-right` (0.3s), `float` (6s infinite, translateY -10→10).

## 10. Known Issues & Limitations

1. **Cross-origin dev:** `allowedDevOrigins` required for React hydration on proxied domains — falls back to hardcoded work hostnames.
2. **Google sign-in:** Domain must be authorized in Firebase Console; unauthorized domain shows whitelist instructions.
3. **Admin panel:** Hardcoded `rolandabj@gmail.com` email check — no role-based access control system.
4. **Payment system:** Simulated/ledger-only — no real payment gateway integration.
5. **Firestore SDK init:** `getDoc` in AuthContext uses SDK (4s timeout) — may hang in sandbox; REST API is preferred.
6. **Footer statics:** Blog, Careers, Press, Terms, Privacy, etc. are placeholder links.
7. **No rate limiting:** No request throttling on booking/review endpoints — vulnerable to spam.
8. **Firebase Auth user persistence:** Cascading deletes clear Firestore data but do not delete the Firebase Authentication user record (Auth record must be managed via Firebase Console or Admin SDK separately).
9. **Provider booking conflict detection:** Collision detection queries by `providerId` + `serviceId`; if booking data uses different field naming conventions, some conflicts may be missed.
