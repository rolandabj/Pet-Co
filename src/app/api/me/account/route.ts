export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

/**
 * DELETE /api/me/account
 *
 * Cascading account deletion for provider accounts.
 * Uses Admin SDK — no Firestore security rule restrictions.
 *
 * Body: { providerId: string }
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

    const db = getAdminDb();
    const auth = getAdminAuth();

    // 1. Collect all relational documents
    const [bookingSnap, paymentSnap, reviewSnap] = await Promise.all([
      db.collection('bookings').where('providerId', '==', providerId).get(),
      db.collection('payments').where('providerId', '==', providerId).get(),
      db.collection('reviews').where('providerId', '==', providerId).get(),
    ]);

    // 2. Collect favorites (uses providerId or targetId)
    const allFavs = await db.collection('favorites').get();
    const favoriteDocs = allFavs.docs.filter(
      (d) => d.data().providerId === providerId || d.data().targetId === providerId,
    );

    // 3. Get provider doc info before deleting
    let logoUrl: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = null;
    try {
      const providerDoc = await db.collection('providers').doc(providerId).get();
      if (providerDoc.exists) {
        const data = providerDoc.data() || {};
        logoUrl = data.logoUrl ?? null;
        userEmail = data.email ?? data.contactEmail ?? null;
        userName = data.name ?? data.businessName ?? null;
      }
    } catch {
      // Provider doc may already be gone — proceed
    }

    // 4. Delete all relational documents in parallel
    await Promise.allSettled([
      ...bookingSnap.docs.map((d) => d.ref.delete()),
      ...paymentSnap.docs.map((d) => d.ref.delete()),
      ...reviewSnap.docs.map((d) => d.ref.delete()),
      ...favoriteDocs.map((d) => d.ref.delete()),
    ]);

    // 5. Delete the provider document itself
    try {
      await db.collection('providers').doc(providerId).delete();
    } catch {
      // Already gone — fine
    }

    // 6. Downgrade the associated user to 'owner' role
    if (userEmail) {
      try {
        // Find the user by email in the users collection
        const userSnap = await db
          .collection('users')
          .where('email', '==', userEmail)
          .limit(1)
          .get();
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          await userDoc.ref.update({ role: 'owner' });
        } else {
          // Try the decoded UID as fallback
          await db
            .collection('users')
            .doc(decoded.uid)
            .set({ role: 'owner', email: decoded.email }, { merge: true });
        }
      } catch {
        // Non-critical
      }
    }

    // 7. Attempt to delete the Firebase Auth user
    try {
      await auth.deleteUser(decoded.uid);
    } catch {
      // Non-critical — user can still log in with owner role
    }

    return NextResponse.json({
      deleted: true,
      deletedBookings: bookingSnap.docs.length,
      deletedPayments: paymentSnap.docs.length,
      deletedReviews: reviewSnap.docs.length,
      deletedFavorites: favoriteDocs.length,
      logoUrl,
      userEmail,
      userName,
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
