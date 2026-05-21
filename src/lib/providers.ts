import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { getFirestoreDb } from './firebase';
import { ServiceProvider } from './types';

function mapDoc(id: string, data: Record<string, unknown>): ServiceProvider {
  return {
    id: Number(id),
    name: data.name as string,
    type: data.type as string,
    category: data.category as string,
    rating: data.rating as number,
    reviews: data.reviews as number,
    desc: data.desc as string,
    tags: data.tags as string[],
    emoji: data.emoji as string,
    price: data.price as string,
    location: data.location as string | undefined,
    since: data.since as string | undefined,
  };
}

export async function getAllProviders(): Promise<ServiceProvider[]> {
  const db = getFirestoreDb();
  const snapshot = await getDocs(collection(db, 'providers'));
  return snapshot.docs.map(d => mapDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getProviderById(id: number): Promise<ServiceProvider | null> {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, 'providers', String(id)));
  if (!snap.exists()) return null;
  return mapDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function getProvidersByType(type: string): Promise<ServiceProvider[]> {
  const db = getFirestoreDb();
  const q = query(collection(db, 'providers'), where('type', '==', type));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => mapDoc(d.id, d.data() as Record<string, unknown>));
}

export const serviceTypes = [
  { value: 'walking', label: '🐕 Dog Walking', price: 25 },
  { value: 'vet', label: '🏥 Vet Visit', price: 60 },
  { value: 'hotel', label: '🏨 Dog Hotel', price: 45 },
  { value: 'sitting', label: '🛋️ Pet Sitting', price: 40 },
  { value: 'grooming', label: '✂️ Grooming', price: 35 },
  { value: 'shop', label: '🛍️ Pet Shop', price: 0 },
];
