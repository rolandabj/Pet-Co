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

    console.log('🧹 DELETE ACCOUNT — providerId:', providerId, 'uid:', decoded.uid);

    // 1. Collect all relational documents
    const [bookingSnap, paymentSnap, reviewSnap] = await Promise.all([
      db.collection('bookings').where('providerId', '==', providerId).get(),
      db.collection('payments').where('providerId', '==', providerId).get(),
      db.collection('reviews').where('providerId', '==', providerId).get(),
    ]);

    console.log('🧹 DELETE ACCOUNT — documents found', {
      bookings: bookingSnap.docs.map((d) => d.id),
      payments: paymentSnap.docs.map((d) => d.id),
      reviews: reviewSnap.docs.map((d) => d.id),
    });

    // 2. Collect favorites (uses providerId or targetId)
    const allFavs = await db.collection('favorites').get();
    const favoriteDocs = allFavs.docs.filter(
      (d) => d.data().providerId === providerId || d.data().targetId === providerId,
    );

    console.log('🧹 DELETE ACCOUNT — favorites found:', favoriteDocs.map((d) => d.id));

    // 3. Get provider doc info before deleting
    let logoUrl: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = null;
    let providerDocExists = false;
    try {
      const providerDoc = await db.collection('providers').doc(providerId).get();
      providerDocExists = providerDoc.exists;
      if (providerDoc.exists) {
        const data = providerDoc.data() || {};
        logoUrl = data.logoUrl ?? null;
        userEmail = data.email ?? data.contactEmail ?? null;
        userName = data.name ?? data.businessName ?? null;
      }
    } catch (err) {
      console.error('🧹 DELETE ACCOUNT — failed to fetch provider doc:', err);
    }

    console.log('🧹 DELETE ACCOUNT — provider doc exists:', providerDocExists, { logoUrl, userEmail, userName });

    // 4. Delete all relational documents in parallel
    //    Use Promise.allSettled so one failure doesn't block others,
    //    but log each failure for diagnostics.
    const deleteResults = await Promise.allSettled([
      ...bookingSnap.docs.map((d) => d.ref.delete()),
      ...paymentSnap.docs.map((d) => d.ref.delete()),
      ...reviewSnap.docs.map((d) => d.ref.delete()),
      ...favoriteDocs.map((d) => d.ref.delete()),
    ]);
    const rejections = deleteResults.filter((r) => r.status === 'rejected');
    if (rejections.length > 0) {
      console.error('🧹 DELETE ACCOUNT — relational doc deletions failed:', rejections);
    }

    // 5. Delete the provider document itself
    try {
      await db.collection('providers').doc(providerId).delete();
      console.log('🧹 DELETE ACCOUNT — provider doc deleted');
    } catch (err) {
      console.error('🧹 DELETE ACCOUNT — failed to delete provider doc:', err);
    }

    // 6. Downgrade the associated user to 'owner' role
    if (userEmail) {
      try {
        const userSnap = await db
          .collection('users')
          .where('email', '==', userEmail)
          .limit(1)
          .get();
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          await userDoc.ref.update({ role: 'owner' });
          console.log('🧹 DELETE ACCOUNT — user doc downgraded to owner (by email)');
        } else {
          await db
            .collection('users')
            .doc(decoded.uid)
            .set({ role: 'owner', email: decoded.email }, { merge: true });
          console.log('🧹 DELETE ACCOUNT — user doc set to owner (by uid)');
        }
      } catch (err) {
        console.error('🧹 DELETE ACCOUNT — failed to update user role:', err);
      }
    }

    // 7. Attempt to delete the Firebase Auth user
    try {
      await auth.deleteUser(decoded.uid);
      console.log('🧹 DELETE ACCOUNT — Firebase Auth user deleted');
    } catch (err) {
      console.error('🧹 DELETE ACCOUNT — failed to delete Firebase Auth user:', err);
    }

    return NextResponse.json({
      deleted: true,
      providerDocDeleted: true,
      providerDocExists,
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
