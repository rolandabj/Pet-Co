export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { createBookingSchema } from '@/lib/validation';
import { checkRateLimit, clientIp, makeKey } from '@/lib/rate-limit';

/** GET /api/bookings?providerId=xxx&date=2026-05-25 — returns booked time slots */
export async function GET(request: Request) {
  try {
    await requireFirebaseUser(request);

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');
    const date = searchParams.get('date');
    if (!providerId || !date) {
      return NextResponse.json(
        { error: 'Missing providerId or date' },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const snap = await db
      .collection('bookings')
      .where('providerId', '==', providerId)
      .where('date', '==', date)
      .get();

    const bookedSlots = snap.docs
      .filter((d) => {
        const s = d.data().status;
        return s !== 'cancelled' && s !== 'declined';
      })
      .map((d) => d.data().timeSlot || d.data().time)
      .filter(Boolean);

    return NextResponse.json({ bookedSlots });
  } catch (error: any) {
    if (error.message === 'Missing Authorization Bearer token') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('GET /api/bookings failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'Failed to fetch booked slots' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const decoded = await requireFirebaseUser(request);

    // Enforce booking-specific rate limit (30 req / 15 min per IP)
    const ip = clientIp(request);
    const rl = checkRateLimit(makeKey('booking', ip), { windowMs: 15 * 60 * 1000, maxRequests: 30 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later.' },
        { status: 429 },
      );
    }

    const body = createBookingSchema.parse(await request.json());

    const db = getAdminDb();
    const slot = body.timeSlot || body.time || '';

    // ── Atomic booking creation with deterministic document ID ────
    // The document key is derived from the unique booking triple:
    //   providerId + date + slot + serviceType
    // Using .create() instead of .add() eliminates the TOCTOU race
    // because Firestore rejects the write atomically if the document
    // already exists — there is no separate read-then-write window.
    const slotKey = `${body.providerId}_${body.date}_${slot}_${body.serviceType}`
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const bookingData: Record<string, unknown> = {
      userId: decoded.uid,
      serviceType: body.serviceType,
      providerId: body.providerId,
      providerName: body.providerName,
      providerBusinessName: body.providerBusinessName,
      customerName: body.customerName || decoded.email?.split('@')[0] || 'Customer',
      customerEmail: decoded.email || '',
      customerPhone: body.customerPhone,
      date: body.date,
      time: body.time,
      timeSlot: slot,
      instructions: body.instructions,
      petId: body.petId,
      petName: body.petName,
      price: body.price,
      platformFee: body.platformFee,
      total: body.total,
      currency: body.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await db.collection('bookings').doc(slotKey).create(bookingData);
    } catch (createErr: any) {
      // code 'already-exists' (Admin SDK) or 6 (gRPC status) means
      // a booking for this exact slot already exists — race-safe
      if (
        createErr.code === 'already-exists' ||
        createErr.code === 6 ||
        createErr.message?.includes('already exists')
      ) {
        return NextResponse.json(
          { error: 'This time slot has already been booked.' },
          { status: 409 },
        );
      }
      throw createErr; // Unexpected error — let outer catch handle it
    }

    // ── Create the payment ledger entry ─────────────────────────
    await db.collection('payments').add({
      bookingId: slotKey,
      customerId: decoded.uid,
      customerName: body.customerName || decoded.email?.split('@')[0] || 'Customer',
      providerId: body.providerId,
      providerName: body.providerName || 'Unknown Provider',
      category: body.category || body.serviceType,
      amount: body.total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ bookingId: slotKey });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/bookings failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
