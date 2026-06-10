export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFirebaseUser } from '@/lib/server-auth';
import { runQueryRest, deleteDocRest, updateDocRest } from '@/lib/firestore-admin-rest';
import { checkBodySize, updatePaymentSchema } from '@/lib/validation';

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
    if (process.env.NODE_ENV === 'development') {
      console.error('GET /api/payments failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
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
    checkBodySize(request);
    const decoded = await requireFirebaseUser(request);
    const body = updatePaymentSchema.parse(await request.json());
    const { bookingId, status } = body;

    // Find the payment by bookingId via REST query
    const docs = await runQueryRest<{ customerId?: { stringValue: string }; providerId?: { stringValue: string } }>(
      'payments', 'bookingId', 'EQUAL', bookingId,
    );

    if (docs.length === 0) {
      return NextResponse.json(
        { error: 'No payment found for this booking' },
        { status: 404 },
      );
    }

    // Ownership check — only the payment's customer or provider may update it
    const paymentData = docs[0].data;
    const ownerId = paymentData.customerId?.stringValue ?? paymentData.providerId?.stringValue;
    if (ownerId !== decoded.uid) {
      return NextResponse.json(
        { error: 'You do not have permission to update this payment' },
        { status: 403 },
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
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('PATCH /api/payments failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
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
    if (process.env.NODE_ENV === 'development') {
      console.error('DELETE /api/payments failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
