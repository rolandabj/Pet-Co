export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

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
    console.error('API route failed', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: 'Unauthorized or API failure',
        message: error?.message,
        code: error?.code,
      },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const body = await request.json();

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
      providerName: body.providerName || '',
      category: body.category || '',
      emoji: body.emoji || '🐾',
      rating: body.rating || 0,
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
    console.error('API route failed', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: 'Unauthorized or API failure',
        message: error?.message,
        code: error?.code,
      },
      { status: 401 },
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
    console.error('API route failed', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: 'Unauthorized or API failure',
        message: error?.message,
        code: error?.code,
      },
      { status: 401 },
    );
  }
}
