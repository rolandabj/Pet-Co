# Paws & Co. — Pet Services Marketplace

## Overview

A Next.js 16 (Turbopack) pet services marketplace connecting pet owners with service providers (dog walkers, vets, pet shops, dog hotels, pet sitters, groomers). Built with TypeScript, Tailwind CSS 4, Firebase Auth + Firestore, with a local auth fallback.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.2.6 (Turbopack) with App Router |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4 (`@import "tailwindcss"`, `@theme inline {}`) |
| **Fonts** | DM Serif Display (headings), DM Sans (body) — Google Fonts |
| **Auth** | Firebase Auth (Google OAuth + redirect/popup) + `localAuth` fallback |
| **Database** | Firebase Firestore (via SDK + REST API) |
| **Deployment** | Dev on `localhost:12000`, accessed cross-origin via proxy domain |

---

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Landing / Home page
│   ├── layout.tsx                # Root layout (Navbar, AuthProvider, ToastProvider, Footer)
│   ├── globals.css               # Tailwind CSS 4 + custom animations + fonts
│   ├── login/page.tsx            # Login page (email + Google)
│   ├── register/page.tsx         # Register page (role selector, email + Google)
│   ├── services/
│   │   ├── page.tsx              # Services listing (server component, Firestore REST)
│   │   └── ServicesClient.tsx    # Services list (client component, search + filter chips)
│   ├── provider/[id]/
│   │   ├── page.tsx              # Provider detail (server component, Firestore REST)
│   │   └── ProviderClient.tsx    # Provider detail UI (client component, favorites, reviews)
│   ├── booking/page.tsx          # Booking form (client component, Firestore SDK)
│   ├── dashboard/page.tsx        # User dashboard (overview, bookings, favorites, pets, profile, reviews, payments)
│   ├── admin/page.tsx            # Admin panel (users, services, bookings, payments, analytics)
│   ├── about/page.tsx            # About Us (static)
│   ├── contact/page.tsx          # Contact form (Firestore SDK)
│   └── api/providers/route.ts    # API proxy for Firestore providers collection
├── components/
│   ├── Navbar.tsx                # Fixed top nav (logo, links, auth buttons, mobile menu)
│   ├── Footer.tsx                # Footer with links and social icons
│   └── Toast.tsx                 # Toast notification system (context + provider)
├── context/
│   └── AuthContext.tsx            # Auth state management (Firebase + local auth)
└── lib/
    ├── types.ts                  # TypeScript types (AppUser, ServiceProvider, Booking, etc.)
    ├── data.ts                   # Static fallback provider data (12 providers, 6 service types)
    ├── firebase.ts               # Firebase SDK initialization (app, auth, db, GoogleProvider)
    ├── localAuth.ts              # Local email/password auth (localStorage-based fallback)
    ├── firestore-rest.ts         # Firestore REST API helpers (all collections — primary data layer)
    ├── providers.ts              # (legacy) Firestore SDK helpers for providers
    ├── provider-rest.ts          # (legacy) Firestore REST API helpers (server components)
    ├── favorites.ts              # (legacy) Firestore SDK helpers for favorites
    └── reviews.ts                # (legacy) Firestore SDK helpers for reviews
```

---

## Pages & Routes

### `/` — Home / Landing Page
- **Type:** Client component
- **Sections:** Hero (stats, CTA buttons), Services grid (6 service types), How It Works (3 steps), Testimonials (3 cards), CTA section
- **Features:** Animated entries, gradient backgrounds, floating emoji, stat counters
- **Links:** "Find a Service" → `/login`, "Browse Providers" → `/services`, "Join as Pet Owner" → `/register`, "List Your Service" → `/register?provider=true`

### `/login` — Login
- **Type:** Client component
- **Auth methods:** Email/password → `localAuth.login()`, Google → `googleLogin()` (Firebase Auth popup + 15s timeout)
- **Features:** Password show/hide toggle, loading spinners, error banner, domain authorization guidance
- **Key fixes applied:** `cursor-pointer`, `allowedDevOrigins` (React hydration cross-origin), direct env var check

### `/register` — Register
- **Type:** Client component
- **Role selector:** Pet Owner (`owner`) or Service Provider (`provider`) — pre-selects provider if `?provider=true`
- **Auth methods:** Email/password → `localAuth.register()`, Google → same as login
- **Features:** First/last name fields, password min 8 chars, loading spinners

### `/services` — Browse Services
- **Type:** Server component + Client component
- **Data source:** Firestore REST API with 60s revalidation
- **Filter:** URL-based `?type=` param (shops, walkers, vets, hotels, sitters, grooming)
- **Search:** Client-side keyword search across name, category, tags, description
- **Fallback:** Displays error state if Firebase config missing or fetch fails
- **Cards:** Provider card with emoji, name, rating stars, tags, price, category

### `/provider/[id]` — Provider Detail
- **Type:** Server component + Client component
- **Data source:** Firestore REST API (`getProviderByIdRest` + `getReviewsByProviderRest`)
- **Sections:**
  - Hero card (avatar, name, rating, category, location, member since, description, tags)
  - Action buttons: "Book Now — $price" (→ `/booking?provider=id`), Favorite toggle (heart with orange styling)
  - Contact info (phone, email, location)
  - Services & Pricing grid
  - Trust badges (member since, rating, total reviews)
  - Reviews section (list + write review form)
- **Interactions:**
  - Favorite: Toggle via Firestore REST API (`findFavoriteIdRest` / `addFavoriteRest` / `removeFavoriteRest`)
  - Review submission: Firestore REST API (`addReviewRest`), optimistic local update
  - Auth guards: Redirects unauthenticated users to `/login` with toast message
- **Edge cases:** Provider not found (404 UI), no reviews (empty state), no contact details

### `/booking` — Book a Service
- **Type:** Client component with `Suspense`
- **Auth required:** Redirects to `/login` if not authenticated
- **Data source:** Firestore REST API (bookings + payments collections)
- **Fields:** Service type (dropdown), Provider (dropdown), Date, Time, Pet (from user's pets list)
- **Features:**
  - Pre-selects provider from `?provider=` search param
  - Booking summary sidebar (service, date, time, fees, total = price × 1.1)
  - Creates booking doc + payment ledger doc simultaneously
  - Redirects to `/dashboard` after successful booking
- **Validation:** Requires service type, provider, date, and at least one pet

### `/dashboard` — User Dashboard
- **Type:** Client component
- **Auth required:** Redirects to `/login` if not authenticated
- **Tabs (desktop sidebar):** Overview, My Bookings, Favorites, My Pets, My Profile, Reviews, Payments
- **Tabs (mobile):** Fixed bottom tab bar
- **Data sources:** Firestore REST API (`firestore-rest.ts`) — all collections via `fetchWhere`/`fetchCollection`
- **Skeleton loading:** Per-tab skeleton placeholders while data loads
- **Features:**
  - Overview: Upcoming bookings count, favorite count, completed bookings count, review count
  - Bookings: List with status colors (pending/confirmed/completed/cancelled)
  - Favorites: List with remove functionality + link to provider page
  - Pets CRUD: Add/remove pets (name, type dog/cat/bird/rabbit/fish, breed, age, notes)
  - Profile editing: Name, phone, location (persisted to localAuth + Firestore users doc)
  - Reviews: All user's reviews displayed
  - Payments: Filtered by role (`customerId` for owners, `providerId` for providers)

### `/admin` — Admin Panel
- **Type:** Client component
- **Auth required:** Redirects to `/login` if not authenticated (no role gate implemented yet)
- **Tabs:** Users, Services, Bookings, Payments, Analytics
- **Data sources:** `localAuth.getAllUsers()`, Firestore REST API (bookings, providers, payments)
- **Skeleton loading:** Per-tab skeleton placeholders while data loads
- **Features:**
  - Users: Search, list all registered users, delete users (Firestore + localStorage)
  - Services: List providers from Firestore, delete providers
  - Bookings: Full list with cancel/delete actions, status badges
  - Payments: Ledger with inline status editing (paid/pending/refunded/cancelled), delete
  - Analytics: Monthly bookings bar chart (mock data Jan-Dec), Service distribution pie chart
  - Export button (mock — shows toast)

### `/about` — About Us
- **Type:** Server component
- **Content:** Company story, values (Trust, Pet-Centric, Community, Quality), mission, CTA to register

### `/contact` — Contact
- **Type:** Client component
- **Data source:** Firestore SDK (messages collection)
- **Form fields:** Name, Email, Subject (general/support/partnership/provider/feedback), Message
- **Success:** Toast notification + form reset

### `/api/providers` — API Route
- **Type:** Next.js Route Handler (server-side)
- **Function:** Proxies Firestore REST API to avoid browser-level connectivity issues
- **Returns:** JSON from Firestore `providers` collection

---

## Authentication System

### Firebase Auth (firebase.ts + AuthContext.tsx)
- **Init:** Singleton pattern (`getApps()`, lazy init via `getFirebaseAuth()`)
- **Google OAuth:** `GoogleAuthProvider` with custom `client_id` from env
- **onAuthStateChanged:** Watches Firebase auth state, syncs to local session
- **googleLogin() flow:**
  1. Check `getRedirectResult()` (handles redirect-based sign-in) — 5s timeout
  2. Fall back to `signInWithPopup()` — 15s timeout
  3. Wrapped in custom `timeout()` function to prevent hanging
- **Error handling:**
  - `auth/popup-closed-by-user` → silent cancel
  - `auth/popup-blocked` → try `signInWithRedirect`
  - Timeout → show domain authorization instructions
  - `auth/unauthorized-domain` → show whitelist instructions
  - `auth/operation-not-supported-in-this-environment` → use email/password
  - Unknown → generic error message
- **Known issue:** Cross-origin dev environment blocks Firebase communication — add domain to Firebase Console

### Local Auth (localAuth.ts)
- **Storage:** `localStorage` (users + session)
- **Methods:** register, login, logout, getCurrentUser, updateProfile, getAllUsers, deleteUser, setSessionFromFirebase
- **Password:** Hashed with SHA-256 via the Web Crypto API (`crypto.subtle.digest`) before storage
- **Session:** Stores `AppUser` in localStorage under `paws_session`

### Firestore REST API Helpers (firestore-rest.ts)
Used in place of the Firebase SDK, which can hang in sandboxed environments. All calls go to the Firestore REST API via plain `fetch`.

| Function | Purpose |
|---|---|
| `getAllProvidersRest()` | Fetch all providers |
| `fetchCollection(collection, filter?, map?)` | Generic fetch+filter+map helper (no composite indexes) |
| `fetchWhere(collection, field, value, map)` | Shorthand for equality filter with client-side filtering |
| `getProviderByIdRest(id)` | Fetch single provider by ID |
| `getReviewsByProviderRest(id)` | Fetch reviews for a provider |
| `getUserReviewsRest(userId)` | Fetch reviews by a user |
| `addReviewRest(data)` | Create a new review document |
| `findFavoriteIdRest(userId, providerId)` | Check if a favorite exists |
| `getUserFavoritesRest(userId)` | Fetch all favorites for a user |
| `addFavoriteRest(data)` | Add a favorite |
| `removeFavoriteRest(docId)` | Remove a favorite by doc ID |
| `getUserBookingsRest(userId)` | Fetch bookings for a user |
| `getAllBookingsRest()` | Fetch all bookings (admin) |
| `addBookingRest(data)` | Create a new booking |
| `updateBookingRest(id, updates)` | Update a booking (e.g. status) |
| `deleteBookingRest(id)` | Delete a booking |
| `getUserPaymentsRest(userId, role)` | Fetch payments for a user |
| `getAllPaymentsRest()` | Fetch all payments (admin) |
| `addPaymentRest(data)` | Create a payment ledger entry |
| `updatePaymentRest(id, status)` | Update payment status |
| `deletePaymentRest(id)` | Delete a payment record |
| `getUserPetsRest(userId)` | Fetch pets for a user |
| `addPetRest(data)` | Add a pet |
| `deletePetRest(id)` | Delete a pet |
| `addMessageRest(data)` | Submit a contact form message |
| `updateUserDocRest(userId, data)` | Update a user doc (phone, location) |
| `deleteUserDocRest(userId)` | Delete a user document |
| `deleteProviderDocRest(providerId)` | Delete a provider document |

---

## Data Model (Types)

### `AppUser`
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique user ID |
| `email` | `string` | Email address |
| `name` | `string` | Display name |
| `role` | `'owner' \| 'provider'` | User role |
| `photoURL` | `string \| null` | Profile photo |
| `phone` | `string` (optional) | Phone number |
| `location` | `string` (optional) | Location |
| `bio` | `string` (optional) | Short bio |
| `createdAt` | `string` | ISO timestamp |
| `authMethod` | `'email' \| 'google'` | How they signed up |

### `ServiceProvider`
| Field | Type | Description |
|---|---|---|
| `id` | `number` | Unique provider ID |
| `name` | `string` | Business name |
| `type` | `string` | Category slug (e.g. 'walkers', 'vets') |
| `category` | `string` | Display category (e.g. 'Dog Walker') |
| `rating` | `number` | Average rating (0-5) |
| `reviews` | `number` | Count of reviews |
| `desc` | `string` | Short description |
| `tags` | `string[]` | Feature tags |
| `emoji` | `string` | Icon emoji |
| `price` | `string` | Price display (e.g. '$25/hr') |
| `location` | `string` (optional) | Location |
| `since` | `string` (optional) | Year joined |
| `phone` | `string` (optional) | Contact phone |
| `email` | `string` (optional) | Contact email |
| `services` | `ServiceItem[]` (optional) | Service pricing list |

### `ServiceItem` — `{ name: string, price: string }`
### `Booking` — `{ id, serviceType, providerId, providerName, date, time, status: 'pending'|'confirmed'|'completed'|'cancelled', price }`

### Firestore Collections

| Collection | Used By | Key Fields |
|---|---|---|
| `providers` | Services, Provider Detail, Admin, Booking | id, name, type, category, rating, location, since, price, tags, emoji, desc |
| `bookings` | Dashboard, Admin, Booking | userId, serviceType, providerId, providerName, date, time, price, status, createdAt |
| `payments` | Dashboard, Admin, Booking | bookingId, customerId, customerName, providerId, providerName, category, amount, status, createdAt |
| `favorites` | Dashboard, Provider Detail | userId, providerId, providerName, category, emoji, rating |
| `reviews` | Dashboard, Provider Detail | providerId, userId, userName, rating, comment, createdAt |
| `pets` | Dashboard, Booking | userId, name, type (dog/cat/bird/rabbit/fish), breed, age, notes |
| `users` | Auth, Dashboard, Admin | (extends Firebase auth profile: phone, location) |
| `messages` | Contact | name, email, subject, message, userId, createdAt |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✅ | Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional | Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Optional | App ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |

---

## Tailwind CSS Theme

Custom theme defined in `globals.css` via `@theme inline {}`:

| Token | Value | Usage |
|---|---|---|
| `--font-heading` | DM Serif Display, Georgia, serif | h1-h6 |
| `--font-body` | DM Sans, sans-serif | body text |
| `--color-primary` | `#E86A33` | Buttons, links, accents |
| `--color-primary-dark` | `#D4552A` | Hover states |
| `--color-primary-light` | `#F5A07A` | Light accents |
| `--color-secondary` | `#2C3E50` | Text color, dark sections |
| `--color-accent` | `#3AB795` | Secondary CTA (provider signup) |

**Custom animations:** `animate-fade-in-up`, `animate-modal-in`, `animate-slide-in-right`, `animate-float`

---

## Key Design Patterns

### Auth Guards
- `useAuth().requireAuth()` — redirects to `/login` if not authenticated
- Individual components check `user` and redirect in `useEffect` or inline
- API action guards (favorite, review) redirect + toast if unauthenticated

### Server + Client Component Split
- `/services`: Server component fetches data → passes to client component for interactivity
- `/provider/[id]`: Server component fetches provider + reviews → passes to `ProviderClient`
- Booking summary uses Firestore REST API (server) and Firestore SDK (client for mutations)

### Timeout Wrapper
```typescript
function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T>
```
Prevents Firebase SDK hangs in sandboxed environments (15s for popup, 5s for redirect, 4s for Firestore reads).

### Error Handling Strategy
- All Firebase/SDK calls wrapped in try-catch
- User-facing errors shown via Toast notifications or inline error banners
- Network errors silently logged to console (not exposed to users)
- False console errors eliminated (env var check via direct access, not computed property)

---

## Recent Changes

### Firestore REST API Overhaul (`src/lib/firestore-rest.ts`)

**Problem:** The Firestore REST API's `POST :runQuery` endpoint requires composite indexes for queries using `WHERE` clauses, even simple equality filters. Additionally, the map functions (`mapPetDoc`, `mapBookingDoc`, etc.) were calling `docFromJson()` on objects already processed by `fetchCollection` — causing silent failures in list refreshes after create/update operations.

**Fix:**
- Added `fetchCollection()` / `fetchWhere()` helpers that fetch all documents from a collection and filter client-side — no composite indexes required
- Removed `runQuery()`, `queryUrl()`, `buildWhere()`, `buildCompositeAnd()`, `docsFromRunQueryResults()` (all dead code)
- Fixed all 5 map functions (`mapPetDoc`, `mapBookingDoc`, `mapPaymentDoc`, `mapFavoriteDoc`, `mapReviewDoc`) to accept `{ id, data }` directly instead of calling `docFromJson` internally
- Updated `getAllBookingsRest()` and `getAllPaymentsRest()` to pre-process raw API responses through `docFromJson` before mapping
- Migrated all 7 query functions to use `fetchWhere`/`fetchCollection`

### SHA-256 Password Hashing (`src/lib/localAuth.ts`)

**Problem:** Local auth passwords were stored in plaintext in `localStorage`.

**Fix:** Added `hashPassword()` using the Web Crypto API (`crypto.subtle.digest('SHA-256')`). Both `register()` and `login()` are now async and hash/compare passwords using SHA-256.

### Auth Redirect Race Condition Fix (`src/context/AuthContext.tsx`)

**Problem:** After login, `window.location.href = '/dashboard'` triggered a page reload. The AuthProvider's `initUser()` was async and only called `setUser()` at the end (after awaiting a 4s Firestore `getDoc` timeout). Since `initUser()` wasn't awaited, `setLoading(false)` ran immediately — causing the dashboard's auth guard to see `loading=false, user=null` and redirect straight back to `/login`.

**Fix:** Call `setUser(appUser)` at the start of `initUser()` before the Firestore enhancement, so the user is available immediately when `loading` becomes `false`. The Firestore data (phone, location) still updates the user asynchronously if available.

### Skeleton Loading States (dashboard + admin)

**Problem:** Dashboard and admin pages showed blank content while Firestore REST API calls were in flight.

**Fix:** Added per-tab skeleton placeholders in:
- `src/app/dashboard/page.tsx` — skeleton for each dashboard tab (overview, bookings, favorites, pets, profile, reviews, payments)
- `src/app/admin/page.tsx` — skeleton for each admin tab (users, services, bookings, payments, analytics)

### Cross-Origin Dev Environment (`next.config.ts`)

**Problem:** React hydration failures when accessing dev server through a proxy domain.

**Fix:** Added `allowedDevOrigins` configuration referencing both work host domains. Also added `turbopack.root` to resolve Turbopack workspace root detection in proxied environments.

### Firestore SDK → REST Migration

All client-facing pages now use the Firestore REST API helpers instead of the Firebase SDK:
- `src/app/booking/page.tsx` — bookings, payments, pets via REST helpers
- `src/app/contact/page.tsx` — contact form submission via `addMessageRest`
- `src/app/provider/[id]/ProviderClient.tsx` — favorites via REST helpers
- `src/app/dashboard/page.tsx` — all data via REST helpers
- `src/app/admin/page.tsx` — all data via REST helpers

---

## Known Issues & Limitations

1. **Cross-origin dev environment:** `allowedDevOrigins` in `next.config.ts` is required for React hydration
2. **Google sign-in:** Requires domain to be authorized in Firebase Console
3. **Admin panel:** No actual role-based access control (any logged-in user can access)
4. **Firestore SDK & initial page load:** The `getDoc` call in `AuthContext` still uses the Firebase SDK (wrapped in a 4s timeout). If the Firestore REST API is unreachable, the `getAllProvidersRest()` call on `/booking` will throw — handled gracefully via `.catch()`.
5. **Payment system:** Simulated/ledger-only — no real payment processing
6. **Statics in footer:** Blog, Careers, Press, Help Center, etc. are placeholder links
