export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { deleteDocRest, deleteDocsBatch, getDocRest, runQueryRest } from '@/lib/firestore-admin-rest';
import { checkRateLimit, clientIp, makeKey } from '@/lib/rate-limit';

/**
 * DELETE /api/me/account
 *
 * Cascading account deletion for provider accounts.
 * Uses Firestore REST API (not Admin SDK Firestore client) to avoid
 * gRPC transport issues that can silently fail in container environments.
 */
export async function DELETE(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const providerId = decoded.uid;

    // Inline rate limit (defence-in-depth; middleware also enforces this)
    const rl = checkRateLimit(makeKey('delete-account', clientIp(request), decoded.uid), {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later.' },
        { status: 429 },
      );
    }

    const auth = getAdminAuth();

    // ── 1. Query relational documents ─────────────────────────
    const [bookingDocs, paymentDocs, reviewDocs, allFavDocs, petDocs] = await Promise.all([
      runQueryRest<{ providerId?: string }>('bookings', 'providerId', 'EQUAL', providerId),
      runQueryRest<{ providerId?: string }>('payments', 'providerId', 'EQUAL', providerId),
      runQueryRest<{ providerId?: string }>('reviews', 'providerId', 'EQUAL', providerId),
      runQueryRest<{ providerId?: string; targetId?: string }>('favorites', 'providerId', 'EQUAL', providerId)
        .catch(() => runQueryRest<{ providerId?: string; targetId?: string }>('favorites', 'targetId', 'EQUAL', providerId))
        .catch(() => []),
      runQueryRest<{ userId?: string }>('pets', 'userId', 'EQUAL', decoded.uid),
    ]);

    // favorites query may return docs where providerId matches OR targetId matches
    const favoriteDocs = allFavDocs.filter(
      (d) => d.data.providerId === providerId || d.data.targetId === providerId,
    );

    // ── 2. Get provider doc info ──────────────────────────────
    let providerDocExists = false;

    try {
      const fields = await getDocRest('providers', providerId);
      providerDocExists = !!fields;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch provider doc:', err);
      }
    }

    // ── 3. Delete relational documents in batch ──────────────
    const relationalDocs = [
      ...bookingDocs.map((d) => ({ collection: 'bookings' as const, docId: d.id })),
      ...paymentDocs.map((d) => ({ collection: 'payments' as const, docId: d.id })),
      ...reviewDocs.map((d) => ({ collection: 'reviews' as const, docId: d.id })),
      ...favoriteDocs.map((d) => ({ collection: 'favorites' as const, docId: d.id })),
      ...petDocs.map((d) => ({ collection: 'pets' as const, docId: d.id })),
    ];

    if (relationalDocs.length > 0) {
      await deleteDocsBatch(relationalDocs);
    }

    // ── 4. Delete the provider document ───────────────────────
    await deleteDocRest('providers', providerId);

    // ── 5. Delete the user document from the users collection ──
    // This ensures the admin panel stops showing the user entirely.
    const userDocFields = await getDocRest('users', providerId);
    if (userDocFields) {
      await deleteDocRest('users', providerId);
    }

    // ── 6. Delete the Firebase Auth user ──────────────────────
    // NOTE: If this fails, the client will get a 500 and the overall
    // deletion is considered failed — the provider doc and related data
    // have already been deleted above, so re-running is safe.
    await auth.deleteUser(decoded.uid);

    return NextResponse.json({
      deleted: true,
      providerDocDeleted: true,
      providerDocExists,
      deletedBookings: bookingDocs.length,
      deletedPayments: paymentDocs.length,
      deletedReviews: reviewDocs.length,
      deletedFavorites: favoriteDocs.length,
      deletedPets: petDocs.length,
    });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('DELETE /api/me/account failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
