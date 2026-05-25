export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const body = await request.json();

    // Block reviews from service providers at the API level too
    if (body.userRole === 'provider') {
      return NextResponse.json(
        { error: 'Service providers cannot write reviews' },
        { status: 403 },
      );
    }

    const db = getAdminDb();

    const review = {
      providerId: body.providerId,
      userId: decoded.uid,
      userName: body.userName || decoded.email?.split('@')[0] || 'Anonymous',
      rating: body.rating,
      comment: body.comment || '',
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('reviews').add(review);

    return NextResponse.json({
      review: {
        id: ref.id,
        ...review,
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
