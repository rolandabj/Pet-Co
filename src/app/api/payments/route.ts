export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';

/**
 * GET /api/payments?role=provider|customer
 *
 * Returns all payments for the authenticated user in the given role.
 * Uses Admin SDK — no security rule restrictions.
 */
export async function GET(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') || 'customer';

    const field = role === 'provider' ? 'providerId' : 'customerId';
    const db = getAdminDb();
    const snap = await db
      .collection('payments')
      .where(field, '==', decoded.uid)
      .get();

    const payments = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ payments });
  } catch (error: any) {
    console.error('GET /api/payments failed', {
      message: error?.message,
      code: error?.code,
    });
    return NextResponse.json(
      { error: 'Unauthorized or API failure', message: error?.message },
      { status: 401 },
    );
  }
}

/**
 * PATCH /api/payments
 *
 * Update a payment's status by bookingId.
 * Body: { bookingId, status }
 */
export async function PATCH(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const body = await request.json();
    const { bookingId, status } = body;

    if (!bookingId || !status) {
      return NextResponse.json(
        { error: 'Missing bookingId or status' },
        { status: 400 },
      );
    }

    const valid = ['paid', 'pending', 'unpaid'];
    if (!valid.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${valid.join(', ')}` },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    // Find the payment by bookingId
    const snap = await db
      .collection('payments')
      .where('bookingId', '==', bookingId)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { error: 'No payment found for this booking' },
        { status: 404 },
      );
    }

    const paymentRef = snap.docs[0].ref;
    await paymentRef.update({ status });

    return NextResponse.json({
      id: snap.docs[0].id,
      bookingId,
      status,
    });
  } catch (error: any) {
    console.error('PATCH /api/payments failed', {
      message: error?.message,
      code: error?.code,
    });
    return NextResponse.json(
      { error: 'Failed to update payment', message: error?.message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/payments?bookingId=xxx
 *
 * Delete a payment by bookingId (cascade delete when a booking
 * is cancelled or declined).
 */
export async function DELETE(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Missing bookingId query parameter' },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const snap = await db
      .collection('payments')
      .where('bookingId', '==', bookingId)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { error: 'No payment found for this booking' },
        { status: 404 },
      );
    }

    await snap.docs[0].ref.delete();

    return NextResponse.json({ deleted: true, bookingId });
  } catch (error: any) {
    console.error('DELETE /api/payments failed', {
      message: error?.message,
      code: error?.code,
    });
    return NextResponse.json(
      { error: 'Failed to delete payment', message: error?.message },
      { status: 500 },
    );
  }
}
