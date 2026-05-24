import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firestore Admin is not initialized' },
        { status: 500 },
      );
    }

    const snap = await adminDb
      .collection('pets')
      .where('userId', '==', decoded.uid)
      .get();

    const pets = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ pets });
  } catch (error) {
    console.error('GET /api/me/pets failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch pets' },
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

    const pet = {
      name: body.name,
      type: body.type,
      breed: body.breed || '',
      age: body.age || '',
      notes: body.notes || '',
      userId: decoded.uid,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb.collection('pets').add(pet);

    return NextResponse.json({
      pet: {
        id: ref.id,
        ...pet,
      },
    });
  } catch (error) {
    console.error('POST /api/me/pets failed', error);
    return NextResponse.json(
      { error: 'Failed to add pet' },
      { status: 401 },
    );
  }
}
