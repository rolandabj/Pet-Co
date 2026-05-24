# Paws & Co. — Digital Marketplace Platform

## 1. Project Identity Overview

- **Title:** Paws & Co. Digital Marketplace Platform
- **Core Purpose:** Connecting pet parents seamlessly with validated multi-category service providers (veterinarians, pet sitters, pet shops, groomers, dog hotels, dog walkers).
- **Global Administrator Profile:** `rolandabj@gmail.com` — exclusive access to `/admin` panel with full CRUD over users, providers, bookings, payments, and reviews.

## 2. Core Tech Stack & Framework Architecture

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 16.2.6 — App Router architecture, Turbopack compilation engine |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 (`@import "tailwindcss"`, `@theme inline {}` tokens, custom utilities) |
| **Typography** | DM Serif Display (headings), DM Sans (body) — served via Google Fonts |
| **Authentication** | Google Firebase Auth — Google OAuth 2.0 (redirect + popup flows) + custom email/password via `localAuth` (SHA-256, localStorage) |
| **Database** | Google Cloud Firestore — primary data layer via Firestore REST API; Firebase SDK used for real-time listeners (`onSnapshot`) and mutations in dashboard components |
| **Storage** | Firebase Storage — bucket path `provider_logos/` for business logo image assets |
| **Dev Server** | `localhost:12000`, accessed cross-origin via proxy domain with `allowedDevOrigins` in `next.config.ts` |

## 3. Global Project Directory Structure Map

```
Paws & Co. (Pet-Co)/
├── plan.md                              # Project technical brief (this file)
├── AGENTS.md                            # Persistent agent memory for context
├── CLAUDE.md                            # Additional agent guidelines
├── README.md                            # Project overview readme
├── next.config.ts                       # Next.js config — allowedDevOrigins, image remotePatterns (firebasestorage.googleapis.com), Turbopack root
├── package.json                         # Deps: next 16.2.6, react 19.2.4, firebase ^12.13.0, tailwindcss 4, typescript 5
├── tsconfig.json                        # TypeScript configuration
├── scripts/
│   ├── reset-ratings.ts                 # Bulk reset provider rating/review fields
│   └── seed-firestore.ts                # Seed Firestore with initial provider data
├── src/
│   ├── app/                             # Next.js App Router pages
│   │   ├── layout.tsx                   # Root layout — AuthProvider, ToastProvider, Navbar, Footer, globals.css
│   │   ├── page.tsx                     # Home/Landing page — client component, live category counts, live testimonials
│   │   ├── globals.css                  # Tailwind 4 @theme (colors, fonts), custom keyframes
│   │   ├── login/page.tsx              # Login — email/password (localAuth) + Google OAuth
│   │   ├── register/page.tsx           # Register — role selector (owner/provider), email + Google flows
│   │   ├── services/
│   │   │   ├── page.tsx                # Services index — server component, Firestore REST, ?type= filter
│   │   │   └── ServicesClient.tsx      # Services list — client component, keyword search, filter chips
│   │   ├── provider/
│   │   │   └── [id]/
│   │   │       ├── page.tsx            # Provider detail — server component, force-dynamic
│   │   │       └── ProviderClient.tsx  # Provider detail UI — client component, reviews, favorites, products
│   │   ├── booking/page.tsx            # Booking wizard — client component, dynamic slots, 10% fee
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # User dashboard — multi-tab (bookings, favorites, pets, profile, reviews, payments)
│   │   │   └── ProviderDashboard.tsx   # Provider dashboard — 6-tab (services, products, bookings, reviews, profile), logo upload, availability, currency matrix
│   │   ├── admin/page.tsx              # Admin panel — restricted to rolandabj@gmail.com, 6-tab CRUD
│   │   ├── about/page.tsx              # About Us — static
│   │   ├── contact/page.tsx            # Contact — form submission via Firestore SDK
│   │   └── api/providers/route.ts      # API proxy for Firestore providers
│   ├── components/
│   │   ├── Navbar.tsx                  # Fixed top nav — logo, links, auth buttons, mobile menu
│   │   ├── Footer.tsx                  # Footer — column links, social icons, copyright
│   │   └── Toast.tsx                   # Toast notification — context + provider, 3s auto-dismiss
│   ├── context/
│   │   └── AuthContext.tsx             # Auth state — Firebase onAuthStateChanged, googleLogin, localAuth
│   └── lib/
│       ├── types.ts                    # TS interfaces — AppUser, ServiceProvider, ServiceItem, ProductItem, etc.
│       ├── data.ts                     # Static fallback provider data (12 entries, 6 types)
│       ├── firebase.ts                 # Firebase SDK init — singleton, lazy getFirebaseAuth/getFirestoreDb/getStorageDb
│       ├── localAuth.ts                # Local auth — SHA-256, localStorage users + session
│       ├── firestore-rest.ts           # Primary Firestore REST API layer — all collection helpers
│       ├── provider-rest.ts            # Provider REST helpers — mapDoc, getProviderByIdRest, getReviewsByProviderRest
│       ├── formatProductPrice.ts       # Currency formatter — 13 ISO codes to symbols ($, €, £, ¥, ₹, etc.)
│       ├── providers.ts                # (Legacy) Firestore SDK helpers for providers
│       ├── favorites.ts                # (Legacy) Firestore SDK helpers for favorites
│       └── reviews.ts                  # (Legacy) Firestore SDK helpers for reviews
```

## 4. Comprehensive Feature Manifest & Custom Business Logic

### Dynamic Homepage Aggregations
**Location:** `src/app/page.tsx`
- On mount, executes `getDocs(query(collection(db, 'providers')))` to count all provider documents grouped by `type` field.
- Renders real-time category badge counts per service type.
- Count labels are plural-aware via `countLabels` lookup map (e.g. `1 shop` vs `3 shops`).

### True Testimonial Synchronization
**Location:** `src/app/page.tsx` (lines 77-100)
- Queries `reviews` collection filtering `where('rating', '>=', 4)` with `limit(3)`.
- Renders live review cards with rating stars, text, user name, "Verified Pet Owner" badge.
- Falls back to a loading message when no reviews exist yet.

### Role-Based Contact Access Masking
**Location:** `src/app/provider/[id]/ProviderClient.tsx`
- Phone and email are completely hidden from non-authenticated users.
- Admin bypass: Contact fields render only when `user?.email === 'rolandabj@gmail.com'`.
- Customer phone fetched from user profile doc at booking time (never exposed publicly).

### Streamlined Call-to-Action Flows
- Hero CTAs route directly to `/services` — no intermediate friction.
- "Book Now" on provider profile -> `/booking?providerId={id}` with pre-selected provider.
- "Join as Pet Owner" -> `/register`, "List Your Service" -> `/register?provider=true`.

### Google Maps GPS Navigation Sync
**Location:** `src/app/provider/[id]/ProviderClient.tsx`
- **Primary:** `provider.googleMapsUrl` -> clickable "Open in Google Maps" link.
- **Fallback:** `provider.location` -> auto-encoded Google Maps search redirect.
- Both use `target="_blank" rel="noopener noreferrer"`.

### Isolated Multi-Service Booking Calendars
**Location:** `src/app/booking/page.tsx`
- Time slot engine generates slots from provider availability x service duration.
- Collision detection: Filters out times matching existing pending|confirmed|completed bookings.
- Cancelled/declined bookings release their slots.
- Race-condition guard re-queries bookings at submit time.

### Admin Financial Ledger Modals
**Location:** `src/app/admin/page.tsx`
- Payment modal: booking ID, total, date, customer/provider info, status.
- Event propagation isolation: `e.stopPropagation()` on dropdowns, rows, and modals.
- Booking detail popup: service fee, platform fee (10%), total, currency, status.
- Inline edit: status dropdowns and review editing without navigation.

### Custom Media Storage Pipelines
**Location:** `src/app/dashboard/ProviderDashboard.tsx`
- Logo upload: file -> storage ref -> uploadBytes -> getDownloadURL.
- Saved to provider doc via `updateProviderByIdRest`.
- Displayed on services catalog, provider profile hero, and dashboard preview.

### Searchable Multi-Currency Matrix
**Locations:** `src/app/dashboard/ProviderDashboard.tsx`, `src/lib/formatProductPrice.ts`
- Combo-box input with 13 currencies (USD, EUR, LBP, GBP, JPY, CNY, AED, SAR, EGP, CHF, INR, AUD, CAD).
- `onMouseDown` + `e.preventDefault()` + `e.stopPropagation()` eliminates blur/click race condition.
- `formatProductPrice()` maps codes to symbols or falls back to `{amount} {CODE}`.
- Firestore REST mappers read `currency: m.currency?.stringValue ?? 'USD'`.
- Rendered on public profile retail grid and dashboard product table.

### Zero-Lag Route Updates
**Location:** `src/app/provider/[id]/page.tsx`
- `export const dynamic = 'force-dynamic'` bypasses Next.js route cache.
- Removed `next: { revalidate: 60 }` from fetch calls.
- Provider edits appear instantly on the public view.

### Review Aggregation Engine
**Locations:** `firestore-rest.ts` + `ProviderDashboard.tsx` + `admin/page.tsx`
- Creation: review doc -> remaining reviews queried -> avg rating -> written to provider.
- Deleting the **last** review -> `reviews: 0, rating: 0.0`.
- Rating edit recalculates from scratch.

### Provider Operational Hours Form
**Location:** `src/app/dashboard/ProviderDashboard.tsx`
- 7-day toggle UI with isOpen + start/end time inputs.
- Explicit `handleDayToggle()` to avoid stale React synthetic events.
- localStorage backup for cached schedule.
- Standalone save writes only the `availability` map.

### Favorites System
**Locations:** `firestore-rest.ts` + `ProviderClient.tsx` + `dashboard/page.tsx`
- Heart icon toggles via findFavoriteIdRest / addFavoriteRest / removeFavoriteRest.
- Favorites tab in user dashboard lists saved providers.
- Unauthenticated attempt redirects to /login.

### Firebase Auth Error Recovery
**Location:** `src/context/AuthContext.tsx`
- Popup closed: silent cancel. Blocked: falls back to redirect.
- Timeout: shows domain authorization instructions.
- Unauthorized domain: shows whitelist instructions.
- Race fix: setUser called before Firestore enhancement.

## 5. Data Architecture

### Firestore Collections

| Collection | Key Fields | Used By |
|---|---|---|
| `providers` | name, type, category, rating, reviews, desc, tags, emoji, price, location, phone, email, businessName, logoUrl, services[], products[], availability{}, socialMedia{} | All pages |
| `bookings` | providerId, userId, serviceType, date, time, price, currency, status, customerPhone, instructions, timeSlot | Booking, dashboards, admin |
| `payments` | bookingId, providerId, userId, customerName, amount, currency, status, category, createdAt | Booking, dashboards, admin |
| `reviews` | providerId, userId, userName, rating, comment, createdAt | Provider page, dashboards, admin, home |
| `users` | uid, email, name, phone, photoURL, role | Auth, dashboards, admin |
| `pets` | userId, name, type, breed, age | Booking, dashboard |
| `favorites` | userId, providerId | Provider page, dashboard |
| `contact` | name, email, message, createdAt | Contact page |

### REST API Layer (`firestore-rest.ts`)
- Primary data access for all pages — avoids Firebase SDK sandbox hanging.
- `toFieldValue()` / `fieldToValue()` — bidirectional JS to Firestore REST wire format.
- `fetchCollection()` — generic GET with client-side filtering (no composite indexes).
- `fetchWhere()` — shorthand for client-side equality filter.
- Field-level PATCH via `updateMask.fieldPaths` — only specified fields overwritten.

## 6. Auth System Architecture

### Firebase Auth (Primary)
- Singleton via `getApps()`, lazy init.
- Google OAuth with optional custom client_id from env.
- `onAuthStateChanged` auto-restores sessions.
- googleLogin: getRedirectResult (5s) -> signInWithPopup (15s), wrapped in custom timeout().

### Local Auth (Fallback)
- localStorage under `paws_users` and `paws_session`.
- SHA-256 via Web Crypto API.
- `localAuth.getSession()` returns AppUser or null.

## 7. Key Design Patterns & Constraints

### Server + Client Component Split
- `/services`: server REST fetch -> ServicesClient client component.
- `/provider/[id]`: server REST fetch -> ProviderClient client component.
- `/booking`: fully client-side (requires auth + real-time availability).

### Hook Ordering Constraint (Critical)
- All hooks declared in fixed order before any early return.
- `timeSlots` useMemo hoisted above auth guard to prevent crash.

### Date Parsing — Local vs UTC
- `new Date('2024-01-15')` is UTC -> off-by-one in negative offsets.
- Fix: Manual local date via `dateString.split('-').map(Number)`.

### Toast Notification System
- ToastProvider in root layout -> useToast() returns showToast(message, type).
- Auto-dismisses after 3s. Types: success | error | info.

## 8. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase REST API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional | Storage bucket URL |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Optional | Firebase app ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |

## 9. Tailwind CSS Theme

| Token | Value | Usage |
|---|---|---|
| `--font-heading` | DM Serif Display, Georgia, serif | All headings |
| `--font-body` | DM Sans, sans-serif | Body text |
| `--color-primary` | #E86A33 | CTAs, active states |
| `--color-primary-dark` | #D4552A | Hover states |
| `--color-primary-light` | #F5A07A | Light accents |
| `--color-secondary` | #2C3E50 | Default text color |
| `--color-accent` | #3AB795 | Secondary buttons, success |

**Custom animations:** fade-in-up (0.6s), modal-in (0.3s), slide-in-right (0.3s), float (6s infinite).

## 10. Known Issues & Limitations

1. **Cross-origin dev:** allowedDevOrigins required for React hydration on proxied domains.
2. **Google sign-in:** Domain must be authorized in Firebase Console.
3. **Admin panel:** Hardcoded email check — no role-based access control.
4. **Payment system:** Simulated/ledger-only — no real payment gateway.
5. **Firestore SDK init:** getDoc in AuthContext uses SDK (4s timeout) — may hang in sandbox.
6. **Footer statics:** Blog, Careers, Press, etc. are placeholder links.
7. **No rate limiting:** No request throttling on booking/review endpoints.
