export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireFirebaseUser } from '@/lib/server-auth';
import { runQueryRest, deleteDocRest, updateDocRest } from '@/lib/firestore-admin-rest';

/**
 * Convert a Firestore document returned by runQueryRest (raw typed fields)
 * to a flat payment object matching the shape callers expect.
 */
function paymentFromDocument(doc: { id: string; data: Record<string, any> }) {
  const f = doc.data;
  const s = (n: string) => (f[n] as any)?.stringValue ?? '';
  const n = (n: string) => Number((f[n] as any)?.integerValue ?? (f[n] as any)?.doubleValue ?? 0);
  const b = (n: string) => (f[n] as any)?.booleanValue ?? false;
  return {
    id: doc.id,
    amount: n('amount'),
    status: s('status'),
    bookingId: s('bookingId'),
    providerId: s('providerId'),
    customerId: s('customerId'),
    category: s('category'),
    providerName: s('providerName'),
    createdAt: s('createdAt'),
    feeCollected: b('feeCollected'),
  };
}

/**
 * GET /api/payments?role=provider|customer
 *
 * Returns all payments for the authenticated user in the given role.
 * Uses Firestore REST API — bypasses gRPC which can fail in sandboxed environments.
 */
export async function GET(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') || 'customer';

    const field = role === 'provider' ? 'providerId' : 'customerId';
    const docs = await runQueryRest('payments', field, 'EQUAL', decoded.uid);
    const payments = docs.map(paymentFromDocument);

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

    // Find the payment by bookingId via REST query
    const docs = await runQueryRest('payments', 'bookingId', 'EQUAL', bookingId);

    if (docs.length === 0) {
      return NextResponse.json(
        { error: 'No payment found for this booking' },
        { status: 404 },
      );
    }

    const paymentId = docs[0].id;
    await updateDocRest('payments', paymentId, { status }, ['status']);

    return NextResponse.json({
      id: paymentId,
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

    // Find the payment by bookingId via REST query
    const docs = await runQueryRest('payments', 'bookingId', 'EQUAL', bookingId);

    if (docs.length === 0) {
      return NextResponse.json(
        { error: 'No payment found for this booking' },
        { status: 404 },
      );
    }

    const paymentId = docs[0].id;
    await deleteDocRest('payments', paymentId);

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
