/**
 * Firestore REST API helpers.
 * Used in place of the Firebase SDK, which may hang in sandboxed
 * environments.  All calls go directly to the Firestore REST API
 * via plain `fetch`, so they respect standard HTTP timeouts.
 */
import type { ServiceProvider, ServiceItem } from './types';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Low-level helpers ────────────────────────────────────────

function docUrl(collection: string, docId?: string) {
  const base = `${FIRESTORE_BASE}/${collection}`;
  return docId ? `${base}/${docId}` : base;
}

function authGet(url: string) {
  return fetch(`${url}?key=${API_KEY}`);
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
      return { name: m.name?.stringValue ?? '', price: m.price?.stringValue ?? '' };
    });
  };
  return {
    id: n('id'),
    name: s('name'),
    type: s('type'),
    category: s('category'),
    rating: n('rating'),
    reviews: n('reviews'),
    desc: s('desc'),
    tags: a('tags'),
    emoji: s('emoji'),
    price: s('price'),
    location: s('location') || undefined,
    since: s('since') || undefined,
    phone: s('phone') || undefined,
    email: s('email') || undefined,
    services: svc(),
  };
}

export async function getAllProvidersRest(): Promise<ServiceProvider[]> {
  const res = await authGet(docUrl('providers'));
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  const json = await res.json();
  return (json.documents || []).map((d: any) => mapServiceProvider(d));
}

export async function getProviderByIdRest(id: number): Promise<ServiceProvider | null> {
  const res = await authGet(docUrl('providers', String(id)));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch provider: ${res.status}`);
  return mapServiceProvider(await res.json());
}

// ─── Review helpers ───────────────────────────────────────────

export interface ReviewDoc {
  id: string;
  providerId: number;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

function mapReviewDoc(doc: { id: string; data: Record<string, any> }): ReviewDoc {
  return {
    id: doc.id,
    providerId: doc.data.providerId ?? 0,
    userId: doc.data.userId ?? '',
    userName: doc.data.userName ?? '',
    rating: doc.data.rating ?? 0,
    comment: doc.data.comment ?? '',
    createdAt: doc.data.createdAt ?? undefined,
  };
}

export async function getReviewsByProviderRest(providerId: number): Promise<ReviewDoc[]> {
  const docs = await fetchWhere('reviews', 'providerId', providerId, mapReviewDoc);
  return docs.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export async function addReviewRest(data: Omit<ReviewDoc, 'id' | 'createdAt'>): Promise<string> {
  const res = await fetch(docUrl('reviews') + `?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        providerId: { integerValue: data.providerId },
        userId: { stringValue: data.userId },
        userName: { stringValue: data.userName },
        rating: { integerValue: data.rating },
        comment: { stringValue: data.comment },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add review: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

export async function getUserReviewsRest(userId: string): Promise<ReviewDoc[]> {
  return fetchWhere('reviews', 'userId', userId, mapReviewDoc);
}

// ─── Favorite helpers ─────────────────────────────────────────

export interface FavoriteDoc {
  id: string;
  userId: string;
  providerId: number;
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
    providerId: doc.data.providerId ?? 0,
    providerName: doc.data.providerName ?? '',
    category: doc.data.category ?? '',
    emoji: doc.data.emoji ?? '',
    rating: doc.data.rating ?? 0,
    createdAt: doc.data.createdAt ?? undefined,
  };
}

export async function getUserFavoritesRest(userId: string): Promise<FavoriteDoc[]> {
  return fetchWhere('favorites', 'userId', userId, mapFavoriteDoc);
}

export async function findFavoriteIdRest(userId: string, providerId: number): Promise<string | null> {
  const docs = await fetchCollection<FavoriteDoc>(
    'favorites',
    (doc) => doc.data.userId === userId && (doc.data.providerId === providerId || doc.data.providerId == providerId),
    mapFavoriteDoc,
  );
  return docs.length > 0 ? docs[0].id : null;
}

export async function addFavoriteRest(data: {
  userId: string;
  providerId: number;
  providerName: string;
  category: string;
  emoji: string;
  rating: number;
}): Promise<string> {
  const res = await fetch(docUrl('favorites') + `?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        userId: { stringValue: data.userId },
        providerId: { integerValue: data.providerId },
        providerName: { stringValue: data.providerName },
        category: { stringValue: data.category },
        emoji: { stringValue: data.emoji },
        rating: { doubleValue: data.rating },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add favorite: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

export async function removeFavoriteRest(docId: string): Promise<void> {
  const res = await fetch(docUrl('favorites', docId) + `?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to remove favorite: ${res.status}`);
}

// ─── Booking helpers ──────────────────────────────────────────

export interface BookingDoc {
  id: string;
  userId: string;
  serviceType: string;
  providerId: string;
  providerName: string;
  date: string;
  time: string;
  instructions?: string;
  petId?: string;
  petName?: string;
  price: number;
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
    date: doc.data.date ?? '',
    time: doc.data.time ?? '',
    instructions: doc.data.instructions ?? undefined,
    petId: doc.data.petId ?? undefined,
    petName: doc.data.petName ?? undefined,
    price: doc.data.price ?? 0,
    status: doc.data.status ?? 'pending',
    createdAt: doc.data.createdAt ?? undefined,
  };
}

export async function getUserBookingsRest(userId: string): Promise<BookingDoc[]> {
  return fetchWhere('bookings', 'userId', userId, mapBookingDoc);
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

export async function addBookingRest(data: Omit<BookingDoc, 'id' | 'createdAt'>): Promise<string> {
  const fields: Record<string, unknown> = {
    userId: { stringValue: data.userId },
    serviceType: { stringValue: data.serviceType },
    providerId: { stringValue: data.providerId },
    providerName: { stringValue: data.providerName },
    date: { stringValue: data.date },
    time: { stringValue: data.time },
    price: { integerValue: data.price },
    status: { stringValue: data.status },
  };
  if (data.instructions) fields.instructions = { stringValue: data.instructions };
  if (data.petId) fields.petId = { stringValue: data.petId };
  if (data.petName) fields.petName = { stringValue: data.petName };

  const res = await fetch(docUrl('bookings') + `?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add booking: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

export async function updateBookingRest(bookingId: string, updates: Partial<BookingDoc>): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (updates.status) fields.status = { stringValue: updates.status };
  const res = await fetch(docUrl('bookings', bookingId) + `?key=${API_KEY}&updateMask.fieldPaths=status`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to update booking: ${res.status}`);
}

export async function deleteBookingRest(bookingId: string): Promise<void> {
  const res = await fetch(docUrl('bookings', bookingId) + `?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete booking: ${res.status}`);
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

export async function getUserPaymentsRest(userId: string, role: 'owner' | 'provider'): Promise<PaymentDoc[]> {
  const field = role === 'provider' ? 'providerId' : 'customerId';
  return fetchWhere('payments', field, userId, mapPaymentDoc);
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

export async function addPaymentRest(data: Omit<PaymentDoc, 'id' | 'createdAt'>): Promise<string> {
  const res = await fetch(docUrl('payments') + `?key=${API_KEY}`, {
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
  const res = await fetch(docUrl('payments', paymentId) + `?key=${API_KEY}&updateMask.fieldPaths=status`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: { status: { stringValue: status } },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to update payment: ${res.status}`);
}

export async function deletePaymentRest(paymentId: string): Promise<void> {
  const res = await fetch(docUrl('payments', paymentId) + `?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete payment: ${res.status}`);
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

export async function getUserPetsRest(userId: string): Promise<PetDoc[]> {
  return fetchWhere('pets', 'userId', userId, mapPetDoc);
}

export async function addPetRest(data: Omit<PetDoc, 'id'>): Promise<string> {
  const res = await fetch(docUrl('pets') + `?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        userId: { stringValue: data.userId },
        name: { stringValue: data.name },
        type: { stringValue: data.type },
        breed: { stringValue: data.breed },
        age: { stringValue: data.age },
        notes: { stringValue: data.notes },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add pet: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

export async function deletePetRest(petId: string): Promise<void> {
  const res = await fetch(docUrl('pets', petId) + `?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete pet: ${res.status}`);
}

// ─── Message helpers ──────────────────────────────────────────

export async function addMessageRest(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
  userId: string;
}): Promise<string> {
  const res = await fetch(docUrl('messages') + `?key=${API_KEY}`, {
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

export async function updateUserDocRest(userId: string, data: Record<string, string>): Promise<void> {
  const fields: Record<string, unknown> = {};
  const masks: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    fields[key] = { stringValue: val };
    masks.push(key);
  }
  const res = await fetch(
    docUrl('users', userId) + `?key=${API_KEY}&updateMask.fieldPaths=${masks.join('&updateMask.fieldPaths=')}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (!res.ok && res.status !== 404) throw new Error(`Failed to update user: ${res.status}`);
}

export async function deleteUserDocRest(userId: string): Promise<void> {
  const res = await fetch(docUrl('users', userId) + `?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete user: ${res.status}`);
}

export async function deleteProviderDocRest(providerId: number): Promise<void> {
  const res = await fetch(docUrl('providers', String(providerId)) + `?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete provider: ${res.status}`);
}
