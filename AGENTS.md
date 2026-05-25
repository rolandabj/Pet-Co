<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workspace Setup (run on every new conversation)

Before coding, run the setup script to install deps and configure `.env.local`:

```bash
bash scripts/setup.sh
```

The script reads from environment variables. If you're in an OpenHands session without those vars set, create `.env.local` manually from `.env.local.example` and fill in the Firebase config values.

# Firestore-REST Debug Notes

## Write Operations (addPetRest / addFavoriteRest)
- Both functions manually construct `fields: { ... }` with explicit typed values (stringValue, doubleValue, etc.)
- userId is explicitly injected as `{ stringValue: data.userId }` at the field level
- No `docToJson` helper exists — the payload is never auto-transformed, so no double-wrapping risk

## Verified via curl (2026-05-24)
- Firestore REST API `POST /documents/pets` with valid Firebase ID token → **HTTP 200**
- Payload format: `{"fields":{"userId":{"stringValue":"..."},"name":{"stringValue":"..."},"type":{"stringValue":"Dog"},...}}`
- This confirms the API accepts writes when the auth token is valid and payload is correctly formatted

## Security Rules (firestore.rules)
- The code works around the query-analyzer limitation via a **4-layer fallback chain** in `getUserPetsRest`/`getUserFavoritesRest`:
  1. Firebase SDK `getDocs` query (blocked by `||` in list rules for non-admin users)
  2. REST `:runQuery` (blocked because `resource.data` is unavailable for REST list ops)
  3. **REST GET-by-ID** for each document known to localStorage — the `get` rule has `resource.data` available, so `ownsExistingDoc()` works correctly. Deleted docs return 403/404 and are skipped (eliminates phantom data after Firestore delete).
  4. Raw localStorage (last resort when ALL remote reads fail)
- `allow get: if ownsExistingDoc() || isAdmin()` is fine — `get` has `resource.data`.
- No rule changes needed — the current rules work with this approach.
- **Cannot deploy from this environment** — workload identity has no access to `pet-co-fc4d6` project.
- To deploy: `npx firebase deploy --only firestore:rules --project pet-co-fc4d6` from local machine.

## Admin SDK Firestore gRPC issue
- The Admin SDK's `getFirestore()` uses **gRPC** transport, which can silently fail in sandboxed/container environments (gRPC native C++ bindings may not load correctly).
- **Fix**: Use `src/lib/firestore-admin-rest.ts` for server-side Firestore operations instead. This module authenticates via `google-auth-library` (OAuth2) and makes direct REST API calls via `fetch` — no gRPC involved.
- `getAdminAuth()` (Firebase Auth Admin SDK) still works fine — it uses a different API with reliable transport.

## Server-only Firestore REST helpers (`firestore-admin-rest.ts`)
- `getAccessToken()` — cached OAuth2 token for the service account (auto-refreshes before expiry)
- `getDocRest(collection, docId)` — GET a single document; returns `fields` object or `null`
- `deleteDocRest(collection, docId)` — DELETE a single document; returns `true` if existed, `false` if 404
- `deleteDocsBatch(docs)` — batch DELETE up to 500 docs via `:commit`
- `runQueryRest(collection, field, op, value)` — structured queries via `:runQuery`
- All functions throw on non-404 errors, making failures visible

## Account deletion flow (`DELETE /api/me/account`)
1. Query relational docs (bookings, payments, reviews, favorites) by `providerId`
2. Fetch provider doc (for logging only)
3. Batch delete relational docs via `deleteDocsBatch`
4. Delete provider doc via `deleteDocRest('providers', providerId)`
5. **Delete user doc** via `deleteDocRest('users', providerId)` (not just downgrade — ensures admin panel stops showing user)
6. Delete Firebase Auth user via `auth.deleteUser(decoded.uid)` — **throws on failure**
7. Returns JSON summary or 500 on failure

## Known pitfalls
- **Users docs lack `email` field**: `updateUserDocRest()` only stores `{ role, name }` — always look up by UID/docId, never by email
- **Admin panel shows localAuth users too**: `admin/page.tsx` merges `getAllUsersRest()` + `localAuth.getAllUsers()` — deleting Firestore doc alone isn't enough if admin's localStorage has a stale entry. The ProviderDashboard now calls `localAuth.deleteUser()` after successful deletion
- **gRPC silently fails in containers**: Admin SDK `getFirestore()` uses gRPC which can fail without error. Always use `firestore-admin-rest.ts` for server-side Firestore operations

## Debug Logging Added
- `console.log('OUTGOING PAYLOAD:')` right before each fetch
- `console.log('data.userId:')` to verify userId value
- `console.error('FIRESTORE WRITE ERROR:')` with the error response body on non-ok responses
- `console.error('...network error:')` on fetch exceptions
