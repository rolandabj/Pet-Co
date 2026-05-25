export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { deleteDocRest, deleteDocsBatch, getAccessToken, getDocRest, runQueryRest } from '@/lib/firestore-admin-rest';

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
    const body = await request.json().catch(() => ({}));
    const providerId: string | undefined = body.providerId;

    if (!providerId) {
      return NextResponse.json(
        { error: 'Missing providerId in request body' },
        { status: 400 },
      );
    }

    const auth = getAdminAuth();
    console.log('🧹 DELETE ACCOUNT — providerId:', providerId, 'uid:', decoded.uid);

    // ── 1. Query relational documents ─────────────────────────
    const [bookingDocs, paymentDocs, reviewDocs, allFavDocs] = await Promise.all([
      runQueryRest<{ providerId?: string }>('bookings', 'providerId', 'EQUAL', providerId),
      runQueryRest<{ providerId?: string }>('payments', 'providerId', 'EQUAL', providerId),
      runQueryRest<{ providerId?: string }>('reviews', 'providerId', 'EQUAL', providerId),
      runQueryRest<{ providerId?: string; targetId?: string }>('favorites', 'providerId', 'EQUAL', providerId)
        .catch(() => runQueryRest<{ providerId?: string; targetId?: string }>('favorites', 'targetId', 'EQUAL', providerId))
        .catch(() => []),
    ]);

    console.log('🧹 DELETE ACCOUNT — documents found', {
      bookings: bookingDocs.map((d) => d.id),
      payments: paymentDocs.map((d) => d.id),
      reviews: reviewDocs.map((d) => d.id),
      favorites: allFavDocs.map((d) => d.id),
    });

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
      console.error('🧹 DELETE ACCOUNT — failed to fetch provider doc:', err);
    }

    console.log('🧹 DELETE ACCOUNT — provider doc exists:', providerDocExists);

    // ── 3. Delete relational documents in batch ──────────────
    const relationalDocs = [
      ...bookingDocs.map((d) => ({ collection: 'bookings' as const, docId: d.id })),
      ...paymentDocs.map((d) => ({ collection: 'payments' as const, docId: d.id })),
      ...reviewDocs.map((d) => ({ collection: 'reviews' as const, docId: d.id })),
      ...favoriteDocs.map((d) => ({ collection: 'favorites' as const, docId: d.id })),
    ];

    if (relationalDocs.length > 0) {
      console.log('🧹 DELETE ACCOUNT — batch deleting', relationalDocs.length, 'relational docs');
      await deleteDocsBatch(relationalDocs);
      console.log('🧹 DELETE ACCOUNT — relational docs batch deleted');
    }

    // ── 4. Delete the provider document ───────────────────────
    await deleteDocRest('providers', providerId);
    console.log('🧹 DELETE ACCOUNT — provider doc deleted');

    // ── 5. Downgrade user role ────────────────────────────────
    // Look up the user doc by its document ID (= Firebase Auth UID = providerId)
    // instead of querying by email, because user docs created via
    // updateUserDocRest do not have an 'email' field.
    const userDocFields = await getDocRest('users', providerId);
    if (userDocFields) {
      const accessToken = await getAccessToken();
      const base = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
      const url = `${base}/users/${encodeURIComponent(providerId)}?updateMask.fieldPaths=role`;
      const patchRes = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            role: { stringValue: 'owner' },
          },
        }),
      });
      if (!patchRes.ok) {
        const body = await patchRes.text().catch(() => '');
        console.error('🧹 DELETE ACCOUNT — failed to update user role:', patchRes.status, body);
      } else {
        console.log('🧹 DELETE ACCOUNT — user doc downgraded to owner');
      }
    } else {
      console.log('🧹 DELETE ACCOUNT — no user doc found for providerId:', providerId);
    }

    // ── 6. Delete the Firebase Auth user ──────────────────────
    // NOTE: If this fails, the client will get a 500 and the overall
    // deletion is considered failed — the provider doc and related data
    // have already been deleted above, so re-running is safe.
    await auth.deleteUser(decoded.uid);
    console.log('🧹 DELETE ACCOUNT — Firebase Auth user deleted');

    return NextResponse.json({
      deleted: true,
      providerDocDeleted: true,
      providerDocExists,
      deletedBookings: bookingDocs.length,
      deletedPayments: paymentDocs.length,
      deletedReviews: reviewDocs.length,
      deletedFavorites: favoriteDocs.length,
    });
  } catch (error: any) {
    console.error('DELETE /api/me/account failed:', {
      message: error?.message,
      code: error?.code,
    });
    return NextResponse.json(
      { error: 'Failed to delete account', message: error?.message },
      { status: 401 },
    );
  }
}
