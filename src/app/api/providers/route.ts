import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/providers
 *
 * Returns all providers using the Firebase Admin SDK.
 * Uses the service account (privileged runtime) — not the public API key.
 */
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection('providers').get();

    const documents = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ documents });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('GET /api/providers failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
