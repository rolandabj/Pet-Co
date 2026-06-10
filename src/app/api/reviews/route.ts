export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { checkBodySize, createReviewSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    checkBodySize(request);
    const decoded = await requireFirebaseUser(request);
    const body = createReviewSchema.parse(await request.json());

    const db = getAdminDb();

    // Look up the user's Firestore doc to get their profile name
    let profileName = decoded.email?.split('@')[0] || 'Anonymous';
    try {
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (userSnap.exists && userSnap.data()?.name) {
        profileName = userSnap.data()!.name;
      }
    } catch {
      // Non-fatal — fall back to email prefix
    }

    const review = {
      providerId: body.providerId,
      userId: decoded.uid,
      userName: profileName,
      rating: body.rating,
      comment: body.comment,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('reviews').add(review);

    // Sync provider rating/review count aggregates
    let providerRating = 0;
    let providerReviews = 0;
    try {
      const allReviewsSnap = await db
        .collection('reviews')
        .where('providerId', '==', body.providerId)
        .get();
      providerReviews = allReviewsSnap.size;
      let totalStars = 0;
      allReviewsSnap.forEach((doc) => {
        totalStars += doc.data().rating || 0;
      });
      providerRating = providerReviews > 0
        ? parseFloat((totalStars / providerReviews).toFixed(1))
        : 0;

      await db.collection('providers').doc(body.providerId).update({
        rating: providerRating,
        reviews: providerReviews,
      });
    } catch (syncErr) {
      // Non-fatal — review itself was saved
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to sync provider aggregates:', syncErr);
      }
    }

    return NextResponse.json({
      review: {
        id: ref.id,
        ...review,
      },
      providerRating,
      providerReviews,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/reviews failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
