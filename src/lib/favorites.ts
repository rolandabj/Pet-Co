import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase';

export interface FavoriteDoc {
  id: string;
  userId: string;
  providerId: number;
  providerName: string;
  category: string;
  emoji: string;
  rating: number;
  createdAt?: unknown;
}

export async function getUserFavorites(userId: string): Promise<FavoriteDoc[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const q = query(collection(db, 'favorites'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FavoriteDoc, 'id'>) }));
}

export async function addFavorite(fav: Omit<FavoriteDoc, 'id' | 'createdAt'>): Promise<string> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase is not configured');
  const docRef = await addDoc(collection(db, 'favorites'), {
    ...fav,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function removeFavorite(favoriteId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  await deleteDoc(doc(db, 'favorites', favoriteId));
}

export async function findFavoriteId(
  userId: string,
  providerId: number
): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  const q = query(
    collection(db, 'favorites'),
    where('userId', '==', userId),
    where('providerId', '==', providerId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].id;
}
