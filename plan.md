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
| **Database** | Firebase Firestore (via REST API primary + SDK for mutations) |
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
│   ├── booking/page.tsx          # Booking wizard (client component, REST API)
│   ├── dashboard/
│   │   ├── page.tsx              # User dashboard (overview, bookings, favorites, pets, profile, reviews, payments)
│   │   └── ProviderDashboard.tsx # Provider dashboard (services, products, availability hours, reviews management)
│   ├── admin/page.tsx            # Admin panel (users, services, bookings, payments, reviews, analytics)
│   ├── about/page.tsx            # About Us (static)
│   ├── contact/page.tsx          # Contact form (Firestore SDK)
│   └── api/providers/route.ts    # API proxy for Firestore providers collection
├── components/
│   ├── Navbar.tsx                # Fixed top nav (logo, links, auth buttons, mobile menu, role-aware items)
│   ├── Footer.tsx                # Footer with links and social icons
│   └── Toast.tsx                 # Toast notification system (context + provider)
├── context/
│   └── AuthContext.tsx           # Auth state management (Firebase + local auth)
└── lib/
    ├── types.ts                  # TypeScript types (AppUser, ServiceProvider, Booking, etc.)
    ├── data.ts                   # Static fallback provider data (12 providers, 6 service types)
    ├── firebase.ts               # Firebase SDK initialization (app, auth, db, GoogleProvider)
    ├── localAuth.ts              # Local email/password auth (SHA-256 hashed, localStorage-based)
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

### `/register` — Register
- **Type:** Client component
- **Role selector:** Pet Owner (`owner`) or Service Provider (`provider`) — pre-selects provider if `?provider=true`
- **Auth methods:** Email/password → `localAuth.register()`, Google → same as login
- **Features:** First/last name fields, password min 8 chars, loading spinners

### `/services` — Browse Services Index
- **Type:** Server component + Client component (`ServicesClient.tsx`)
- **Data source:** Firestore REST API with 60s revalidation
- **Filter:** URL-based `?type=` param (shops, walkers, vets, hotels, sitters, grooming)
- **Search:** Client-side keyword search across name, category, tags, description
- **Cards:** Provider card with emoji, name, rating stars, review count, tags, price, category

### `/provider/[id]` — Provider Detail
- **Type:** Server component + Client component (`ProviderClient.tsx`)
- **Data source:** Firestore REST API (`getProviderByIdRest` + `getReviewsByProviderRest`)
- **Sections:**
  - Hero card (avatar, name, rating, category, location, member since, description, tags)
  - Action buttons: "Book Now — $price" (→ `/booking?providerId=id`), Favorite toggle (heart)
  - Contact info (phone, email, location)
  - Services & Pricing grid (displays name, description, duration, price, currency)
  - Trust badges (member since, rating, total reviews)
  - Reviews section (list + write review form with star rating)
- **Interactions:**
  - Favorite: Toggle via Firestore REST API (`findFavoriteIdRest` / `addFavoriteRest` / `removeFavoriteRest`)
  - Review submission: Creates review doc, then recalculates provider `rating` + `reviews` aggregates via REST helpers, updates local state instantly
- **Edge cases:** Provider not found (404 UI), no reviews (empty state), no contact details

### `/booking?providerId=` — Booking Wizard
- **Type:** Client component with `Suspense`
- **Auth required:** Redirects to `/login` if not authenticated
- **Data source:** Firestore REST API (bookings + payments + pets collections)
- **Fields:** Service type (dropdown), Provider (pre-selected from URL param or free select), Date, Time, Pet (from user's pets list), Special Instructions
- **Core Features:**
  - **Dynamic Time Slot Engine:** Generates 30/60-min slots from provider's availability hours × service duration; filters out `pending`, `confirmed`, `completed` bookings; releases slots instantly for `cancelled` and `declined` bookings
  - **Multi-Currency System:** Searchable combobox dropdown per service item; currency symbols display on summary cards and payment ledgers
  - **Live Profile Cross-Reference:** Fetches `customerPhone` from user's Firestore profile doc for the booking payload
  - **Race-Condition Guard:** Re-queries bookings at submit time to catch concurrent double-bookings
  - Booking summary sidebar (service, date, time, service fee, platform fee 10%, total)
  - Creates booking doc + payment ledger doc simultaneously
  - Redirects to `/dashboard` after successful booking
- **Edge cases:** Provider not operating on selected day (empty state), all slots booked, concurrent booking conflict detection
- **Hooks warning:** `timeSlots` useMemo is hoisted above early returns to prevent "Rendered fewer hooks" React crash

### `/dashboard` — User Dashboard
- **Type:** Client component
- **Tabs (desktop sidebar):** Overview, My Bookings, Favorites, My Pets, My Profile, Reviews, Payments
- **Tabs (mobile):** Fixed bottom tab bar
- **Data sources:** Firestore REST API (`firestore-rest.ts`)
- **Skeleton loading:** Per-tab skeleton placeholders while data loads
- **Features:**
  - Overview: Upcoming bookings count, favorite count, completed bookings count, review count
  - Bookings: List with status colors (pending/confirmed/completed/cancelled/declined)
  - Favorites: List with remove + link to provider page
  - Pets CRUD: Add/remove pets (name, type dog/cat/bird/rabbit/fish, breed, age, notes)
  - Profile editing: Name, phone, location (persisted to localAuth + Firestore users doc)
  - Reviews: All user's reviews displayed
  - Payments: Filtered by role (`customerId` for owners, `providerId` for providers)

### `/dashboard` — Provider Dashboard (`ProviderDashboard.tsx`)
- **Type:** Client component (toggled when user role is `provider`)
- **Tabs:** Overview, Services, Products, Reviews, Appointments
- **Operational Hours Management:**
  - 7-day weekly schedule toggles (isOpen/closed) with time pickers (start/end)
  - Day toggle uses explicit `handleDayToggle` to force boolean resolution (avoids stale checkbox state)
  - Availability payload is constructed with rigid `Boolean()` / `||` fallbacks to ensure Firestore-safe primitives
  - **Standalone "Save Operating Hours Only" button** bypasses full profile save to avoid silent field overwrites
  - **localStorage backup hydration:** On mount, if provider doc has no availability, restore from cached localStorage key `availability_{providerId}`
- **Services CRUD:** Add/edit/remove services with name, description, duration (integer minutes), price, currency (searchable dropdown)
- **Products CRUD:** Add/edit/remove products with name, description, price, image upload
- **Appointments:** Status management dropdown (pending → confirmed → in-progress → completed → cancelled/declined)
- **Reviews:** View all reviews for the provider
- **Edge cases:** Missing `providerDocId` resolution (falls back through `_firestoreId` → `providerDocId` state → `provider.id` → `userId`)

### `/admin` — Admin Panel
- **Type:** Client component
- **Auth restricted to:** `rolandabj@gmail.com` (hardcoded check)
- **Tabs:** Users, Services, Bookings, Payments, Reviews, Analytics
- **Data sources:** `localAuth.getAllUsers()`, Firestore REST API (all collections)
- **Admin Review Management Cascade:**
  - **Delete review:** Extracts `providerId` before deletion → fetches remaining reviews via `getReviewsByProviderRest` → sums ratings → computes new average → writes `rating` and `reviews` to provider document via `updateProviderByIdRest` → syncs local state
  - **Edit review:** Same recalculation flow after rating change; handles the case where the rating was modified up/down
  - **Edge case:** Deleting the last review sets `rating: 0.0` and `reviews: 0` on the provider doc
  - Public directory cards (`ServicesClient.tsx`) reflect updated values instantly since they read from provider docs
- **Features:**
  - Users: Search, list, delete (Firestore + localStorage)
  - Services: List providers, delete providers
  - Bookings: Full list with cancel/delete/status edit
  - Payments: Ledger with inline status editing (paid/pending/refunded/cancelled), delete
  - Analytics: Monthly bookings bar chart, Service distribution bar chart

### `/about` — About Us
- **Type:** Server component
- **Content:** Company story, values, mission, CTA to register

### `/contact` — Contact
- **Type:** Client component
- **Form fields:** Name, Email, Subject (general/support/partnership/provider/feedback), Message
- **Success:** Toast notification + form reset

### `/api/providers` — API Route
- **Type:** Next.js Route Handler (server-side)
- **Function:** Proxies Firestore REST API to avoid browser-level connectivity issues

---

## Database Architecture — Firestore Collections

### `providers` Collection
Primary store for all service provider profiles.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated document ID |
| `name` | `string` | Business name (owner's name fallback) |
| `businessName` | `string` | Registered business name |
| `type` | `string` | Category slug (e.g. 'walkers', 'vets') |
| `category` | `string` | Display category (e.g. 'Dog Walker') |
| `rating` | `number` | Average rating (0.0–5.0) — recalculated on review CRUD |
| `reviews` | `number` | Total review count — recalculated on review CRUD |
| `desc` | `string` | Business description |
| `tags` | `string[]` | Feature tags |
| `emoji` | `string` | Icon emoji for directory cards |
| `price` | `string` | Price display (e.g. '$25/hr') |
| `location` | `string` | City/location |
| `since` | `string` | Year joined |
| `phone` / `contactPhone` | `string` | Contact phone |
| `email` / `contactEmail` | `string` | Contact email |
| `businessName` | `string` | Registered business name |
| `socialMedia` | `map` | `{ instagram, facebook, website }` |

#### `services` Array (embedded in provider doc)
```typescript
interface ServiceItem {
  name: string;        // Service name (e.g. "Dog Walking")
  description: string; // Detailed service description (displayed on provider detail page)
  duration: number;    // Duration in minutes (e.g. 30, 60) — drives time slot generation
  price: number;       // Numeric price value
  currency: string;    // Currency code (e.g. "USD", "EUR", "GBP") — selected via searchable combobox
}
```

#### `availability` Map (embedded in provider doc)
```typescript
interface DaySchedule {
  isOpen: boolean;  // Provider operates on this day
  start: string;    // Opening time "HH:MM" (24h)
  end: string;      // Closing time "HH:MM" (24h)
}

interface Availability {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}
```
- **Deserialization fix:** REST API reads now deserialize `availability` from Firestore's `mapValue.fields` into flat JS objects via `fieldToValue` in `firestore-rest.ts` / `provider-rest.ts`
- **Fallback:** If availability is unset, booking engine defaults to `isOpen: true`, `start: '09:00'`, `end: '18:00'`

### `bookings` Collection
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated document ID |
| `userId` | `string` | Customer's user ID |
| `serviceType` | `string` | Service name |
| `providerId` | `string` | Provider's document ID |
| `providerName` | `string` | Provider display name |
| `providerBusinessName` | `string` | Provider's registered business name |
| `customerName` | `string` | Customer display name |
| **`customerPhone`** | `string` | Live cross-referenced from user's Firestore profile doc |
| `date` | `string` | Booking date (YYYY-MM-DD) |
| `time` | `string` | Booked time display format |
| **`timeSlot`** | `string` | Booking slot in "HH:MM" format (for collision detection) |
| `instructions` | `string` | Special instructions |
| `petId` | `string` | Selected pet's ID |
| `petName` | `string` | Pet's name |
| `price` | `number` | Service fee |
| `currency` | `string` | Currency code for display |
| `status` | `string` | `'pending'` \| `'confirmed'` \| `'completed'` \| `'cancelled'` \| `'declined'` |
| `createdAt` | `string` | ISO timestamp |

### `payments` Collection
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated document ID |
| `bookingId` | `string` | Reference to booking |
| `customerId` | `string` | Customer user ID |
| `customerName` | `string` | Customer name |
| `providerId` | `string` | Provider document ID |
| `providerName` | `string` | Provider name |
| `category` | `string` | Service category/name |
| `amount` | `number` | Total amount (service fee + platform fee) |
| `status` | `string` | `'paid'` \| `'pending'` \| `'refunded'` \| `'cancelled'` |
| `createdAt` | `string` | ISO timestamp |

### `reviews` Collection
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated document ID |
| `providerId` | `string` | Provider document ID |
| `userId` | `string` | Reviewer user ID |
| `userName` | `string` | Reviewer display name |
| `rating` | `number` | Star rating (1–5) |
| `comment` | `string` | Review text |
| `createdAt` | `string` | ISO timestamp |

### `favorites` Collection
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated document ID |
| `userId` | `string` | User who favorited |
| `providerId` | `string` | Favorited provider |
| `providerName` | `string` | Provider name |
| `category` | `string` | Provider category |
| `emoji` | `string` | Provider emoji |
| `rating` | `number` | Provider rating |

### `pets` Collection
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated document ID |
| `userId` | `string` | Owner user ID |
| `name` | `string` | Pet name |
| `type` | `string` | `'dog'` \| `'cat'` \| `'bird'` \| `'rabbit'` \| `'fish'` |
| `breed` | `string` | Breed |
| `age` | `number` | Age in years |
| `notes` | `string` | Special notes |

### `users` Collection
Stores profile extensions beyond Firebase Auth:
| Field | Type | Description |
|---|---|---|
| `email` | `string` | Email address |
| `name` | `string` | Display name |
| `phone` | `string` | Phone number |
| `location` | `string` | City/location |

### `messages` Collection
Contact form submissions:
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Sender name |
| `email` | `string` | Sender email |
| `subject` | `string` | Subject category |
| `message` | `string` | Message body |
| `userId` | `string` | Authenticated user ID |
| `createdAt` | `string` | ISO timestamp |

---

## Core Functionality Implementations

### 1. Dynamic Availability Slots Engine
**Location:** `src/app/booking/page.tsx` (`timeSlots` useMemo + `bookedSlots` useEffect)

```
Algorithm:
1. Parse selected date → local weekday (split('-') to avoid UTC timezone shifts)
2. Read provider's availability[weekday]: isOpen, start, end
3. Fallback: if availability unset → isOpen=true, start='09:00', end='18:00'
4. Look up service duration → increment in minutes
5. Generate slots: for (m = startMin; m + increment <= endMin; m += increment)
   → "HH:MM" value + "H:MM AM/PM" label
6. Fetch existing bookings: getBookingsForProviderDateRest(provider, date)
7. Filter bookedSlots: ONLY status !== 'cancelled' && status !== 'declined'
   → pending/confirmed/completed block slots
   → cancelled/declined RELEASE slots immediately
8. Render: disabled buttons with line-through for booked slots
9. Submit guard: re-fetch bookings, status check, conflict toast
```

**Critical edge case — UTC timezone shift:** Uses `dateString.split('-').map(Number)` + `new Date(year, month-1, day)` instead of `new Date(dateString)` to avoid off-by-one day errors caused by UTC parsing.

### 2. Multi-Currency System
**Location:** `src/app/dashboard/ProviderDashboard.tsx`

- **Input:** Searchable combobox-style dropdown (`<input>` + filtered `<datalist>`)
- **Supported currencies:** USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, INR, BRL, MXN, KRW, SEK, NOK, DKK, NZD, SGD, HKD, TRY, ZAR, AED, SAR
- **Storage:** Per-service-item `currency` string in `providers[].services[].currency`
- **Display:** Currency symbol maps on booking summary, payment ledger, provider detail cards
- **State:** Falls back to `'USD'` if no currency set on a service

### 3. Admin Review Management Cascade
**Location:** `src/app/admin/page.tsx` (`handleDeleteReview` + `handleSaveReview`)

```
Flow:
1. Extract providerId from the review document before mutating
2. Execute the review operation (delete or update)
3. Query remaining reviews: getReviewsByProviderRest(targetProviderId)
4. Calculate aggregates:
   - totalRemaining = remaining.length
   - sumStars = sum of all ratings
   - computedAvgRating = totalRemaining > 0 ? sumStars / totalRemaining : 0
5. Write to provider document:
   - reviews: totalRemaining
   - rating: parseFloat(computedAvgRating.toFixed(1))
6. Update local providers state for instant UI sync
```

**Edge cases handled:**
- Deleting the **last** review → `reviews: 0`, `rating: 0.0`
- Editing a review's rating → full recalculation from remaining reviews
- Provider document not found → error logged, non-fatal to review operation

### 4. Provider Operational Hours Form
**Location:** `src/app/dashboard/ProviderDashboard.tsx`

- **7-day toggle UI:** Each day has an `isOpen` checkbox + start/end time inputs
- **Day toggle fix:** Uses explicit `handleDayToggle(day, currentVal)` instead of inline `e.target.checked` to avoid stale React synthetic event state
- **localStorage backup:** On mount, if provider doc has no `availability` field, checks `localStorage` key `availability_{providerId}` for cached schedule
- **Standalone save button:** `forceSaveOperatingHours()` bypasses full profile save to write only the `availability` map directly — avoids silent field overwrites from other profile fields
- **Availability payload construction:** Uses `Boolean()` for `isOpen`, `|| '09:00'` / `|| '17:00'` fallbacks for start/end to guarantee Firestore-safe primitives

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
- **Race condition fix:** `initUser()` calls `setUser(appUser)` at the start (before Firestore enhancement) so `loading=false` doesn't leave `user=null` during redirect guard checks

### Local Auth (localAuth.ts)
- **Storage:** `localStorage` (users + session)
- **Password:** SHA-256 hashed via Web Crypto API (`crypto.subtle.digest`)
- **Session:** Stores `AppUser` in localStorage under `paws_session`

---

## Firestore REST API Layer (`firestore-rest.ts`)

Used in place of the Firebase SDK, which can hang in sandboxed environments. All calls go to the Firestore REST API via plain `fetch`.

### Architecture
- `fetchCollection()` — Generic `GET` on collection URL + client-side filter + map
- `fetchWhere()` — Shorthand for client-side equality filter (no composite indexes needed)
- `toFieldValue()` / `fieldToValue()` — Convert between JS values and Firestore REST wire format (`stringValue`, `integerValue`, `doubleValue`, `booleanValue`, `arrayValue`, `mapValue`, `nullValue`)
- `docUrl()` — Constructs Firestore REST endpoint URL for a collection/document
- `authGet()` / `authPost()` — Authenticated fetch wrappers

### Key API Functions
| Function | Purpose |
|---|---|
| `getAllProvidersRest()` | Fetch all providers |
| `getProviderByIdRest(id)` | Fetch single provider by document ID |
| `getProviderByEmailRest(email)` | Fetch provider by contact email |
| `getReviewsByProviderRest(id)` | Fetch all reviews for a provider |
| `getUserReviewsRest(userId)` | Fetch reviews by a user |
| `addReviewRest(data)` | Create review + sync provider aggregates |
| `getBookingsForProviderDateRest(providerId, date)` | Fetch bookings for provider+date (collision detection) |
| `addBookingRest(data)` | Create booking with timeSlot, currency, customerPhone |
| `updateBookingRest(id, updates)` | Update booking status |
| `getUserPetsRest(userId)` | Fetch user's pets |
| `addPetRest(data)` | Add a pet |
| `updateProviderByIdRest(docId, data)` | Update provider fields (used for rating/reviews sync) |
| `updateUserDocRest(userId, data)` | Update user profile fields |

---

## Key Design Patterns

### Auth Guards
- `useAuth()` wrapper redirects unauthenticated users to `/login`
- Individual components check `user` and redirect in `useEffect` or inline
- API action guards (favorite, review) redirect + toast if unauthenticated

### Server + Client Component Split
- `/services`: Server component fetches data → passes to `ServicesClient` for interactivity
- `/provider/[id]`: Server component fetches provider + reviews → passes to `ProviderClient`
- Booking page fetches all data client-side via REST API (needs auth context)

### Hook Ordering Constraint (Critical)
**Problem:** "Rendered fewer hooks than expected" React crash when conditional early returns appeared before hook declarations.

**Fix:** All `useState`, `useEffect`, `useMemo`, and `useCallback` hooks are declared in a fixed order before any early return. The `timeSlots` useMemo is hoisted above the auth guard early return in `BookingForm()`.

### Date Parsing — Local vs UTC
**Problem:** `new Date('2024-01-15')` interprets the input as UTC, producing "Jan 14" in timezones behind UTC.

**Fix:** Manual local date construction via `dateString.split('-').map(Number)` → `new Date(year, month-1, day)`.

### Toast Notification System
- `ToastProvider` wraps root layout
- `useToast()` hook returns `showToast(message, type)` where type is `'success' | 'error' | 'info'`
- Auto-dismisses after 3 seconds

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

## Known Issues & Limitations

1. **Cross-origin dev environment:** `allowedDevOrigins` in `next.config.ts` is required for React hydration on proxied domains
2. **Google sign-in:** Requires domain to be authorized in Firebase Console
3. **Admin panel:** Access restricted to `rolandabj@gmail.com` only (hardcoded email check)
4. **Payment system:** Simulated/ledger-only — no real payment processing integration
5. **Firestore SDK & initial page load:** The `getDoc` call in `AuthContext` still uses the Firebase SDK (wrapped in a 4s timeout). If the Firestore REST API is unreachable, fallbacks gracefully via `.catch()`.
6. **Statics in footer:** Blog, Careers, Press, Help Center, etc. are placeholder links

