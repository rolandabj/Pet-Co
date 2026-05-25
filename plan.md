# Paws & Co. — Comprehensive System Architecture

> **Last updated:** 2026-05-25
> **Next.js 16.2.6 · App Router · TypeScript 5 · Tailwind CSS 4 · Firebase Firestore (Client SDK + REST API + Admin SDK)**

---

## Table of Contents

1. [Project Overview & Core Audience](#1-project-overview--core-audience)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [State & Data Flow](#3-state--data-flow)
4. [Database Schema](#4-database-schema)
5. [Workspace Setup & DevOps](#5-workspace-setup--devops)
6. [Recent Milestones](#6-recent-milestones)
7. [Upcoming Roadmap](#7-upcoming-roadmap)

---

## 1. Project Overview & Core Audience

Paws & Co. is a **dual-sided pet-care marketplace** connecting Pet Owners with Service Providers.

### Pet Owners
- Browse/search/filter service providers across six categories (Dog Walking, Vet Visits, Grooming, Pet Hotels, Pet Sitting, Pet Shops)
- View provider profiles with services, availability schedules, ratings, reviews, and retail products
- Book appointments with date/time/service selection; manage bookings (cancel)
- Manage pet profiles (add/edit/remove pets with name, type, breed, birth year, weight)
- Favorite providers for quick access from dashboard
- Leave reviews (rating + comment) for providers after completed bookings

### Service Providers
- Manage business profile (name, description, logo, contact info, location, social media links)
- Set operational hours per day of the week (open/close times, closed days)
- Manage services (add/edit/remove service listings with name, price, duration, description)
- Manage products (add/edit/remove retail products with price, image, stock status)
- View earnings dashboard with: total earnings MTD, active bookings count, listings count, average rating
- Manage incoming bookings (confirm/complete/cancel)
- Delete account with cascading deletion of all associated data (bookings, payments, reviews, favorites, provider doc, user doc, Firebase Auth user)

### Platform Administrators
- Central admin panel with tabbed interface: users, providers, services, bookings, analytics, payments, reviews
- Comprehensive user directory (Firestore users + localAuth users, merged and deduplicated)
- Provider detail modal with: services list, fee history table, date-range financial metrics (gross revenue, platform fees), batch fee collection
- Payment ledger with Provider filter, Date sort, breakdown columns (Service Cost / Platform Fee / Total)
- Payment detail modal with customer info, booking link, status editing
- Review management (edit rating/comment, delete)
- Business analytics dashboard: KPI cards (total users with MoM growth, active providers, total platform fees, revenue MTD), financial health chart (Platform Revenue vs Provider Payouts over 12 months), top 3 providers leaderboard, monthly bookings bar chart, service distribution
- Pagination on all collection tabs (users, providers, bookings, payments, reviews)
- Delete user accounts (handles both Firestore users and localAuth users)

---

## 2. Tech Stack & Architecture

### 2.1 Core Stack

| Layer | Technology | Version / Config |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.2.6 |
| **Bundler** | Turbopack (dev), Webpack (prod) | — |
| **Language** | TypeScript | ^5 |
| **Styling** | Tailwind CSS | ^4 (PostCSS) |
| **Typography** | DM Serif Display + DM Sans | Google Fonts (layout.tsx) |
| **Auth (Client)** | Firebase Auth (Google OAuth + Email/Password) | firebase ^12.13.0 |
| **Auth (Server)** | Firebase Admin Auth SDK (local) + google-auth-library | firebase-admin ^13.10.0 |
| **Database** | Cloud Firestore | Triple-access pattern (see §3) |
| **Storage** | Firebase Storage | Provider logos |
| **Linting** | ESLint 9 | eslint-config-next |

### 2.2 Firebase Project Configuration
- **Project ID:** `pet-co-fc4d6`
- **Firestore location:** nam5 (us-central)
- **Security rules:** Deployed via `firebase deploy` (requires local `firebase-tools`; not runnable from sandbox)
- **Auth providers:** Email/Password, Google

### 2.3 API Routes Summary

| Endpoint | Method(s) | Runtime | Auth | Purpose |
|---|---|---|---|---|
| `/api/me/account` | DELETE | Node.js | Firebase ID token | Cascading delete of provider account + all relational data |
| `/api/me/pets` | GET, POST | Node.js | Firebase ID token | List/create user's pets |
| `/api/me/favorites` | GET, POST, DELETE | Node.js | Firebase ID token | List/add/remove favorites |
| `/api/auth/delete-user` | DELETE | Node.js | Firebase ID token | Delete Firebase Auth user (Admin SDK) |
| `/api/bookings` | GET, POST | Node.js | Firebase ID token | List/create bookings |
| `/api/payments` | GET, POST | Node.js | Firebase ID token | List/create payments |
| `/api/providers` | GET | Edge | None (public) | List all providers (homepage + browse) |
| `/api/reviews` | GET, POST | Node.js | Firebase ID token | List/create reviews |
| `/api/admin/payments/batch-fee-collect` | POST | Node.js | Firebase ID token | Batch collect fees on selected payments (individual PATCH, no `:commit`) |
| `/api/admin/users/[userId]/details` | GET | Node.js | Firebase ID token | Fetch full user details with localAuth fallback |

### 2.4 Next.js Configuration
- **`next.config.ts`:** `allowedDevOrigins` configured for proxy-domain development; image remotePatterns for Firebase Storage
- **Turbopack:** Used as the dev bundler (Next.js 16 default)
- **Hydration:** React 19 strict mode enabled; hydration errors mitigated via `suppressHydrationWarning` on mutable DOM

---

## 3. State & Data Flow

### 3.1 Authentication Context (`AuthContext.tsx`)
- **Provider:** `AuthProvider` wraps the app in `layout.tsx`
- **State:** `{ user: AppUser | null, loading: boolean, isInitialized: boolean, firebaseUser: FirebaseUser | null, effectiveUserId: string | null }`
- **Flow:**
  1. On mount, `onAuthStateChanged` listens for Firebase Auth state
  2. If a Firebase user exists, fetches the Firestore `users/{uid}` doc to get role, name, etc.
  3. If the Firestore doc exists with `role === 'provider'`, sets the user as a provider
  4. Falls back to `localAuth` (localStorage-based auth) if Firebase is unavailable
  5. `effectiveUserId` prefers Firebase Auth UID; falls back to `user.id` only when Firebase is unavailable
- **Auth methods:** `login()` (email/password), `register()` (email/password + role selection), `googleLogin()` (Google OAuth popup + retry on network errors), `logout()`
- **Role gating:** Google sign-in prompts for role (Owner vs Provider) before OAuth flow; `getExistingRole()` checks Firestore first

### 3.2 Firestore Access Pattern — 3-Layer Fallback Chain
The codebase uses a **triple-access pattern** to handle sandboxed/container environments where the Firebase SDK can silently fail:

| Layer | Mechanism | Used For | Failure Mode |
|---|---|---|---|
| **1. Client SDK** | `firebase/firestore` (`getDocs`, `addDoc`, `updateDoc`, `deleteDoc`) | Simple reads/writes in browser context | Falls through to REST API |
| **2. REST API** | `src/lib/firestore-rest.ts` (plain `fetch` with Firebase ID token auth) | All CRUD operations client-side; bypasses gRPC hangs | Falls through to localStorage |
| **3. localStorage** | `src/lib/localAuth.ts` | Offline-first reads for pets, favorites; last-resort read fallback | Returns empty/data from cache |

**Server-side operations** use a separate helper:
- `src/lib/firestore-admin-rest.ts` — authenticates via `google-auth-library` (OAuth2 service account) and makes direct REST calls. Used in API routes where Admin SDK gRPC silently fails (container environments).

### 3.3 Admin-Specific 4-Layer Fallback Chain (Pets & Favorites)
Due to Firestore security rule limitations (`||` in `list` rules prevents query-analyzer), pets and favorites use an extended chain:
1. Firebase SDK `getDocs` with `where` query (blocked for non-admin users with `||` rules)
2. REST `:runQuery` (blocked because `resource.data` is unavailable for REST list operations)
3. **REST GET-by-ID** for each document known to localStorage — the `get` rule has `resource.data` available, so `ownsExistingDoc()` works correctly
4. Raw localStorage (last resort when ALL remote reads fail)

### 3.4 Admin Panel Data Flow
- **Paginated collections:** Separate state arrays per tab (`users`, `providers`, `bookings`, `payments`, `reviews`) with cursor-based pagination (`nextPageToken`)
- **Analytics:** Fetched independently via `getAllBookingsRest()` + `getAllPaymentsRest()` (full data, not paginated); all aggregations computed client-side
- **Merged user list:** `allUsers` combines Firestore `getAllUsersRest()` + `localAuth.getAllUsers()`, deduplicated by ID

---

## 4. Database Schema

### 4.1 Collection: `users`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Firebase Auth UID or localAuth-generated ID |
| `email` | string | User email address |
| `name` | string | Display name |
| `role` | `'owner' \| 'provider' \| 'admin'` | Access level |
| `photoURL` | string \| null | Avatar URL |
| `phone` | string (optional) | Contact phone |
| `location` | string (optional) | Geographic location |
| `bio` | string (optional) | Short biography |
| `createdAt` | string (ISO 8601) | Account creation timestamp |
| `authMethod` | `'email' \| 'google'` | Registration method |

### 4.2 Collection: `providers`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Unique provider ID (often matches user ID) |
| `name` | string | Provider display name |
| `businessName` | string (optional) | Registered business name |
| `type` | string | Provider type key (e.g., `'walking'`, `'vet'`, `'grooming'`) |
| `category` | string | Display category |
| `rating` | number | Average star rating (0–5) |
| `reviews` | number | Total review count |
| `desc` | string | Provider description |
| `tags` | string[] | Search/filter tags |
| `emoji` | string | Category emoji icon |
| `price` | string | Price tier (e.g., `'$$'`, `'$$$'`) |
| `location` | string (optional) | Service area / address |
| `googleMapsUrl` | string (optional) | Google Maps embed link |
| `since` | string (optional) | Year established |
| `phone` | string (optional) | Contact number |
| `email` | string (optional) | Contact email |
| `contactEmail` | string (optional) | Business contact email |
| `contactPhone` | string (optional) | Business contact phone |
| `logoUrl` | string (optional) | Logo image URL (Firebase Storage) |
| `services` | `ServiceItem[]` (optional) | List of offered services with name, price, duration |
| `products` | `ProductItem[]` (optional) | List of retail products with price, image, stock |
| `availability` | `Record<string, DaySchedule>` (optional) | Weekly schedule: day → `{ isOpen, start, end }` |
| `socialMedia` | object (optional) | `{ instagram?, facebook?, twitter?, website? }` |

### 4.3 Collection: `bookings`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Auto-generated Firestore ID |
| `userId` | string | Pet owner's user ID |
| `customerName` | string | Customer display name |
| `providerId` | string | Provider's user ID |
| `providerName` | string | Provider display name |
| `serviceType` | string | Service category key |
| `serviceName` | string | Specific service booked |
| `date` | string | Booking date |
| `time` | string | Booking time slot |
| `price` | number | Booking price |
| `status` | `'pending' \| 'confirmed' \| 'completed' \| 'cancelled'` | Current state |
| `createdAt` | string (ISO 8601, optional) | Creation timestamp |

### 4.4 Collection: `payments`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Auto-generated Firestore ID |
| `bookingId` | string | Related booking ID |
| `customerId` | string | Paying customer's user ID |
| `customerName` | string | Customer display name |
| `providerId` | string | Receiving provider's user ID |
| `providerName` | string | Provider display name |
| `category` | string | Service category |
| `amount` | number | Total transaction amount |
| `status` | `'paid' \| 'pending' \| 'refunded' \| 'cancelled'` | Payment state |
| `createdAt` | string (ISO 8601, optional) | Payment timestamp |
| `feeCollected` | boolean | Whether platform fee has been collected |

### 4.5 Collection: `reviews`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Auto-generated Firestore ID |
| `providerId` | string | Reviewed provider ID |
| `userId` | string | Review author's user ID |
| `userName` | string | Author display name |
| `rating` | number | Star rating (1–5) |
| `comment` | string | Review text |
| `createdAt` | string (ISO 8601, optional) | Review timestamp |

### 4.6 Collection: `pets`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Auto-generated Firestore ID |
| `userId` | string | Owner's user ID |
| `name` | string | Pet name |
| `type` | string | Species (e.g., `'Dog'`, `'Cat'`) |
| `breed` | string (optional) | Breed |
| `birthYear` | number (optional) | Birth year |
| `weight` | number (optional) | Weight in kg/lbs |

### 4.7 Collection: `favorites`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Auto-generated Firestore ID |
| `userId` | string | User who favorited |
| `providerId` | string | Favorited provider ID |

### 4.8 Collection: `messages`

| Field | Type | Description |
|---|---|---|
| `id` (doc ID) | string | Auto-generated Firestore ID |
| (contact form fields) | various | User-submitted contact messages. Admin-only read. |

---

## 5. Workspace Setup & DevOps

### 5.1 Quick Start
```bash
bash scripts/setup.sh
```
This single script:
1. Installs npm dependencies (skips if `node_modules` exists)
2. Creates `.env.local` from `.env.local.example`, overlaying environment-provided values
3. Cleans `.next` cache
4. Starts the dev server on `PORT` (default 12000)

### 5.2 Required Environment Variables

**Firebase Client SDK (public):**
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

**Google OAuth (client-side):**
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=
```

**Firebase Admin SDK (server-side, for API routes):**
```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

**Development:**
```
ALLOWED_DEV_ORIGINS=
PORT=12000
```

### 5.3 AGENTS.md Initialization
- `AGENTS.md` at repository root serves as persistent memory for AI coding sessions
- Updated automatically with: build commands, debug notes, architecture decisions, known pitfalls
- Key rules: Next.js 16 breaking changes, gRPC silent failures in containers, Firestore security rule limitations
- `CLAUDE.md` references `@AGENTS.md` to inherit the same knowledge base

### 5.4 Available Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Start Turbopack dev server |
| `npm run build` | Production build (Webpack) |
| `npm run start` | Production server |
| `npm run lint` | ESLint check |
| `scripts/setup.sh` | Full workspace bootstrap |
| `scripts/seed-firestore.ts` | Seed Firestore with sample data |
| `scripts/make-admin.ts` | Grant admin role to a user |
| `scripts/migrate-user-id.ts` | Migrate user ID format |
| `scripts/reset-ratings.ts` | Reset provider ratings |

### 5.5 Firestore Security Rules (`firestore.rules`)
- **Key functions:** `signedIn()`, `isAdmin()`, `isOwner()`, `ownsExistingDoc()`, `ownsNewDoc()`, `cooldownElapsed()`
- **Pattern:** Admins have full access; regular users can only read/write their own data
- **Pets & Favorites:** `get` and `list` operations allow `ownsExistingDoc() || isAdmin()` — the `||` prevents the Firestore query analyzer from using composite indexes, which is why the 4-layer fallback chain exists
- **Rate limiting:** `cooldownElapsed('lastBookingAt')` prevents creating more than one booking per 60 seconds
- **Deploy:** `npx firebase deploy --only firestore:rules --project pet-co-fc4d6` (from local machine; not possible from sandbox)

---

## 6. Recent Milestones

### 6.1 Phase 4: Business Analytics Dashboard (Current)
- **Financial Health chart:** CSS stacked bar chart showing Platform Revenue (10%) vs Provider Payouts (90%) over 12 months, with hover tooltips
- **KPI cards:** Total Users with MoM growth %, Active Providers count, Total Platform Fees (all-time), Revenue MTD
- **Top Providers leaderboard:** Top 3 ranked by completed bookings + average rating, with 🥇🥈🥉 medals
- Data sourced from full `getAllBookingsRest()` + `getAllPaymentsRest()` — not from paginated subsets

### 6.2 Phase 3: Payments & Reviews Tab Upgrades
- **Payments columns restructured:** Service Cost / Platform Fee / Total breakdown
- **Provider filter dropdown** on both Payments and Reviews tabs
- **Date sort toggle** (Newest/Oldest) on both Payments and Reviews tabs
- Client-side filtering/sorting on already-loaded paginated arrays

### 6.3 Phase 2: Provider Financials & Fee Management
- **Provider Detail Modal** with date range selector, gross revenue & platform fee calculations
- **Fee history table** with fee amount displayed next to fee status
- **Batch fee collection** on selected payments (individual PATCH via `getDocRest`/`getAccessToken`)
- Fixed `TypeError: Failed to fetch` — removed dynamic imports of Firebase auth in `handleOpenUserModal` and `handleBulkFeeCollect`
- Fixed 500 error in batch-fee-collect API — switched from Firestore `:commit` batch write to individual document updates

### 6.4 Phase 1: Core Architecture & Stabilization
- **Next.js 16 / Turbopack hydration resolution:** Added `allowedDevOrigins` in `next.config.ts` for proxy-domain development
- **Dynamic Google Auth role-gating:** Role + providerType selection before sign-in flow; `getExistingRole()` lookup to avoid re-prompting
- **Cascading account deletion:** Switched from gRPC to REST API for Firestore operations; deletes user doc entirely (not just downgrade); cleans up localStorage
- **Service Provider category editing:** Category dropdown in Business Profile saves type/category/emoji
- **Password confirmation on registration:** Confirm Password field with validation on mismatch
- **Booking service dropdown empty state:** Handles case where preselected provider has no services
- **Google Sign-In network error retry:** Auto-retry `signInWithPopup` with 1.5s delay (fixes `auth/network-request-failed`)
- **Admin panel user list cleanup:** Deletes user doc from Firestore instead of just downgrading role; clears localStorage

### 6.5 Known Issues & Debug Notes
- **gRPC silently fails in containers:** Admin SDK `getFirestore()` uses gRPC which can fail without error. Always use `src/lib/firestore-admin-rest.ts` for server-side Firestore operations
- **Users docs lack `email` field:** `updateUserDocRest()` only stores `{ role, name }` — always look up by UID/docId, never by email
- **Admin panel shows localAuth users too:** `admin/page.tsx` merges Firestore users + localAuth users; deleting Firestore doc alone isn't enough if admin's localStorage has a stale entry
- **Cannot deploy Firestore rules from sandbox:** Workload identity has no access to `pet-co-fc4d6` project. Deploy from local machine only
- **Debug logging added:** `console.log('OUTGOING PAYLOAD:')`, `console.log('data.userId:')`, `console.error('FIRESTORE WRITE ERROR:')` in write operations

---

## 7. Upcoming Roadmap

### Immediate: Admin Panel Polish
- Add remaining modal detail views (user, booking)
- Refine Reviews filter details after requirements clarification
- Possibly add export functionality (CSV download for payments/reviews)

### Short-Term (Next 1-2 Sprints)
- Deploy updated Firestore Security Rules from local machine
- Remove hardcoded admin email checks; use role-based gating exclusively
- Add rate limiting display to UI
- Add pagination summary (total count) for admin tables
- Improve error boundaries and loading states across all tabs

### Medium-Term
- REST-only data layer consolidation (reduce SDK dependency)
- Request caching layer (SWR or React Query) for analytics data
- Stripe / payment gateway integration for real payment processing
- Email notifications (booking confirmations, reminders)
- Server-side paginated queries with cursor-based navigation
- Unit + integration tests for critical flows (auth, payments, admin)

### Long-Term
- Mobile app (React Native or Flutter)
- Internationalization (i18n) for multi-language support
- Real-time chat between pet owners and providers
- Subscription plans for providers
- Advanced analytics with exportable reports and dashboards

---

*This document is the single source of truth for the Paws & Co. codebase. Update it whenever the architecture, dependencies, or schema change.*
