# Pet-Co / Paws & Co. Marketplace - Architectural Blueprint

## 1. Project Overview & Purpose
Pet-Co is a production-ready, dynamic multi-user care marketplace built to bridge pet owners with local service providers (Dog Walkers, Veterinarians, Dog Hotels, Pet Shops, Groomers, and Pet Sitters). The app supports dynamic data fetching, interactive bookings, client feedback, personal pet management hubs, and a secure 3-tier user role structure.

## 2. Technology Stack
- **Framework:** Next.js 16 (App Router)
- **UI Architecture:** React 19 & TypeScript 5 (Strict Mode)
- **Styling Engine:** Tailwind CSS v4 with @tailwindcss/postcss
- **Database & Identity Backend:** Google Firebase Cloud Infrastructure
- **State Management:** React Context API (`AuthContext`, `ToastContext`)

## 3. Database Architecture (Google Cloud Firestore Collections)
The application has transitioned away from static `data.ts` files to a fully live, reactive NoSQL cloud database across 8 core collections:
- `providers`: Stores marketplace business entries, profiles, ratings, prices, and locations.
- `users`: Extends basic authentication profiles with custom fields like `phone`, `location`, and account `role`.
- `bookings`: Tracks client appointments, dates, times, pricing, and fulfillment state.
- `favorites`: Maps explicit user IDs to their favorited provider profile selections.
- `reviews`: Stores user feedback ratings (1-5 stars) and structural comment text strings.
- `messages`: Acts as a cloud contact inbox logging user help, feedback, and support form submissions.
- `payments`: Holds the system transaction records matching business income to individual client purchases.
- `pets`: Retains owner pet profiles including pet name, type, breed, age, and dietary/medical notes.

## 4. Feature & Security Implementations
- **Dynamic Google Authentication:** Production-ready Google OAuth sign-in popups tied securely to custom whitelisted All-Hands cloud environment domains.
- **Dynamic Booking Validation:** Form processing saves appointments into Firestore with an initial 'pending' state and populates individual user calendar grids dynamically.
- **Persistent Favorites Flow:** Toggling heart icons reads and writes instantly to the cloud, allowing preferences to persist across hard browser refreshes.
- **Feedback Loops:** Active users can write text reviews and apply numerical star ratings to provider profile headers, which automatically updates the provider profiles and logs to the user's dashboard review ledger.
- **3-Tier Role-Based Payment Ledger:** 1. *Customers ('owner'):* Can view only payment receipts they have personally spent.
  2. *Businesses ('provider'):* Can view only payment lines directed directly to their store revenue.
  3. *Super Admin ('admin'):* Can look at, edit fields of, or delete any ledger receipt across the entire platform.
- **Administrative Control Hub (`/admin`):** Fully integrated CRUD admin platform, syncing user cancellations, modifications, and record deletions instantly to Cloud Firestore.
- **Pet Management Infrastructure:** Custom profile dashboard allowing owners to add or remove specific animals, which dynamically feeds into booking dropdown components to eliminate hardcoded values.

## 5. File & Route Directory Mapping
- `/src/app/layout.tsx`: Root global wrapper housing `AuthProvider`, `ToastProvider`, Navbar, and Footer.
- `/src/app/page.tsx`: Core customer landing page with service grids and call-to-actions.
- `/src/app/services/page.tsx`: Interactive search index directory featuring multi-category live filtering.
- `/src/app/provider/[id]/page.tsx`: Dynamic profile page generating individual vendor maps and review submissions.
- `/src/app/booking/page.tsx`: Advanced checkout compiler routing parameter values to database hooks.
- `/src/app/dashboard/page.tsx`: Split-view user context command station handling profiles, bookmarks, and pet lists.
- `/src/app/admin/page.tsx`: Executive panel handling user records, overall analytics graphs, and payment logs.
- `/src/app/contact/page.tsx`: Help-desk ticketing terminal forwarding messages straight to the database.
- `/src/context/AuthContext.tsx`: Core pipeline coordinating Firebase identity tokens and Firestore data merges.
- `/src/lib/firebase.ts`: Cloud initialization setup utilizing hidden workspace server keys.
- `.env.local.example`: A public structural template documenting required backend configuration flags.