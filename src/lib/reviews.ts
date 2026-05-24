import {
  collection,
  doc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase';

export interface ReviewDoc {
  id: string;
  providerId: number;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: unknown;
}

export async function getReviewsByProvider(providerId: number): Promise<ReviewDoc[]> {
  const db = getFirestoreDb(); if (!db) throw new Error("Firebase is not configured");
  const q = query(
    collection(db, 'reviews'),
    where('providerId', '==', providerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ReviewDoc, 'id'>) }));
}

export async function getUserReviews(userId: string): Promise<ReviewDoc[]> {
  const db = getFirestoreDb(); if (!db) throw new Error("Firebase is not configured");
  const q = query(
    collection(db, 'reviews'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ReviewDoc, 'id'>) }));
}

export async function addReview(data: Omit<ReviewDoc, 'id' | 'createdAt'>): Promise<string> {
  const db = getFirestoreDb(); if (!db) throw new Error("Firebase is not configured");
  const docRef = await addDoc(collection(db, 'reviews'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
