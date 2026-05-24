import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firestore Admin is not initialized' },
        { status: 500 },
      );
    }

    const snap = await adminDb
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
  } catch (error) {
    console.error('GET /api/me/favorites failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch favorites' },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const body = await request.json();

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firestore Admin is not initialized' },
        { status: 500 },
      );
    }

    // Check if already favorited
    const existingSnap = await adminDb
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

    const ref = await adminDb.collection('favorites').add(favorite);

    return NextResponse.json({
      favorite: {
        id: ref.id,
        ...favorite,
      },
    });
  } catch (error) {
    console.error('POST /api/me/favorites failed', error);
    return NextResponse.json(
      { error: 'Failed to add favorite' },
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

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firestore Admin is not initialized' },
        { status: 500 },
      );
    }

    if (favoriteId) {
      const ref = adminDb.collection('favorites').doc(favoriteId);
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

    const snap = await adminDb
      .collection('favorites')
      .where('userId', '==', decoded.uid)
      .where('providerId', '==', providerId)
      .get();

    await Promise.all(snap.docs.map((doc) => doc.ref.delete()));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/me/favorites failed', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 401 },
    );
  }
}
