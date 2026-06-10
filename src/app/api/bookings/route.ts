export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFirebaseUser } from '@/lib/server-auth';
import { checkBodySize, createBookingSchema } from '@/lib/validation';
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
    checkBodySize(request);
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

    // ── Atomic double-booking guard ─────────────────────────────
    // Fetch all bookings for this provider on this date and check
    // for a conflict on the same slot + serviceType.
    const existingSnap = await db
      .collection('bookings')
      .where('providerId', '==', body.providerId)
      .where('date', '==', body.date)
      .get();

    const slot = body.timeSlot || body.time || '';
    const conflict = existingSnap.docs.find((doc) => {
      const d = doc.data();
      return (
        (d.timeSlot || d.time) === slot &&
        d.serviceType === body.serviceType &&
        d.status !== 'cancelled' &&
        d.status !== 'declined'
      );
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'This time slot has already been booked.' },
        { status: 409 },
      );
    }

    // ── Create the booking document ─────────────────────────────
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

    const bookingRef = await db.collection('bookings').add(bookingData);
    const bookingId = bookingRef.id;

    // ── Create the payment ledger entry ─────────────────────────
    await db.collection('payments').add({
      bookingId,
      customerId: decoded.uid,
      customerName: body.customerName || decoded.email?.split('@')[0] || 'Customer',
      providerId: body.providerId,
      providerName: body.providerName || 'Unknown Provider',
      category: body.category || body.serviceType,
      amount: body.total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ bookingId });
  } catch (error: any) {
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
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
