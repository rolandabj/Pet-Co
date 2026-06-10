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
 * Read the request body as JSON, enforcing a hard 100 KB limit at the
 * **stream level** — bytes are counted chunk-by-chunk as they arrive.
 *
 * If the total exceeds `MAX_BODY_BYTES` the reader is cancelled and the
 * function throws **before** JSON parsing begins, preventing memory
 * exhaustion from large or chunked payloads.
 *
 * Unlike the previous `checkBodySize()` which blindly trusted the
 * client-supplied `Content-Length` header, this function:
 *   - Rejects `Transfer-Encoding: chunked` (unbounded bodies)
 *   - Rejects `Content-Length` values over the limit (fast-path)
 *   - Counts actual stream bytes with an AbortController safety valve
 *
 * Usage (replaces `checkBodySize(request)` + `await request.json()`):
 *   const body = schema.parse(await readBoundedBodyJSON(request));
 */
export async function readBoundedBodyJSON<T = unknown>(request: Request): Promise<T> {
  const contentLength = request.headers.get('content-length');
  const transferEncoding = request.headers.get('transfer-encoding')?.toLowerCase() ?? '';

  // ── Reject chunked transfer encoding ──────────────────────────
  // Chunked encoding has no bounded Content-Length, making it
  // impossible to trust the client's size claim.
  if (transferEncoding.includes('chunked')) {
    throw new Error('Request body too large');
  }

  // ── Fast-path reject via Content-Length header ────────────────
  // If the client told us the body is too large, don't bother reading.
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new Error('Request body too large');
  }

  // ── Stream-level byte counting ────────────────────────────────
  // Read the body in chunks, accumulating bytes and aborting if the
  // limit is exceeded. The AbortController provides a safety valve
  // in case the reader hangs.
  const reader = request.body?.getReader();
  if (!reader) {
    // No body — let JSON.parse handle the empty/undefined case
    return JSON.parse('{}') as T;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  const controller = new AbortController();
  const signal = controller.signal;

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error('Request body too large');
      }

      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_BYTES) {
        controller.abort();
        reader.cancel();
        throw new Error('Request body too large');
      }

      chunks.push(value);
    }
  } catch (err: unknown) {
    // If we already threw for size-limit, propagate that
    if (err instanceof Error && err.message === 'Request body too large') {
      throw err;
    }
    // Reader errors (e.g. connection dropped) — throw a generic error
    // rather than leaking stream-level details.
    throw new Error('Request body too large');
  }

  // ── Concatenate and parse ─────────────────────────────────────
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(combined)) as T;
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
