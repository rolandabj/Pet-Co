export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccessToken } from '@/lib/firestore-admin-rest';
import { requireAdmin } from '@/lib/server-auth';
import { readBoundedBodyJSON, batchFeeCollectSchema } from '@/lib/validation';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * POST /api/admin/payments/batch-fee-collect
 * Body: { paymentIds: string[], collected: boolean }
 *
 * Uses the Admin REST API (OAuth2 service account) to batch-update
 * the feeCollected field on multiple payment documents at once.
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate and verify admin role (crypto-verified via Firebase ID token + Firestore role check)
    await requireAdmin(request);

    const { paymentIds, collected } = batchFeeCollectSchema.parse(await readBoundedBodyJSON(request));

    // Use the shared getAccessToken() from firestore-admin-rest (cached + auto-refreshed)
    const bearer = await getAccessToken();

    // Update each payment individually with a PATCH request.
    // Using individual PATCHes instead of a batch commit avoids
    // Firestore commit API formatting issues and is simpler to debug.
    let updatedCount = 0;
    for (const id of paymentIds) {
      const docUrl = `${FIRESTORE_BASE}/payments/${encodeURIComponent(id)}?updateMask.fieldPaths=feeCollected`;
      const res = await fetch(docUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: { feeCollected: { booleanValue: collected } },
        }),
      });
      if (!res.ok) {
        if (process.env.NODE_ENV === 'development') {
          const body = await res.text().catch(() => '');
          console.error(`Failed to update payment ${id}: ${res.status} ${body}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      total: paymentIds.length,
    });
  } catch (error: any) {
    // Auth/forbidden errors from requireAdmin or requireFirebaseUser
    if (error.message === 'Missing Authorization Bearer token' || error.message === 'Admin access required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    // Validation errors
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('Batch fee collect API failed:', error?.message);
    }
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
