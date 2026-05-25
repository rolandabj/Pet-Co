<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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

## Debug Logging Added
- `console.log('OUTGOING PAYLOAD:')` right before each fetch
- `console.log('data.userId:')` to verify userId value
- `console.error('FIRESTORE WRITE ERROR:')` with the error response body on non-ok responses
- `console.error('...network error:')` on fetch exceptions
