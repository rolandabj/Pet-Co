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
    ├── providers.ts              # Firestore SDK helpers for providers
    ├── provider-rest.ts          # Firestore REST API helpers (for server components)
    ├── favorites.ts              # Firestore SDK helpers for favorites
    └── reviews.ts                # Firestore SDK helpers for reviews
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
- **Data source:** Firestore REST API (server-side fetch) with 60s revalidation
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
- **Data source:** Firestore SDK (bookings + payments collections)
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
- **Data sources:** Firestore SDK (bookings, payments, pets), favorites.ts (SDK), reviews.ts (SDK)
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
- **Data sources:** `localAuth.getAllUsers()`, Firestore SDK (bookings, providers, payments)
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
- **Password:** Stored as plaintext (dev-only fallback — NOT production-safe)
- **Session:** Stores `AppUser` in localStorage under `paws_session`

### Firestore REST API Helpers (provider-rest.ts)
Used by **server components** (`/services`, `/provider/[id]`) since the Firebase SDK hangs in this sandboxed environment.

| Function | Purpose |
|---|---|
| `getProviderByIdRest(id)` | Fetch single provider by ID |
| `getReviewsByProviderRest(id)` | Fetch reviews for a provider, sorted newest-first |
| `addReviewRest(data)` | Create a new review document |
| `findFavoriteIdRest(userId, providerId)` | Check if a favorite exists |
| `addFavoriteRest(data)` | Add a favorite |
| `removeFavoriteRest(docId)` | Remove a favorite by doc ID |

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

## Known Issues & Limitations

1. **Cross-origin dev environment:** `allowedDevOrigins` in `next.config.ts` is required for React hydration
2. **Google sign-in:** Requires domain to be authorized in Firebase Console
3. **Local auth:** Passwords stored as plaintext (dev-only — not for production)
4. **Admin panel:** No actual role-based access control (any logged-in user can access)
5. **Firestore SDK:** May hang in sandboxed environments — REST API used as fallback
6. **Payment system:** Simulated/ledger-only — no real payment processing
7. **Statics in footer:** Blog, Careers, Press, Help Center, etc. are placeholder links
8. **Loading states:** Some pages (dashboard, admin) fetch all data on mount without streaming/skeletons
