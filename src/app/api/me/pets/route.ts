export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);

    const db = getAdminDb();
    const snap = await db
      .collection('pets')
      .where('userId', '==', decoded.uid)
      .get();

    const pets = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ pets });
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
    const pet = {
      name: body.name,
      type: body.type,
      breed: body.breed || '',
      age: body.age || '',
      notes: body.notes || '',
      userId: decoded.uid,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('pets').add(pet);

    return NextResponse.json({
      pet: {
        id: ref.id,
        ...pet,
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
