/**
 * Services page – server component.
 * Fetches provider data server-side and accepts ?type= search param for filtering.
 */
import { ServiceProvider } from '@/lib/types';
import ServicesClient from './ServicesClient';

/** Convert a Firestore document (REST API shape) to our ServiceProvider type. */
function docToProvider(doc: any): ServiceProvider {
  const f = doc.fields || {};
  const s = (n: string) => f[n]?.stringValue ?? '';
  const n = (n: string) => Number(f[n]?.integerValue ?? f[n]?.doubleValue ?? 0);
  const a = (n: string) => f[n]?.arrayValue?.values?.map((v: any) => v.stringValue) ?? [];
  return {
    id: doc.name.split('/').pop() ?? '',
    name: s('name'),
    businessName: s('businessName') || undefined,
    type: s('type'),
    category: s('category'),
    rating: n('rating'),
    reviews: n('reviews') || n('reviewCount'),
    desc: s('desc'),
    tags: a('tags'),
    emoji: s('emoji'),
    price: s('price'),
    logoUrl: s('logoUrl') || undefined,
    location: s('location') || undefined,
    googleMapsUrl: s('googleMapsUrl') || undefined,
    since: s('since') || undefined,
  };
}

interface Props {
  searchParams: Promise<{ type?: string }>;
}

export default async function ServicesPage({ searchParams }: Props) {
  const { type: activeFilter } = await searchParams;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  let providers: ServiceProvider[] = [];
  let loadError = '';

  if (projectId && apiKey) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/providers?key=${apiKey}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        providers = (json.documents || []).map(docToProvider);
      } else {
        loadError = `Failed to load providers (${res.status})`;
      }
    } catch (e: any) {
      loadError = e?.message || 'Failed to load providers';
    }
  } else {
    loadError = 'Firebase config missing';
  }

  // Filter providers server-side based on ?type= search param
  const filtered = activeFilter
    ? providers.filter(p => p.type === activeFilter)
    : providers;

  return (
    <ServicesClient
      providers={filtered}
      activeFilter={activeFilter ?? 'all'}
      loadError={loadError}
      dbEmpty={providers.length === 0 && !loadError}
    />
  );
}
