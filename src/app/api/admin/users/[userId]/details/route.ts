export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { getDocRest, runQueryRest } from '@/lib/firestore-admin-rest';

interface PetData {
  userId?: { stringValue?: string };
  name?: { stringValue?: string };
  type?: { stringValue?: string };
  breed?: { stringValue?: string };
  age?: { stringValue?: string };
  weight?: { stringValue?: string };
  medicalNotes?: { stringValue?: string };
}

interface ReviewData {
  providerId?: { stringValue?: string };
  userId?: { stringValue?: string };
  userName?: { stringValue?: string };
  rating?: { integerValue?: string | number };
  comment?: { stringValue?: string };
  createdAt?: { stringValue?: string };
}

interface BookingData {
  serviceType?: { stringValue?: string };
  providerId?: { stringValue?: string };
  providerName?: { stringValue?: string };
  userId?: { stringValue?: string };
  userName?: { stringValue?: string };
  userEmail?: { stringValue?: string };
  date?: { stringValue?: string };
  time?: { stringValue?: string };
  timeSlot?: { stringValue?: string };
  status?: { stringValue?: string };
  price?: { doubleValue?: number; integerValue?: number };
  platformFee?: { doubleValue?: number; integerValue?: number };
  total?: { doubleValue?: number; integerValue?: number };
  petName?: { stringValue?: string };
  instructions?: { stringValue?: string };
  phone?: { stringValue?: string };
  createdAt?: { stringValue?: string };
}

interface PaymentData {
  bookingId?: { stringValue?: string };
  providerId?: { stringValue?: string };
  userId?: { stringValue?: string };
  amount?: { doubleValue?: number; integerValue?: number };
  platformFee?: { doubleValue?: number; integerValue?: number };
  status?: { stringValue?: string };
  createdAt?: { stringValue?: string };
}

/** Extract Firestore field value from a typed value object. */
function fv(value: { stringValue?: string; doubleValue?: number; integerValue?: number | string } | undefined): string | number | null {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  return null;
}

/** GET /api/admin/users/[userId]/details */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;

    // Authenticate and verify admin role
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const token = authHeader.slice('Bearer '.length);
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);

    // Verify the calling user is an admin
    const callerDoc = await getDocRest('users', decoded.uid);
    if (!callerDoc || (callerDoc.role?.stringValue || callerDoc.role) !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch user document
    const userDoc = await getDocRest('users', userId);
    if (!userDoc) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = {
      id: userId,
      name: fv(userDoc.name),
      email: fv(userDoc.email),
      role: fv(userDoc.role),
      phone: fv(userDoc.phone),
      photoURL: fv(userDoc.photoURL),
      authMethod: fv(userDoc.authMethod),
      createdAt: fv(userDoc.createdAt),
    };

    // Fetch pets
    const petDocs = await runQueryRest<PetData>('pets', 'userId', 'EQUAL', userId);
    const pets = petDocs.map(p => ({
      id: p.id,
      name: fv(p.data.name),
      type: fv(p.data.type),
      breed: fv(p.data.breed),
      age: fv(p.data.age),
      weight: fv(p.data.weight),
      medicalNotes: fv(p.data.medicalNotes),
    }));

    // Fetch bookings
    const bookingDocs = await runQueryRest<BookingData>('bookings', 'userId', 'EQUAL', userId);
    const bookings = bookingDocs.map(b => ({
      id: b.id,
      serviceType: fv(b.data.serviceType),
      providerId: fv(b.data.providerId),
      providerName: fv(b.data.providerName),
      date: fv(b.data.date),
      time: fv(b.data.time || b.data.timeSlot),
      status: fv(b.data.status),
      price: fv(b.data.price),
      platformFee: fv(b.data.platformFee),
      total: fv(b.data.total),
      petName: fv(b.data.petName),
      instructions: fv(b.data.instructions),
      phone: fv(b.data.phone),
      createdAt: fv(b.data.createdAt),
    }));

    // Fetch payments
    const paymentDocs = await runQueryRest<PaymentData>('payments', 'userId', 'EQUAL', userId);
    const payments = paymentDocs.map(p => ({
      id: p.id,
      bookingId: fv(p.data.bookingId),
      providerId: fv(p.data.providerId),
      amount: fv(p.data.amount),
      platformFee: fv(p.data.platformFee),
      status: fv(p.data.status),
      createdAt: fv(p.data.createdAt),
    }));

    // Fetch reviews
    const reviewDocs = await runQueryRest<ReviewData>('reviews', 'userId', 'EQUAL', userId);
    const reviews = reviewDocs.map(r => ({
      id: r.id,
      providerId: fv(r.data.providerId),
      userName: fv(r.data.userName),
      rating: fv(r.data.rating),
      comment: fv(r.data.comment),
      createdAt: fv(r.data.createdAt),
    }));

    return NextResponse.json({ user, pets, bookings, payments, reviews });
  } catch (error: any) {
    console.error('Admin user details API failed:', error?.message, error?.code);
    return NextResponse.json(
      { error: 'Failed to fetch user details', message: error?.message },
      { status: 500 },
    );
  }
}
