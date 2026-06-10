import { z } from 'zod';

// ── Shared field constraints ──────────────────────────────────────
const nameField = z.string().min(1).max(100);
const optNameField = z.string().max(100).optional().default('');
const textField = z.string().max(2000).optional().default('');
const optTextField = z.string().max(2000).optional();
const positiveNum = z.number().nonnegative();
const uidField = z.string().min(1);

// ── Body size guard (reject payloads > 100 KB) ────────────────────
const MAX_BODY_BYTES = 100 * 1024; // 100 KB

/**
 * Check the Content-Length header of a request and throw if it exceeds
 * the 100 KB limit. Call this before `request.json()`.
 */
export function checkBodySize(request: Request): void {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new Error('Request body too large');
  }
}

// ── Schemas ───────────────────────────────────────────────────────

/** POST /api/bookings */
export const createBookingSchema = z.object({
  providerId: uidField,
  serviceType: nameField,
  providerName: optNameField,
  providerBusinessName: optNameField,
  customerName: optNameField,
  customerPhone: z.string().max(100).optional().default(''),
  date: z.string().min(1, 'Date is required'),
  time: z.string().max(100).optional().default(''),
  timeSlot: z.string().max(100).optional().default(''),
  instructions: textField,
  petId: z.string().max(100).optional().default(''),
  petName: optNameField,
  price: positiveNum,
  platformFee: positiveNum,
  total: positiveNum,
  currency: z.string().max(10).optional().default('USD'),
  category: z.string().max(100).optional(),
});

/** POST /api/reviews */
export const createReviewSchema = z.object({
  providerId: uidField,
  rating: z.number().min(1).max(5),
  comment: z.string().max(2000).optional().default(''),
});

/** POST /api/me/pets */
export const createPetSchema = z.object({
  name: nameField,
  type: nameField,
  breed: z.string().max(100).optional().default(''),
  age: z.string().max(100).optional().default(''),
  notes: textField,
});

/** POST /api/me/favorites */
export const createFavoriteSchema = z.object({
  providerId: uidField,
  providerName: optNameField,
  category: z.string().max(100).optional().default(''),
  emoji: z.string().max(20).optional().default('🐾'),
  rating: z.number().min(0).max(5).optional().default(0),
});

/** PATCH /api/payments */
export const updatePaymentSchema = z.object({
  bookingId: uidField,
  status: z.enum(['paid', 'pending', 'unpaid']),
});

/** POST /api/admin/payments/batch-fee-collect */
export const batchFeeCollectSchema = z.object({
  paymentIds: z.array(z.string().min(1)).min(1),
  collected: z.boolean().optional().default(true),
});

/** POST /api/auth/delete-user */
export const deleteUserSchema = z.object({
  uid: uidField,
});
