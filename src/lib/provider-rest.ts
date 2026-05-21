/**
 * Firestore REST API helpers for the provider detail page.
 * Used by the server component to fetch data, since the Firebase SDK
 * is unreachable from this environment.
 */
import { ServiceProvider, ServiceItem, ProductItem } from './types';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* ───────── provider document helpers ───────── */

function mapDoc(doc: any): ServiceProvider {
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
      };
    });
  };
  const docName = doc.name?.split('/').pop() ?? '';
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
  return {
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
    since: s('since') || undefined,
    phone: s('phone') || undefined,
    email: s('email') || undefined,
    services: svc(),
    products: products(),
    availability: avail(),
  };
}

export async function getProviderByIdRest(id: string): Promise<ServiceProvider | null> {
  const url = `${FIRESTORE_BASE}/providers/${id}?key=${API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch provider: ${res.status}`);
  }
  const json = await res.json();
  return mapDoc(json);
}

/* ───────── review helpers ───────── */

export interface ReviewDoc {
  id: string;
  providerId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

function mapReviewDoc(doc: any): ReviewDoc {
  const f = doc.fields || {};
  const s = (n: string) => f[n]?.stringValue ?? '';
  const n = (n: string) => Number(f[n]?.integerValue ?? f[n]?.doubleValue ?? 0);
  return {
    id: doc.name?.split('/').pop() ?? '',
    providerId: s('providerId') || String(n('providerId')),
    userId: s('userId'),
    userName: s('userName'),
    rating: n('rating'),
    comment: s('comment'),
    createdAt: f.createdAt?.timestampValue ?? undefined,
  };
}

export async function getReviewsByProviderRest(providerId: string): Promise<ReviewDoc[]> {
  const url = `${FIRESTORE_BASE}:runQuery?key=${API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'reviews' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'providerId' },
          op: 'EQUAL',
          value: { integerValue: providerId },
        },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Failed to query reviews: ${res.status}`);
  const results = await res.json();
  // Sort newest-first client-side (no composite index needed)
  const docs = results
    .filter((r: any) => r.document)
    .map((r: any) => mapReviewDoc(r.document));
  return docs.sort((a: ReviewDoc, b: ReviewDoc) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export async function addReviewRest(data: Omit<ReviewDoc, 'id' | 'createdAt'>): Promise<string> {
  const url = `${FIRESTORE_BASE}/reviews?key=${API_KEY}`;
  const body = {
    fields: {
      providerId: { integerValue: data.providerId },
      userId: { stringValue: data.userId },
      userName: { stringValue: data.userName },
      rating: { integerValue: data.rating },
      comment: { stringValue: data.comment },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add review: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

/* ───────── favorite helpers ───────── */

export async function findFavoriteIdRest(userId: string, providerId: number): Promise<string | null> {
  const url = `${FIRESTORE_BASE}:runQuery?key=${API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'favorites' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } },
            { fieldFilter: { field: { fieldPath: 'providerId' }, op: 'EQUAL', value: { integerValue: providerId } } },
          ],
        },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to query favorites: ${res.status}`);
  const results = await res.json();
  const docs = results.filter((r: any) => r.document).map((r: any) => r.document);
  return docs.length > 0 ? (docs[0].name?.split('/').pop() ?? null) : null;
}

export async function addFavoriteRest(data: {
  userId: string;
  providerId: number;
  providerName: string;
  category: string;
  emoji: string;
  rating: number;
}): Promise<string> {
  const url = `${FIRESTORE_BASE}/favorites?key=${API_KEY}`;
  const body = {
    fields: {
      userId: { stringValue: data.userId },
      providerId: { integerValue: data.providerId },
      providerName: { stringValue: data.providerName },
      category: { stringValue: data.category },
      emoji: { stringValue: data.emoji },
      rating: { doubleValue: data.rating },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to add favorite: ${res.status}`);
  const json = await res.json();
  return json.name?.split('/').pop() ?? '';
}

export async function removeFavoriteRest(docId: string): Promise<void> {
  const url = `${FIRESTORE_BASE}/favorites/${docId}?key=${API_KEY}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to remove favorite: ${res.status}`);
}
