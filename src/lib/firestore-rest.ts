/**
 * Firestore REST API helpers.
 * Used in place of the Firebase SDK, which may hang in sandboxed
 * environments.  All calls go directly to the Firestore REST API
 * via plain `fetch`, so they respect standard HTTP timeouts.
 */
import type { ServiceProvider, ServiceItem, ProductItem } from './types';
import { getFirebaseAuth, getFirestoreDb } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Auth helpers (F4: pass Firebase ID token to satisfy security rules) ─────

/**
 * Obtain Firebase Auth ID token and return Authorization headers.
 * Throws if Firebase Auth is configured but no user is signed in —
 * this prevents unauthenticated Firestore writes/reads for user-owned data
 * (pets, favorites, reviews, payments) where the backend requires a valid
 * Firebase token to enforce security rules.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { auth } = getFirebaseAuth();
    if (!auth) return headers; // Firebase not configured — proceed without auth
    // Retry loop: wait up to ~2 s for the Firebase Auth SDK to initialise
    // so the first dashboard query doesn't fire without a token.
    for (let i = 0; i < 10; i++) {
      if (auth.currentUser) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!auth.currentUser) {
      throw new Error('No Firebase user signed in. Cannot authenticate Firestore request.');
    }
    const token = await auth.currentUser.getIdToken(true);
    headers['Authorization'] = `Bearer ${token}`;
  } catch (err) {
    // Re-throw auth errors so callers know the request will fail
    if (err instanceof Error && err.message.includes('No Firebase user')) {
      throw err;
    }
    // Firebase SDK errors (e.g., network) — log and re-throw
    console.error('[getAuthHeaders] Failed to obtain auth token:', err);
    throw err;
  }
  return headers;
}

/**
 * Fetch wrapper that attaches the Firebase ID token (when available)
 * and the API key, so Firestore security rules see an authenticated request.
 * Re-throws errors from getAuthHeaders so callers can handle auth failures.
 */
async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders().catch((err) => {
    // Re-throw auth errors immediately — callers can fall back gracefully
    throw err;
  });
  const separator = url.includes('?') ? '&' : '?';
  return fetch(`${url}${separator}key=${API_KEY}`, { ...options, headers: { ...headers, ...options?.headers } });
}

// ─── Structured query helper (F4: server-side filter) ────────────

/**
 * Execute a Firestore structured query via the `:runQuery` REST endpoint.
 * Results are filtered server-side so the security rules don't reject
 * collection-wide reads.
 */
async function runQueryRest<T>(
  collectionId: string,
  field: string,
  value: string,
  mapFn: (doc: { id: string; data: Record<string, any> }) => T,
): Promise<T[]> {
  console.log('🐛 runQueryRest start', { collection: collectionId, field, value });

  try {
    const { auth } = getFirebaseAuth();
    console.log('🐛 Firebase currentUser', {
      uid: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
    });
  } catch {
    console.warn('🐛 runQueryRest: getFirebaseAuth threw');
  }

  try {
    // Retry once on 403: the Firebase Auth token may not have been ready
    // when the first request was dispatched (transient init lag).
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await authFetch(`${FIRESTORE_BASE}:runQuery`, {
          method: 'POST',
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId }],
              where: {
                fieldFilter: {
                  field: { fieldPath: field },
                  op: 'EQUAL',
                  value: { stringValue: value },
                },
              },
            },
          }),
        });
      } catch (fetchErr) {
        // Network error on this attempt — log and retry if first attempt
        console.warn(`runQueryRest network error for ${collectionId} (attempt ${attempt}):`, fetchErr);
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        break;
      }

      console.log('🐛 REST response status', res.status);

      if (res.ok) {
        try {
          const json = await res.json();
          console.log('🐛 REST raw result', json);
          const documents: Array<{ id: string; data: Record<string, any> }> = (json as Array<{ document?: any }> | undefined)
            ?.map((item) => (item?.document ? docFromJson(item.document) : null))
            .filter((d): d is NonNullable<typeof d> => d != null) ?? [];
          return documents.map(mapFn);
        } catch (parseErr) {
          // JSON parsing failed — fall through to SDK fallback
          console.warn(`runQueryRest JSON parse error for ${collectionId}:`, parseErr);
          break;
        }
      }

      if (res.status === 403 && attempt === 0) {
        const body = await res.text().catch(() => '(no body)');
        console.warn(`🐛 runQueryRest got 403 (attempt ${attempt}) for ${collectionId}:`, body);
        // Transient 403 — wait, re-fetch the token, and retry once.
        // If the retry also 403s, fall through to the SDK fallback below.
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Non-403 failure or second 403 — log as warn (REST is fallback; SDK is primary)
      if (!res.ok) {
        const body = await res.text().catch(() => '(no body)');
        console.warn(`🐛 runQueryRest HTTP ${res.status} for ${collectionId}; falling back:`, body);
      }
      break;
    }
  } catch (outerErr) {
    // Catch any unexpected error at the outer level so we always
    // fall through to the SDK/localStorage fallback instead of
    // propagating the error to the caller.
    console.warn(`runQueryRest unexpected error for ${collectionId}:`, outerErr);
  }

  // Fallback: the REST :runQuery endpoint is treated as a list operation
  // by security rules, where `resource.data` is unavailable. Use the
  // Firebase SDK instead, which handles query-based reads properly.
  console.warn(`runQueryRest got persistent 403 for ${collectionId} — falling back to Firebase SDK`);
  return runQuerySdk(collectionId, field, value, mapFn);
}

/** Fallback query using the Firebase SDK when the REST :runQuery gets a 403. */
async function runQuerySdk<T>(
  collectionId: string,
  field: string,
  value: string,
  mapFn: (doc: { id: string; data: Record<string, any> }) => T,
): Promise<T[]> {
  let db;
  try {
    db = getFirestoreDb();
  } catch {
    return runQueryLocal(collectionId, value, mapFn);
  }
  if (!db) return runQueryLocal(collectionId, value, mapFn);

  try {
    const q = query(collection(db, collectionId), where(field, '==', value));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapFn({ id: d.id, data: d.data() }));
  } catch {
    return runQueryLocal(collectionId, value, mapFn);
  }
}

/**
 * SDK-first owned-query helper.
 * Fetches user-scoped documents via the Firebase SDK with a strict
 * userId == request.auth.uid check, so Firestore security rules see
 * an authenticated list/get request that passes ownsExistingDoc().
 */
async function runOwnedQuerySdk<T>(
  collectionId: string,
  userId: string,
  mapFn: (id: string, data: any) => T,
): Promise<T[]> {
  const db = getFirestoreDb();
  const { auth } = getFirebaseAuth();

  if (!db) {
    throw new Error(`Firestore SDK unavailable for ${collectionId}`);
  }

  if (!auth?.currentUser) {
    throw new Error(`No Firebase currentUser for ${collectionId} read`);
  }

  const firebaseUid = auth.currentUser.uid;

  console.log('🐛 SDK OWNED QUERY DEBUG', {
    collectionId,
    userId,
    firebaseUid,
    email: auth.currentUser.email,
    sameUser: userId === firebaseUid,
  });

  if (userId !== firebaseUid) {
    throw new Error(
      `UID mismatch for ${collectionId}: query userId=${userId}, firebaseUid=${firebaseUid}`,
    );
  }

  const snap = await getDocs(
    query(collection(db, collectionId), where('userId', '==', userId)),
  );

  return snap.docs.map((docSnap) => mapFn(docSnap.id, docSnap.data()));
}

// ─── LocalStorage fallback ──────────────────────────────────────────

function storageKey(collectionId: string, userId: string): string {
  return `local_${collectionId}_${userId}`;
}

function runQueryLocal<T>(
  collectionId: string,
  userId: string,
  mapFn: (doc: { id: string; data: Record<string, any> }) => T,
): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(collectionId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; userId: string }>;
    return parsed.map((d) => mapFn({ id: d.id, data: d as unknown as Record<string, any> }));
  } catch {
    return [];
  }
}

/** Return just the document IDs stored in localStorage for a given
 *  collection/user pair.  Used by getDocsByIdsRest to verify which
 *  documents still exist in Firestore via individual GET requests. */
function getLocalIds(collectionId: string, userId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(collectionId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string }>;
    return parsed.map((d) => d.id).filter(Boolean);
  } catch {
    return [];
  }
}

function saveLocal(collectionId: string, userId: string, data: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(collectionId, userId), JSON.stringify(data));
  } catch { /* quota exceeded — silently ignore */ }
}

function addToLocal(collectionId: string, userId: string, item: any): void {
  const list = getLocalList(collectionId, userId);
  list.push(item);
  saveLocal(collectionId, userId, list);
}

function removeFromLocal(collectionId: string, userId: string, docId: string): void {
  const list = getLocalList(collectionId, userId).filter((d: any) => d.id !== docId);
  saveLocal(collectionId, userId, list);
}

function getLocalList(collectionId: string, userId: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(collectionId, userId)) || '[]');
  } catch {
    return [];
  }
}

// ─── Low-level helpers ────────────────────────────────────────

function docUrl(collection: string, docId?: string) {
  const base = `${FIRESTORE_BASE}/${collection}`;
  return docId ? `${base}/${docId}` : base;
}

function authGet(url: string) {
  return authFetch(url);
}

async function fetchOne<T>(
  collection: string,
  docId: string,
  map: (doc: any) => T,
): Promise<T | null> {
  const res = await authGet(docUrl(collection, docId));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${collection}/${docId}: ${res.status}`);
  return map(await res.json());
}

/**
 * Fetch all documents from a collection and filter on the client side.
 * Avoids Firestore composite index requirements from `runQuery`.
 */
async function fetchCollection<T>(
  collection: string,
  filterFn?: (doc: { id: string; data: Record<string, any> }) => boolean,
  mapFn?: (doc: { id: string; data: Record<string, any> }) => T,
): Promise<T[]> {
  const res = await authGet(docUrl(collection));
  if (!res.ok) throw new Error(`Failed to fetch ${collection}: ${res.status}`);
  const json = await res.json();
  let docs = (json.documents || []).map((d: any) => docFromJson(d)).filter(Boolean);
  if (filterFn) docs = docs.filter(filterFn);
  if (mapFn) return docs.map(mapFn);
  return docs as unknown as T[];
}

/** Analytics data for the current month (F5 fix). */
export interface MonthlyAnalyticsData {
  bookings: BookingDoc[];
  payments: PaymentDoc[];
}

/** Result from a paginated Firestore REST query (F5). */
export interface PaginatedResult<T> {
  data: T[];
  nextPageToken: string | null;
}

/**
 * Fetch a single page of documents from a collection using cursor-based
 * pagination.  The returned `nextPageToken` can be passed as `pageToken`
 * to get the subsequent page.
 */
async function fetchPaginatedCollection<T>(
  collection: string,
  pageSize: number,
  pageToken?: string | null,
  mapFn?: (doc: { id: string; data: Record<string, any> }) => T,
): Promise<PaginatedResult<T>> {
  let url = docUrl(collection) + `?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  const res = await authGet(url);
  if (!res.ok) throw new Error(`Failed to fetch ${collection}: ${res.status}`);
  const json = await res.json();

  const docs = (json.documents || []).map((d: any) => docFromJson(d)).filter(Boolean);
  const data = mapFn ? docs.map(mapFn) : docs as unknown as T[];

  return { data, nextPageToken: json.nextPageToken ?? null };
}

/**
 * Fetch all documents from a collection where a field equals a value.
 * Uses client-side filtering so no composite index is needed.
 */
async function fetchWhere<T>(
  collection: string,
  field: string,
  value: unknown,
  mapFn: (doc: { id: string; data: Record<string, any> }) => T,
): Promise<T[]> {
  return fetchCollection(
    collection,
    (doc) => doc.data[field] === value || doc.data[field] == value,
    mapFn,
  );
}

/** Convert a JS value to a Firestore REST field value. */
function toFieldValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFieldValue) } };
  }
  if (typeof v === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = toFieldValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function docFromJson(json: any): { id: string; data: Record<string, any> } | null {
  if (!json || !json.name) return null;
  const id = json.name.split('/').pop() ?? '';
  const data: Record<string, any> = {};
  const f = json.fields || {};
  for (const key of Object.keys(f)) {
    data[key] = fieldToValue(f[key]);
  }
  return { id, data };
}

/** Convert a Firestore REST field value back to a JS value. */
function fieldToValue(f: any): any {
  if (!f) return undefined;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue) return f.timestampValue;
  if (f.arrayValue) {
    return (f.arrayValue.values || []).map((v: any) => fieldToValue(v));
  }
  if (f.mapValue) {
    const obj: Record<string, any> = {};
    if (f.mapValue.fields) {
      for (const [k, v] of Object.entries(f.mapValue.fields)) {
        obj[k] = fieldToValue(v);
      }
    }
    return obj;
  }
  return undefined;
}

// ─── Provider helpers (expanded) ──────────────────────────────

function mapServiceProvider(doc: any): ServiceProvider {
  const f = doc.fields || {};
  const s = (n: string) => f[n]?.stringValue ?? '';
  const n = (n: string) => Number(f[n]?.integerValue ?? f[n]?.doubleValue ?? 0);
  const a = (n: string) => f[n]?.arrayValue?.values?.map((v: any) => v.stringValue) ?? [];
  const svc = (): ServiceItem[] | undefined => {
    const raw = f.services?.arrayValue?.values;
    if (!raw) return undefined;
    return raw.map((v: any) => {
      const m = v.mapValue?.fields || {};
      return {
        name: m.name?.stringValue ?? '',
        price: m.price?.stringValue ?? '',
        duration: Number(m.duration?.integerValue ?? m.duration?.doubleValue ?? 60),
        currency: m.currency?.stringValue ?? 'USD',
        description: m.description?.stringValue ?? undefined,
      };
    });
  };
  const products = (): ProductItem[] | undefined => {
    const raw = f.products?.arrayValue?.values;
    if (!raw) return undefined;
    return raw.map((v: any) => {
      const m = v.mapValue?.fields || {};
      return {
        id: m.id?.stringValue ?? '',
        name: m.name?.stringValue ?? '',
        price: Number(m.price?.integerValue ?? m.price?.doubleValue ?? 0),
        image: m.image?.stringValue || undefined,
        description: m.description?.stringValue || undefined,
        inStock: m.inStock?.booleanValue ?? true,
        currency: m.currency?.stringValue ?? 'USD',
      };
    });
  };
  // Extract the actual Firestore document name from the full path:
  // e.g. "projects/.../databases/(default)/documents/providers/abc123" → "abc123"
  const avail = (): Record<string, { isOpen: boolean; start: string; end: string }> | undefined => {
    const raw = f.availability?.mapValue?.fields;
    if (!raw) return undefined;
    const result: Record<string, { isOpen: boolean; start: string; end: string }> = {};
    for (const [day, val] of Object.entries(raw)) {
      const m = (val as any)?.mapValue?.fields || {};
      result[day] = {
        isOpen: m.isOpen?.booleanValue === true || m.isOpen?.booleanValue === 'true',
        start: m.start?.stringValue ?? '09:00',
        end: m.end?.stringValue ?? '17:00',
      };
    }
    return result;
  };
  const docName = doc.name?.split('/').pop() ?? '';
  return {
    _firestoreId: docName,
    id: docName || String(n('id')),
    name: s('name'),
    businessName: s('businessName') || undefined,
    type: s('type'),
    category: s('category'),
    rating: n('rating'),
    reviews: n('reviews'),
    desc: s('desc'),
    tags: a('tags'),
    emoji: s('emoji'),
    price: s('price'),
    location: s('location') || undefined,
    googleMapsUrl: s('googleMapsUrl') || undefined,
    since: s('since') || undefined,
    phone: s('phone') || s('contactPhone') || undefined,
    email: s('email') || undefined,
    logoUrl: s('logoUrl') || undefined,
    services: svc(),
    products: products(),
    availability: avail(),
  };
}

export async function getAllProvidersRest(): Promise<ServiceProvider[]> {
  const res = await authGet(docUrl('providers'));
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  const json = await res.json();
  return (json.documents || []).map((d: any) => mapServiceProvider(d));
}

/** Paginated providers for admin tables (F5). */
export async function getProvidersPaginated(
  pageSize = 20,
  pageToken?: string | null,
): Promise<PaginatedResult<ServiceProvider>> {
  // Use mapServiceProvider via the raw Firestore JSON endpoint
  let url = docUrl('providers') + `?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  const res = await authGet(url);
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  const json = await res.json();
  return {
    data: (json.documents || []).map((d: any) => mapServiceProvider(d)),
    nextPageToken: json.nextPageToken ?? null,
  };
}

// ─── Review helpers ───────────────────────────────────────────

export interface ReviewDoc {
  id: string;
  providerId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

function mapReviewDoc(doc: { id: string; data: Record<string, any> }): ReviewDoc {
  return {
    id: doc.id,
    providerId: doc.data.providerId ?? '',
    userId: doc.data.userId ?? '',
    userName: doc.data.userName ?? '',
    rating: doc.data.rating ?? 0,
    comment: doc.data.comment ?? '',
    createdAt: doc.data.createdAt ?? undefined,
  };
}

export async function getReviewsByProviderRest(providerId: string): Promise<ReviewDoc[]> {
  const docs = await runQueryRest('reviews', 'providerId', providerId, mapReviewDoc);
  return docs.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export async function addReviewRest(
  data: Omit<ReviewDoc, 'id' | 'createdAt'> & { userRole?: string },
): Promise<string> {
  // Reject reviews from service providers at the API level too.
  if (data.userRole === 'provider') {
    throw new Error('Service providers cannot write reviews');
  }
  const res = await authFetch(docUrl('reviews'), {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        providerId: { stringValue: data.providerId },
        userId: { stringValue: data.userId },
        userName: { stringValue: data.userName },
        rating: { integerValue: data.rating },
        comment: { stringValue: data.comment },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to add review: ${res.status}${body ? ` — ${body}` : ''}`);
  }
  const json = await res.json();

  return json.name?.split('/').pop() ?? '';
}

export async function getUserReviewsRest(userId: string): Promise<ReviewDoc[]> {
  return runQueryRest('reviews', 'userId', userId, mapReviewDoc);
}

/** Fetch all reviews across the platform (admin use). */
export async function getAllReviewsRest(): Promise<ReviewDoc[]> {
  return fetchCollection('reviews', undefined, mapReviewDoc);
}

/** Paginated reviews for admin tables (F5). */
export async function getReviewsPaginated(
  pageSize = 20,
  pageToken?: string | null,
): Promise<PaginatedResult<ReviewDoc>> {
  return fetchPaginatedCollection('reviews', pageSize, pageToken, mapReviewDoc);
}

/** Update a review document (admin use). */
export async function updateReviewRest(
  reviewId: string,
  data: { comment?: string; rating?: number },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  const masks: string[] = [];
  if (data.comment !== undefined) {
    fields.comment = { stringValue: data.comment };
    masks.push('comment');
  }
  if (data.rating !== undefined) {
    fields.rating = { integerValue: data.rating };
    masks.push('rating');
  }
  if (masks.length === 0) return;
  const url = docUrl('reviews', reviewId)
    + `?updateMask.fieldPaths=${masks.join('&updateMask.fieldPaths=')}`;
  const res = await authFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Failed to update review: ${res.status}`);
}

/** Delete a review document (admin use). */
export async function deleteReviewRest(reviewId: string): Promise<void> {
  const res = await authFetch(docUrl('reviews', reviewId), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete review: ${res.status}`);
}

// ─── Favorite helpers ─────────────────────────────────────────

export interface FavoriteDoc {
  id: string;
  userId: string;
  providerId: string;
  providerName: string;
  category: string;
  emoji: string;
  rating: number;
  createdAt?: string;
}

function mapFavoriteDoc(doc: { id: string; data: Record<string, any> }): FavoriteDoc {
  return {
    id: doc.id,
    userId: doc.data.userId ?? '',
    providerId: doc.data.providerId ?? '',
    providerName: doc.data.providerName ?? '',
    category: doc.data.category ?? '',
    emoji: doc.data.emoji ?? '',
    rating: doc.data.rating ?? 0,
    createdAt: doc.data.createdAt ?? undefined,
  };
}

/** Plain-data mapper for SDK reads (doc.data() returns plain object). */
function mapFavoriteDocFromPlainData(id: string, data: any): FavoriteDoc {
  return {
    id,
    userId: data.userId ?? '',
    providerId: data.providerId ?? '',
    providerName: data.providerName ?? '',
    category: data.category ?? '',
    emoji: data.emoji ?? '',
    rating: data.rating ?? 0,
    createdAt: data.createdAt ?? undefined,
  };
}

/**
 * Try to read known documents by ID via the REST API's `get` endpoint.
 * The `get` security rule has `resource.data` available, so
 * `ownsExistingDoc()` works correctly (unlike `list` / `:runQuery`).
 * Documents that were deleted from Firestore will 403/404 and be skipped.
 */
async function getDocsByIdsRest<T>(
  collectionId: string,
  ids: string[],
  userId: string,
  mapFn: (doc: { id: string; data: Record<string, any> }) => T,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const results: T[] = [];
  for (const id of ids) {
    try {
      const res = await authFetch(docUrl(collectionId, id), { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        const doc = docFromJson(json);
        if (doc) results.push(mapFn(doc));
      }
      // Non-ok (403/404) means doc is gone or inaccessible — skip it
    } catch {
      // Network error — skip this document
    }
  }
  return results;
}

export async function getUserFavoritesRest(userId: string): Promise<FavoriteDoc[]> {
  console.log('🐛 [firestore-rest] getUserFavoritesRest called with userId:', userId);

  // 1. Firebase SDK query (works after rules deploy; blocked by query analyzer before then)
  try {
    const results = await runOwnedQuerySdk('favorites', userId, mapFavoriteDocFromPlainData);
    console.log('🐛 SDK favorites result count:', results.length);
    return results;
  } catch (sdkErr) {
    console.warn('🐛 SDK favorites read failed:', sdkErr);
  }

  // 2. REST :runQuery (list — resource.data unavailable, fails for non-admin users)
  try {
    const list = await runQueryRest('favorites', 'userId', userId, mapFavoriteDoc);
    console.log('🐛 REST favorites result count:', list.length);
    return list;
  } catch (restErr) {
    console.warn('🐛 REST :runQuery failed:', restErr);
  }

  // 3. REST GET-by-ID — reads known docs individually via `get` rules
  //    (resource.data available, ownsExistingDoc() works correctly).
  //    Deleted docs return 403/404 and are skipped, so stale localStorage
  //    IDs don't produce phantom results.
  const localIds = getLocalIds('favorites', userId);
  if (localIds.length > 0) {
    try {
      const byId = await getDocsByIdsRest('favorites', localIds, userId, mapFavoriteDoc);
      if (byId.length > 0) {
        console.log('🐛 REST GET-by-ID favorites count:', byId.length);
        return byId;
      }
    } catch {
      console.warn('🐛 GET-by-ID failed');
    }
  }

  // 4. Last resort: raw localStorage (only when ALL remote reads are down)
  console.warn('🐛 Returning localStorage favorites as last resort');
  return runQueryLocal('favorites', userId, mapFavoriteDoc);
}

export async function findFavoriteIdRest(userId: string, providerId: string): Promise<string | null> {
  // SDK-first: try compound query (userId + providerId)
  try {
    const db = getFirestoreDb();
    const { auth } = getFirebaseAuth();
    if (db && auth?.currentUser && auth.currentUser.uid === userId) {
      const q = query(
        collection(db, 'favorites'),
        where('userId', '==', userId),
        where('providerId', '==', providerId),
      );
      const snap = await getDocs(q);
      const match = snap.docs[0];
      if (match) return match.id;
    }
  } catch {
    console.warn('SDK compound query failed for findFavoriteIdRest, falling back');
  }

  // Fallback: query by userId only and filter client-side
  try {
    const docs = await runQueryRest('favorites', 'userId', userId, mapFavoriteDoc);
    const match = docs.find((d) => d.providerId === providerId || d.providerId == providerId);
    if (match) return match.id;
  } catch {
    console.warn('runQueryRest failed in findFavoriteIdRest');
  }

  return null;
}

export async function addFavoriteRest(data: {
  userId: string;
  providerId: string;
  providerName: string;
  category: string;
  emoji: string;
  rating: number;
}): Promise<string> {
  const body = {
    fields: {
      userId: { stringValue: data.userId },
      providerId: { stringValue: data.providerId },
      providerName: { stringValue: data.providerName },
      category: { stringValue: data.category },
      emoji: { stringValue: data.emoji },
      rating: { doubleValue: data.rating },
    },
  };
  console.log('OUTGOING PAYLOAD (addFavoriteRest):', JSON.stringify(body, null, 2));
  console.log('data.userId:', data.userId);

  let docId: string | null = null;

  try {
    const res = await authFetch(docUrl('favorites'), {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      docId = json.name?.split('/').pop() ?? null;
    } else {
      const errorText = await res.text();
      console.error('FIRESTORE WRITE ERROR (addFavoriteRest):', errorText);
      console.warn(`addFavoriteRest got ${res.status}`);
    }
  } catch (err) {
    console.error('addFavoriteRest network error:', err);
  }

  // Always save to localStorage as a fallback for when the SDK/REST read
  // queries fail (e.g. security rules with || isAdmin() confuse the
  // query analyzer for non-admin users).
  const id = docId ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  addToLocal('favorites', data.userId, { id, ...data });
  return id;
}

export async function removeFavoriteRest(docId: string, userId?: string): Promise<void> {
  try {
    const res = await authFetch(docUrl('favorites', docId), { method: 'DELETE' });
    if (res.ok) {
      // Also remove from localStorage so the merge doesn't return stale data
      if (userId) removeFromLocal('favorites', userId, docId);
      return;
    }
    console.warn(`removeFavoriteRest got ${res.status}`);
  } catch (err) {
    console.warn('removeFavoriteRest network error:', err);
  }

  if (userId) removeFromLocal('favorites', userId, docId);
}

// ─── Booking helpers ──────────────────────────────────────────

export interface BookingDoc {
  id: string;
  userId: string;
  serviceType: string;
  providerId: string;
  providerName: string;
  providerBusinessName?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  currency?: string;
  date: string;
  time: string;
  timeSlot?: string;   // "09:00" format for collision filtering
  instructions?: string;
  petId?: string;
  petName?: string;
  price: number;
  platformFee: number;
  total: number;
  status: string;
  createdAt?: string;
}

function mapBookingDoc(doc: { id: string; data: Record<string, any> }): BookingDoc {
  return {
    id: doc.id,
    userId: doc.data.userId ?? '',
    serviceType: doc.data.serviceType ?? '',
    providerId: doc.data.providerId ?? '',
    providerName: doc.data.providerName ?? '',
    providerBusinessName: doc.data.providerBusinessName ?? undefined,
    customerName: doc.data.customerName ?? undefined,
    customerPhone: doc.data.customerPhone ?? undefined,
    customerEmail: doc.data.customerEmail ?? undefined,
    currency: doc.data.currency ?? undefined,
    date: doc.data.date ?? '',
    time: doc.data.time ?? '',
    timeSlot: doc.data.timeSlot ?? undefined,
    instructions: doc.data.instructions ?? undefined,
    petId: doc.data.petId ?? undefined,
    petName: doc.data.petName ?? undefined,
    price: doc.data.price ?? 0,
    platformFee: doc.data.platformFee ?? 0,
    total: doc.data.total ?? 0,
    status: doc.data.status ?? 'pending',
    createdAt: doc.data.createdAt ?? undefined,
  };
}

export async function getUserBookingsRest(userId: string): Promise<BookingDoc[]> {
  return runQueryRest('bookings', 'userId', userId, mapBookingDoc);
}

export async function getAllBookingsRest(): Promise<BookingDoc[]> {
  const res = await authGet(docUrl('bookings'));
  if (!res.ok) throw new Error(`Failed to fetch bookings: ${res.status}`);
  const json = await res.json();
  return (json.documents || [])
    .map((d: any) => docFromJson(d))
    .filter(Boolean)
    .map((d: any) => mapBookingDoc(d));
}

/** Paginated bookings for admin tables (F5). */
export async function getBookingsPaginated(
  pageSize = 20,
  pageToken?: string | null,
): Promise<PaginatedResult<BookingDoc>> {
  return fetchPaginatedCollection('bookings', pageSize, pageToken, mapBookingDoc);
}

export async function addBookingRest(data: Omit<BookingDoc, 'id' | 'createdAt'>): Promise<string> {
  const fields: Record<string, unknown> = {
    userId: { stringValue: data.userId },
    serviceType: { stringValue: data.serviceType },
    providerId: { stringValue: data.providerId },
    providerName: { stringValue: data.providerName },
    providerBusinessName: { stringValue: data.providerBusinessName ?? '' },
    customerName: { stringValue: data.customerName ?? '' },
    customerEmail: { stringValue: data.customerEmail ?? '' },
    date: { stringValue: data.date },
    time: { stringValue: data.time },
    price: { doubleValue: data.price },
    platformFee: { doubleValue: data.platformFee },
    total: { doubleValue: data.total },
    status: { stringValue: data.status },
    createdAt: { stringValue: new Date().toISOString() },
  };
  if (data.instructions) fields.instructions = { stringValue: data.instructions };
  if (data.petId) fields.petId = { stringValue: data.petId };
  if (data.petName) fields.petName = { stringValue: data.petName };
  if (data.timeSlot) fields.timeSlot = { stringValue: data.timeSlot };
  if (data.customerPhone) fields.customerPhone = { stringValue: data.customerPhone };
  if (data.currency) fields.currency = { stringValue: data.currency };

  const res = await authFetch(docUrl('bookings'), {
    method: 'POST',
    body: JSON.stringify({ fields }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add booking: ${res.status}`);
  const json = await res.json();

  // Touch the user's cooldown timestamp for S3 rate limiting
  touchCooldown(data.userId, 'lastBookingAt');

  return json.name?.split('/').pop() ?? '';
}

export async function updateBookingRest(bookingId: string, updates: Partial<BookingDoc>): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (updates.status) fields.status = { stringValue: updates.status };
  const res = await authFetch(docUrl('bookings', bookingId) + `?updateMask.fieldPaths=status`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to update booking: ${res.status}`);
}

export async function deleteBookingRest(bookingId: string): Promise<void> {
  const res = await authFetch(docUrl('bookings', bookingId), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete booking: ${res.status}`);
}

// ─── Payment helpers ──────────────────────────────────────────

export interface PaymentDoc {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  providerId: string;
  providerName: string;
  category: string;
  amount: number;
  status: string;
  createdAt?: string;
}

function mapPaymentDoc(doc: { id: string; data: Record<string, any> }): PaymentDoc {
  return {
    id: doc.id,
    bookingId: doc.data.bookingId ?? '',
    customerId: doc.data.customerId ?? '',
    customerName: doc.data.customerName ?? '',
    providerId: doc.data.providerId ?? '',
    providerName: doc.data.providerName ?? '',
    category: doc.data.category ?? '',
    amount: doc.data.amount ?? 0,
    status: doc.data.status ?? '',
    createdAt: doc.data.createdAt ?? undefined,
  };
}

export async function getUserPaymentsRest(userId: string, role: string): Promise<PaymentDoc[]> {
  const field = role === 'provider' ? 'providerId' : 'customerId';
  return runQueryRest('payments', field, userId, mapPaymentDoc);
}

export async function getAllPaymentsRest(): Promise<PaymentDoc[]> {
  const res = await authGet(docUrl('payments'));
  if (!res.ok) throw new Error(`Failed to fetch payments: ${res.status}`);
  const json = await res.json();
  return (json.documents || [])
    .map((d: any) => docFromJson(d))
    .filter(Boolean)
    .map((d: any) => mapPaymentDoc(d));
}

/** Paginated payments for admin tables (F5). */
export async function getPaymentsPaginated(
  pageSize = 20,
  pageToken?: string | null,
): Promise<PaginatedResult<PaymentDoc>> {
  return fetchPaginatedCollection('payments', pageSize, pageToken, mapPaymentDoc);
}

/**
 * Fetch all bookings & payments for the current month (used by admin
 * analytics, independent of paginated table state).  Filters client-side
 * so no composite index is needed.
 */
export async function getMonthlyAnalyticsDataRest(): Promise<MonthlyAnalyticsData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const bookUrl = docUrl('bookings');
  const payUrl = docUrl('payments');
  const [bRes, pRes] = await Promise.all([authGet(bookUrl), authGet(payUrl)]);

  const parse = (json: any) => (json.documents || []).map((d: any) => docFromJson(d)).filter(Boolean);

  const allBookings: BookingDoc[] = parse(await bRes.json()).map(mapBookingDoc);
  const allPayments: PaymentDoc[] = parse(await pRes.json()).map(mapPaymentDoc);

  const inRange = (iso?: string) => {
    if (!iso) return false;
    return iso >= monthStart && iso <= monthEnd;
  };

  return {
    bookings: allBookings.filter((b) => inRange(b.createdAt || b.date)),
    payments: allPayments.filter((p) => inRange(p.createdAt)),
  };
}

export async function addPaymentRest(data: Omit<PaymentDoc, 'id' | 'createdAt'>): Promise<string> {
  const res = await authFetch(docUrl('payments'), {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        bookingId: { stringValue: data.bookingId },
        customerId: { stringValue: data.customerId },
        customerName: { stringValue: data.customerName },
        providerId: { stringValue: data.providerId },
        providerName: { stringValue: data.providerName },
        category: { stringValue: data.category },
        amount: { doubleValue: data.amount },
        status: { stringValue: data.status },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add payment: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

export async function updatePaymentRest(paymentId: string, status: string): Promise<void> {
  const res = await authFetch(docUrl('payments', paymentId) + `?updateMask.fieldPaths=status`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: { status: { stringValue: status } },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to update payment: ${res.status}`);
}

export async function deletePaymentRest(paymentId: string): Promise<void> {
  const res = await authFetch(docUrl('payments', paymentId), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete payment: ${res.status}`);
}

// ─── Pet helpers ──────────────────────────────────────────────

export interface PetDoc {
  id: string;
  userId: string;
  name: string;
  type: string;
  breed: string;
  age: string;
  notes: string;
}

function mapPetDoc(doc: { id: string; data: Record<string, any> }): PetDoc {
  return {
    id: doc.id,
    userId: doc.data.userId ?? '',
    name: doc.data.name ?? '',
    type: doc.data.type ?? '',
    breed: doc.data.breed ?? '',
    age: doc.data.age ?? '',
    notes: doc.data.notes ?? '',
  };
}

/** Plain-data mapper for SDK reads (doc.data() returns plain object). */
function mapPetDocFromPlainData(id: string, data: any): PetDoc {
  return {
    id,
    userId: data.userId ?? '',
    name: data.name ?? '',
    type: data.type ?? '',
    breed: data.breed ?? '',
    age: data.age ?? '',
    notes: data.notes ?? '',
  };
}

export async function getUserPetsRest(userId: string): Promise<PetDoc[]> {
  console.log('🐛 [firestore-rest] getUserPetsRest called with userId:', userId);

  // 1. Firebase SDK query (works after rules deploy; blocked by query analyzer before then)
  try {
    const results = await runOwnedQuerySdk('pets', userId, mapPetDocFromPlainData);
    console.log('🐛 SDK pets result count:', results.length);
    return results;
  } catch (sdkErr) {
    console.warn('🐛 SDK pets read failed:', sdkErr);
  }

  // 2. REST :runQuery (list — resource.data unavailable, fails for non-admin users)
  try {
    const list = await runQueryRest('pets', 'userId', userId, mapPetDoc);
    console.log('🐛 REST pets result count:', list.length);
    return list;
  } catch (restErr) {
    console.warn('🐛 REST :runQuery failed:', restErr);
  }

  // 3. REST GET-by-ID — reads known docs individually via `get` rules
  //    (resource.data available, ownsExistingDoc() works correctly).
  //    Deleted docs return 403/404 and are skipped, so stale localStorage
  //    IDs don't produce phantom results.
  const localIds = getLocalIds('pets', userId);
  if (localIds.length > 0) {
    try {
      const byId = await getDocsByIdsRest('pets', localIds, userId, mapPetDoc);
      if (byId.length > 0) {
        console.log('🐛 REST GET-by-ID pets count:', byId.length);
        return byId;
      }
    } catch {
      console.warn('🐛 GET-by-ID failed');
    }
  }

  // 4. Last resort: raw localStorage (only when ALL remote reads are down)
  console.warn('🐛 Returning localStorage pets as last resort');
  return runQueryLocal('pets', userId, mapPetDoc);
}

export async function addPetRest(data: Omit<PetDoc, 'id'>): Promise<string> {
  const body = {
    fields: {
      userId: { stringValue: data.userId },
      name: { stringValue: data.name },
      type: { stringValue: data.type },
      breed: { stringValue: data.breed },
      age: { stringValue: data.age },
      notes: { stringValue: data.notes },
    },
  };
  console.log('OUTGOING PAYLOAD (addPetRest):', JSON.stringify(body, null, 2));
  console.log('data.userId:', data.userId);

  let docId: string | null = null;

  try {
    const res = await authFetch(docUrl('pets'), {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      docId = json.name?.split('/').pop() ?? null;
    } else {
      const errorText = await res.text();
      console.error('FIRESTORE WRITE ERROR (addPetRest):', errorText);
      console.warn(`addPetRest got ${res.status}`);
    }
  } catch (err) {
    console.error('addPetRest network error:', err);
  }

  // Always save to localStorage as a fallback for when the SDK/REST read
  // queries fail (e.g. security rules with || isAdmin() confuse the
  // query analyzer for non-admin users).
  const id = docId ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  addToLocal('pets', data.userId, { id, ...data });
  return id;
}

export async function deletePetRest(petId: string, userId?: string): Promise<void> {
  try {
    const res = await authFetch(docUrl('pets', petId), { method: 'DELETE' });
    if (res.ok) {
      // Also remove from localStorage so the merge doesn't return stale data
      if (userId) removeFromLocal('pets', userId, petId);
      return;
    }
    console.warn(`deletePetRest got ${res.status}`);
  } catch (err) {
    console.warn('deletePetRest network error:', err);
  }

  if (userId) removeFromLocal('pets', userId, petId);
}

// ─── Message helpers ──────────────────────────────────────────

export async function addMessageRest(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
  userId: string;
}): Promise<string> {
  const res = await authFetch(docUrl('messages'), {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        name: { stringValue: data.name },
        email: { stringValue: data.email },
        subject: { stringValue: data.subject },
        message: { stringValue: data.message },
        userId: { stringValue: data.userId },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add message: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

// ─── User document helpers ────────────────────────────────────

export interface UserDoc {
  id: string;
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  role?: string;
}

function mapUserDoc(doc: { id: string; data: Record<string, any> }): UserDoc {
  const d = doc.data;
  return {
    id: doc.id,
    uid: d.uid ?? d.id ?? doc.id,
    name: d.name ?? d.displayName ?? '',
    email: d.email ?? '',
    phone: d.phone ?? d.phoneNumber ?? '',
    photoURL: d.photoURL ?? '',
    role: d.role ?? '',
  };
}

export async function getAllUsersRest(): Promise<UserDoc[]> {
  return fetchCollection('users', undefined, mapUserDoc);
}

export async function getUserByIdRest(userId: string): Promise<UserDoc | null> {
  try {
    const res = await authGet(docUrl('users', userId));
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const parsed = docFromJson(await res.json());
    return parsed ? mapUserDoc(parsed) : null;
  } catch {
    return null;
  }
}

export async function updateUserDocRest(userId: string, data: Record<string, unknown>): Promise<void> {
  const fields: Record<string, unknown> = {};
  const masks: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    fields[key] = toFieldValue(val);
    masks.push(key);
  }
  const res = await authFetch(
    docUrl('users', userId) + `?updateMask.fieldPaths=${masks.join('&updateMask.fieldPaths=')}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) throw new Error(`Failed to update user: ${res.status}`);
}

export async function deleteUserDocRest(userId: string): Promise<void> {
  const res = await authFetch(docUrl('users', userId), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete user: ${res.status}`);
}

/**
 * Recalculate a provider's rating and review count based on remaining reviews.
 */
async function recalculateProviderRating(providerId: string): Promise<void> {
  const remaining = await fetchWhere('reviews', 'providerId', providerId, (doc) => ({
    id: doc.id,
    rating: doc.data.rating ?? 0,
  }));
  const total = remaining.length;
  const sumStars = remaining.reduce((sum, r) => sum + r.rating, 0);
  const avg = total > 0 ? sumStars / total : 0;
  await updateProviderByIdRest(providerId, {
    reviews: total,
    rating: parseFloat(avg.toFixed(1)),
  });
}

/**
 * Call the local API route to delete the Firebase Auth user record.
 * Best-effort — never throws so it can't block the cascading delete flow.
 */
async function deleteFirebaseAuthUser(uid: string, requesterUid: string, requesterRole?: string): Promise<void> {
  try {
    await fetch('/api/auth/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, requesterUid, requesterRole }),
    });
  } catch {
    // Non-critical — the Auth record may already be gone
  }
}

/**
 * Best-effort update of a cooldown timestamp on the user's document.
 * This powers the Firestore Rules rate limiter (S3) — if the write
 * fails, the user's next write will simply be blocked until the
 * 60-second window expires from the previous successful write.
 */
async function touchCooldown(userId: string, field: string): Promise<void> {
  const now = new Date().toISOString();
  const url = docUrl('users', userId) + `?updateMask.fieldPaths=${field}`;
  try {
    await authFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { [field]: { stringValue: now } } }),
    });
  } catch {
    // Non-critical — rules will enforce cooldown regardless
  }
}

/**
 * Cascading delete for a user (pet owner) account.
 *
 * 1. Queries all relational documents (pets, bookings, payments, reviews, favorites)
 * 2. Deletes them all
 * 3. Recalculates provider ratings for any reviews that were removed
 * 4. Deletes the user document
 * 5. Deletes the Firebase Auth user record (S1/F1)
 * 6. Returns summary counts
 */
export async function deleteUserAccountRest(
  userId: string,
  requesterUid?: string,
  requesterRole?: string,
): Promise<{
  deletedPets: number;
  deletedBookings: number;
  deletedPayments: number;
  deletedReviews: number;
  deletedFavorites: number;
  recalculatedProviders: number;
}> {
  // 1. Collect all relational documents
  const [pets, bookings, payments, reviews, favorites] = await Promise.all([
    fetchWhere('pets', 'userId', userId, (doc) => ({ id: doc.id })),
    fetchWhere('bookings', 'userId', userId, (doc) => ({ id: doc.id })),
    fetchWhere('payments', 'customerId', userId, (doc) => ({ id: doc.id })),
    fetchWhere('reviews', 'userId', userId, (doc) => ({
      id: doc.id,
      providerId: doc.data.providerId ?? '',
      rating: doc.data.rating ?? 0,
    })),
    fetchWhere('favorites', 'userId', userId, (doc) => ({ id: doc.id })),
  ]);

  // Collect unique provider IDs affected by review deletion
  const affectedProviderIds = [...new Set(reviews.map((r) => r.providerId))];

  // 2. Delete all relational documents
  await Promise.allSettled([
    ...pets.map((p) =>
      authFetch(docUrl('pets', p.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete pet ${p.id}: ${r.status}`);
      }),
    ),
    ...bookings.map((b) =>
      authFetch(docUrl('bookings', b.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete booking ${b.id}: ${r.status}`);
      }),
    ),
    ...payments.map((p) =>
      authFetch(docUrl('payments', p.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete payment ${p.id}: ${r.status}`);
      }),
    ),
    ...reviews.map((rev) =>
      authFetch(docUrl('reviews', rev.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete review ${rev.id}: ${r.status}`);
      }),
    ),
    ...favorites.map((f) =>
      authFetch(docUrl('favorites', f.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete favorite ${f.id}: ${r.status}`);
      }),
    ),
  ]);

  // 3. Recalculate provider ratings for affected providers
  await Promise.allSettled(
    affectedProviderIds.map((pid) => recalculateProviderRating(pid)),
  );

  // 4. Delete the user document
  try {
    await deleteUserDocRest(userId);
  } catch {
    // User doc may already be gone — proceed
  }

  // 5. Delete the Firebase Auth user record (S1/F1)
  const uid = requesterUid || userId;
  const role = requesterRole || undefined;
  await deleteFirebaseAuthUser(userId, uid, role);

  return {
    deletedPets: pets.length,
    deletedBookings: bookings.length,
    deletedPayments: payments.length,
    deletedReviews: reviews.length,
    deletedFavorites: favorites.length,
    recalculatedProviders: affectedProviderIds.length,
  };
}

/** Delete a provider document.
 *  @param providerId — Either the numeric ID or the actual Firestore document name (string). */
export async function deleteProviderDocRest(providerId: number | string): Promise<void> {
  const res = await authFetch(docUrl('providers', String(providerId)), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete provider: ${res.status}`);
}

/**
 * Cascading delete for a service provider account.
 *
 * 1. Queries & deletes all relational documents (bookings, payments, reviews, favorites)
 * 2. Deletes the main provider document
 * 3. Returns metadata (logoUrl, user email) so the caller can clean up storage & downgrade the user role
 * 4. Deletes the Firebase Auth user record (S1/F1)
 *
 * Uses sequential REST DELETE calls (no SDK batch needed). Returns counts of deleted items,
 * plus the provider email and logoUrl so the UI layer can perform Storage deletion
 * and user role downgrade where the Firebase SDK is available.
 */
export async function deleteProviderAccountRest(
  providerId: string,
  requesterUid?: string,
  requesterRole?: string,
): Promise<{
  deletedBookings: number;
  deletedPayments: number;
  deletedReviews: number;
  deletedFavorites: number;
  logoUrl: string | null;
  userEmail: string | null;
  userName: string | null;
}> {
  // 1. Collect all relational documents
  const [bookings, payments, reviews] = await Promise.all([
    fetchWhere('bookings', 'providerId', providerId, mapBookingDoc),
    fetchWhere('payments', 'providerId', providerId, mapPaymentDoc),
    fetchWhere('reviews', 'providerId', providerId, (doc) => ({
      id: doc.id,
      providerId: doc.data.providerId ?? '',
      userId: doc.data.userId ?? '',
      userName: doc.data.userName ?? '',
      rating: doc.data.rating ?? 0,
      comment: doc.data.comment ?? '',
    })),
    // Note: favorites uses a different field naming convention — some use `providerId`, some use `targetId`
    // We'll fetch broadly and filter below.
  ]);

  const favorites = await fetchCollection<{ id: string }>(
    'favorites',
    (doc) => doc.data.providerId === providerId || doc.data.targetId === providerId,
    (doc) => ({ id: doc.id }),
  );

  // 2. Delete all relational documents
  await Promise.allSettled([
    ...bookings.map((b) =>
      authFetch(docUrl('bookings', b.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete booking ${b.id}: ${r.status}`);
      }),
    ),
    ...payments.map((p) =>
      authFetch(docUrl('payments', p.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete payment ${p.id}: ${r.status}`);
      }),
    ),
    ...reviews.map((rev) =>
      authFetch(docUrl('reviews', rev.id), { method: 'DELETE' }).then((res) => {
        if (!res.ok) throw new Error(`Failed to delete review ${rev.id}: ${res.status}`);
      }),
    ),
    ...favorites.map((f) =>
      authFetch(docUrl('favorites', f.id), { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete favorite ${f.id}: ${r.status}`);
      }),
    ),
  ]);

  // 3. Fetch the provider doc before deleting (to get email + logoUrl for cleanup)
  let logoUrl: string | null = null;
  let userEmail: string | null = null;
  let userName: string | null = null;
  try {
    const providerRes = await authGet(docUrl('providers', providerId));
    if (providerRes.ok) {
      const json = await providerRes.json();
      const f = json.fields || {};
      logoUrl = f.logoUrl?.stringValue ?? null;
      userEmail = f.email?.stringValue ?? f.contactEmail?.stringValue ?? null;
      userName = f.name?.stringValue ?? f.businessName?.stringValue ?? null;
    }
  } catch {
    // Provider doc may already be gone — proceed
  }

  // 4. Delete the main provider document
  try {
    const res = await authFetch(docUrl('providers', providerId), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`Failed to delete provider: ${res.status}`);
  } catch {
    // If it's already deleted that's fine
  }

  // 5. Delete the Firebase Auth user record (S1/F1)
  // For provider deletions, the requester must pass their own UID/role
  // or this is a no-op (Firebase Auth deletion only works with explicit credentials).
  if (requesterUid) {
    await deleteFirebaseAuthUser(providerId, requesterUid, requesterRole);
  }

  return {
    deletedBookings: bookings.length,
    deletedPayments: payments.length,
    deletedReviews: reviews.length,
    deletedFavorites: favorites.length,
    logoUrl,
    userEmail,
    userName,
  };
}

// ─── Provider update / lookup helpers ──────────────────────────

/** Map a Firestore doc {id, data} to ServiceProvider (for fetchWhere/fetchCollection). */
function mapProviderFromDoc(doc: { id: string; data: Record<string, any> }): ServiceProvider {
  const d = doc.data;
  return {
    id: doc.id,
    name: d.name ?? '',
    type: d.type ?? '',
    category: d.category ?? '',
    rating: d.rating ?? 0,
    reviews: d.reviews ?? 0,
    desc: d.desc ?? '',
    tags: d.tags ?? [],
    emoji: d.emoji ?? '',
    price: d.price ?? '',
    location: d.location ?? undefined,
    googleMapsUrl: d.googleMapsUrl ?? undefined,
    since: d.since ?? undefined,
    phone: d.phone ?? d.contactPhone ?? undefined,
    email: d.email ?? undefined,
    services: d.services ?? undefined,
    businessName: d.businessName ?? undefined,
    contactEmail: d.contactEmail ?? undefined,
    contactPhone: d.contactPhone ?? undefined,
    logoUrl: d.logoUrl ?? undefined,
    socialMedia: d.socialMedia ?? undefined,
    products: d.products ?? undefined,
  };
}

/** Fetch a provider document by email (for the provider dashboard). */
export async function getProviderByEmailRest(email: string): Promise<ServiceProvider | null> {
  const list = await fetchWhere('providers', 'email', email, mapProviderFromDoc);
  return list.length > 0 ? list[0] : null;
}

/** Fetch a provider document by its ID (Firestore document name). */
export async function getProviderByIdRest(id: string): Promise<ServiceProvider | null> {
  return fetchOne('providers', id, mapServiceProvider);
}

/**
 * Update a provider document (PATCH).
 * Sends only the provided fields — other fields remain untouched.
 */
export async function updateProviderDocRest(providerId: string, data: Record<string, unknown>): Promise<void> {
  const fields: Record<string, unknown> = {};
  const masks: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFieldValue(val);
    masks.push(key);
  }
  const url = docUrl('providers', String(providerId))
    + `?updateMask.fieldPaths=${masks.join('&updateMask.fieldPaths=')}`;
  const res = await authFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  if (!res.ok)
    throw new Error(`Failed to update provider: ${res.status}`);
}

/** Fetch bookings where the provider ID matches. */
export async function getBookingsByProviderRest(providerId: string): Promise<BookingDoc[]> {
  return runQueryRest('bookings', 'providerId', providerId, mapBookingDoc);
}

/** Fetch bookings for a specific provider + date (for double-booking collision detection).
 *  Filters on both fields client-side after fetching all documents for the collection. */
export async function getBookingsForProviderDateRest(providerId: string, date: string): Promise<BookingDoc[]> {
  const docs = await runQueryRest('bookings', 'providerId', providerId, mapBookingDoc);
  return docs.filter((b) => b.date === date);
}

// ─── Provider document creation ─────────────────────────────────

/** Create a new provider document in the `providers` collection.
 *  Returns the auto-generated Firestore document ID. */
export async function createProviderRest(data: {
  email: string;
  name: string;
  businessName: string;
  contactEmail: string;
  type: string;
  category: string;
  price?: string;
  emoji: string;
  desc: string;
  location: string;
  /** When provided, the document is created at providers/{documentId}
   *  instead of a random path — equivalent to setDoc in the Firebase SDK. */
  documentId?: string;
}): Promise<string> {
  const fields: Record<string, unknown> = {
    email: { stringValue: data.email },
    name: { stringValue: data.name },
    businessName: { stringValue: data.businessName },
    contactEmail: { stringValue: data.contactEmail },
    type: { stringValue: data.type },
    category: { stringValue: data.category },
    price: { stringValue: data.price ?? 'Contact for Pricing' },
    emoji: { stringValue: data.emoji },
    desc: { stringValue: data.desc },
    location: { stringValue: data.location },
    rating: { integerValue: '0' },
    reviews: { integerValue: '0' },
    since: { stringValue: String(new Date().getFullYear()) },
    services: { arrayValue: { values: [] } },
    products: { arrayValue: { values: [] } },
  };

  const base = docUrl('providers');
  const url = data.documentId
    ? `${base}?documentId=${data.documentId}`
    : base;
  const res = await authFetch(url, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Failed to create provider: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

/**
 * Update a provider document by its Firestore document ID (string).
 * Sends only the provided fields — other fields remain untouched.
 */
export async function updateProviderByIdRest(
  docId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const fields: Record<string, unknown> = {};
  const masks: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFieldValue(val);
    masks.push(key);
  }
  const url = docUrl('providers', docId)
    + `?updateMask.fieldPaths=${masks.join('&updateMask.fieldPaths=')}`;
  const res = await authFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  if (!res.ok)
    throw new Error(`Failed to update provider: ${res.status}`);
}
