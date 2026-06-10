export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { readBoundedBodyJSON, createFavoriteSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');

    const db = getAdminDb();
    const snap = await db
      .collection('favorites')
      .where('userId', '==', decoded.uid)
      .get();

    let favorites = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (providerId) {
      favorites = favorites.filter((fav: any) => fav.providerId === providerId);
    }

    return NextResponse.json({ favorites });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('GET /api/me/favorites failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const body = createFavoriteSchema.parse(await readBoundedBodyJSON(request));

    const db = getAdminDb();

    // Check if already favorited
    const existingSnap = await db
      .collection('favorites')
      .where('userId', '==', decoded.uid)
      .where('providerId', '==', body.providerId)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      return NextResponse.json({
        favorite: {
          id: existingDoc.id,
          ...existingDoc.data(),
        },
      });
    }

    const favorite = {
      userId: decoded.uid,
      providerId: body.providerId,
      providerName: body.providerName,
      category: body.category,
      emoji: body.emoji,
      rating: body.rating,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('favorites').add(favorite);

    return NextResponse.json({
      favorite: {
        id: ref.id,
        ...favorite,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/me/favorites failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');
    const favoriteId = searchParams.get('favoriteId');

    const db = getAdminDb();

    if (favoriteId) {
      const ref = db.collection('favorites').doc(favoriteId);
      const doc = await ref.get();

      if (!doc.exists || doc.data()?.userId !== decoded.uid) {
        return NextResponse.json(
          { error: 'Favorite not found' },
          { status: 404 },
        );
      }

      await ref.delete();
      return NextResponse.json({ success: true });
    }

    if (!providerId) {
      return NextResponse.json(
        { error: 'Missing providerId or favoriteId' },
        { status: 400 },
      );
    }

    const snap = await db
      .collection('favorites')
      .where('userId', '==', decoded.uid)
      .where('providerId', '==', providerId)
      .get();

    await Promise.all(snap.docs.map((doc) => doc.ref.delete()));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('DELETE /api/me/favorites failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
