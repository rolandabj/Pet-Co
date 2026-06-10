export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { checkBodySize, createPetSchema } from '@/lib/validation';

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
    if (process.env.NODE_ENV === 'development') {
      console.error('GET /api/me/pets failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    checkBodySize(request);
    const decoded = await requireFirebaseUser(request);
    const body = createPetSchema.parse(await request.json());

    const db = getAdminDb();
    const pet = {
      name: body.name,
      type: body.type,
      breed: body.breed,
      age: body.age,
      notes: body.notes,
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
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/me/pets failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
