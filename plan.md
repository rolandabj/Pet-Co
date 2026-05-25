# Paws & Co. -- Comprehensive System Architecture

> **Last updated:** 2026-05-25
> **Next.js 16.2.6 . App Router . TypeScript 5 . Tailwind CSS 4 . Firebase Firestore (Client SDK + REST API + Admin SDK)**

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
- Browse/search/filter service providers (Dog Walkers, Vets, Groomers, Pet Hotels, Pet Sitters, Pet Shops)
- View provider profiles with services, availability, ratings, and reviews
- Book appointments with date/time/service selection
- Manage pets profile (add/edit/remove pets)
- Favorite providers for quick access
- Leave reviews for completed bookings

### Service Providers
- Manage business profile (name, description, logo, contact info, location, social media)
- Set operational hours per day of the week
- Manage services (add/edit/remove service listings with pricing and duration)
- Manage products (add/edit/remove retail products with images)
- View dashboard with earnings, active bookings, listings count, and average rating
- Manage incoming bookings (confirm/complete/cancel)
- Delete account (cascading delete of all associated data)

### Admin
- Central admin panel with tabs for users, providers, bookings, payments, and reviews
- Monthly analytics (revenue MTD, booking count, active listings)
- Delete user accounts from the admin panel

---

## 2. Tech Stack & Architecture

### 2.1 Core Stack

| Layer | Technology | Version / Config |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.2.6 |
| **Bundler** | Turbopack (dev), Webpack (prod) | -- |
| **Language** | TypeScript | ^5 |
| **Styling** | Tailwind CSS | ^4 |
| **Typography** | DM Serif Display + DM Sans | Google Fonts |
| **Auth** | Firebase Auth (Google OAuth + Email/Password) | firebase ^12.13.0 |
| **Database** | Cloud Firestore | Triple-access (see sec 3) |
| **Storage** | Firebase Storage | Provider logos |
| **Linting** | ESLint 9 | eslint ^9 |

### 2.2 API Routes Summary

| Endpoint | Method(s) | Runtime | Auth | Purpose |
|---|---|---|---|---|
| `/api/me/account` | DELETE | Node.js | Firebase ID token | Cascading delete of provider account |
| `/api/me/pets` | GET, POST | Node.js | Firebase ID token | List/create user's pets |
| `/api/me/favorites` | GET, POST, DELETE | Node.js | Firebase ID token | List/add/remove favorites |
| `/api/auth/delete-user` | DELETE | Node.js | Firebase ID token | Delete Firebase Auth user (Admin SDK) |
| `/api/bookings` | GET, POST | Node.js | Firebase ID token | List/create bookings |
| `/api/payments` | GET, POST | Node.js | Firebase ID token | List/create payments |
| `/api/providers` | GET | Edge | None (public) | List providers |
| `/api/reviews` | GET, POST | Node.js | Firebase ID token | List/create reviews |

---

## 3. State & Data Flow

### 3.1 Authentication Context

The `AuthContext` manages all auth state:

- `user: AppUser | null` -- Current user profile
- `firebaseUser: FirebaseUser | null` -- Raw Firebase Auth user
- `loading: boolean` -- True while initial auth state is resolving
- `isInitialized: boolean` -- Set after first onAuthStateChanged fires
- `effectiveUserId: string | null` -- Canonical ID for Firestore queries
- `login(email, password)` -- Email/password sign-in
- `register(email, password, name, role)` -- Registration + Firestore user doc creation
- `googleLogin(role, providerType?)` -- Google OAuth with popup/redirect + retry logic
- `logout()` -- Clear local session + Firebase sign-out

### 3.2 Firestore Access Patterns (Triple-Access)

| Layer | Used Where | Auth Mechanism | When to Use |
|---|---|---|---|
| **Firebase Client SDK** | Client components | Firebase ID token (auto-attached) | Simple reads/writes (e.g., provider profiles) |
| **Firestore REST API** | Client components | Bearer token from getIdToken() | Operations where SDK might hang |
| **Firestore Admin REST API** | Server API routes | Google OAuth2 service account token | Operations bypassing security rules |

### 3.3 Data Fallback Chain

For user-owned data (pets, favorites), 4-layer fallback:
1. Firebase SDK getDocs query
2. REST :runQuery
3. REST GET-by-ID for each doc known to localStorage
4. Raw localStorage (last resort)

### 3.4 Account Deletion Flow

DELETE /api/me/account:
1. Authenticate via requireFirebaseUser(request)
2. Query relational docs (bookings, payments, reviews, favorites)
3. Batch delete relational docs
4. Delete provider doc
5. Delete user doc from Firestore
6. Delete Firebase Auth user via Admin SDK
7. Client: localAuth.deleteUser() + redirect

---

## 4. Database Schema

### Collection: `users`

Document ID = Firebase Auth UID.

Fields: role (string), name (string), email (string?), photoURL (string?), phone (string?), createdAt (timestamp), authMethod (string).

### Collection: `providers`

Document ID = Firebase Auth UID.

Fields: name, type (walkers/vets/hotels/sitters/grooming/shops), category, emoji, businessName, desc, email, phone, location, googleMapsUrl, logoUrl, rating, reviews, price, since, tags[], socialMedia{}, availability{}, services[], products[].

### Collection: `bookings`

Fields: serviceType, providerId, providerName, userId, userName, userEmail, date, time, status (pending/confirmed/completed/cancelled), price, platformFee, petName?, instructions?, phone?, createdAt.

### Collection: `payments`

Fields: bookingId, providerId, userId, amount, platformFee, status (pending/paid), createdAt.

### Collection: `reviews`

Fields: providerId, userId, userName, rating (1-5), comment?, createdAt.

### Collection: `pets`

Fields: userId, name, type (Dog/Cat/etc), breed?, age?, weight?, medicalNotes?.

### Collection: `favorites`

Fields: userId, providerId, targetId? (fallback).

---

## 5. Workspace Setup & DevOps

### 5.1 One-Shot Setup

```bash
bash scripts/setup.sh
```

This script:
1. Installs npm dependencies
2. Creates .env.local from .env.local.example
3. Overwrites with env-provided variables
4. Cleans .next cache and starts dev server

### 5.2 Required Environment Variables

NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_APP_ID, NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_CLIENT_SECRET, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ALLOWED_DEV_ORIGINS.

### 5.3 AGENTS.md Init

AGENTS.md is AI agent persistent memory. On each new conversation: read AGENTS.md, run setup.sh, review plan.md.

### 5.4 Firestore Security Rules

Written in firestore.rules with per-doc ownership checks. Deploy: `npx firebase deploy --only firestore:rules --project pet-co-fc4d6`.

---

## 6. Recent Milestones

### 6.1 Turbopack Hydration Resolution
Fix: added allowedDevOrigins in next.config.ts for proxy-domain dev.

### 6.2 Dynamic Google Auth Role-Gating
Fix: role + providerType selection before sign-in; getExistingRole() lookup.

### 6.3 Cascading Account Deletion
Fix: gRPC -> REST API; step 5 deletes user doc entirely; localAuth cleanup.

### 6.4 Service Provider Category Editing
Fix: Category dropdown in Business Profile; type/category/emoji saved.

### 6.5 Password Confirmation on Registration
Fix: Confirm Password field with validation on mismatch.

### 6.6 Booking Service Dropdown Empty State
Fix: Empty dropdown when preselected provider has no services.

### 6.7 Google Sign-In Network Error Retry
Fix: Auto-retry signInWithPopup with 1.5s delay.

### 6.8 Admin Panel User List Cleanup
Fix: Delete user doc from Firestore; clear localStorage.

---

## 7. Upcoming Roadmap

### Immediate: Admin Panel Enhancement
- User Directory (High)
- Financials (High)
- Global Filtering (Medium)
- Analytics with charts (Medium)
- Admin Account Deletion (Medium)

### Short-Term
- Deploy Firestore Security Rules
- Remove hardcoded admin email
- Rate limiting
- Pagination for admin tables

### Medium-Term
- REST-only data layer consolidation
- Request caching
- Stripe integration
- Email notifications
- Paginated queries

### Long-Term
- Mobile app
- i18n
- Real-time chat
- Subscription plans

---

*This document is the single source of truth for the Paws & Co. codebase.*
