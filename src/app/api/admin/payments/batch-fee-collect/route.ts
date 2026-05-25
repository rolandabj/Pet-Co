export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { getDocRest, getAccessToken } from '@/lib/firestore-admin-rest';

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

    const { paymentIds, collected } = await request.json();

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return NextResponse.json({ error: 'paymentIds must be a non-empty array' }, { status: 400 });
    }

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
      if (res.ok) {
        updatedCount++;
      } else {
        const body = await res.text().catch(() => '');
        console.error(`Failed to update payment ${id}: ${res.status} ${body}`);
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      total: paymentIds.length,
    });
  } catch (error: any) {
    console.error('Batch fee collect API failed:', error?.message, error?.code);
    return NextResponse.json(
      { error: 'Failed to update payments', message: error?.message },
      { status: 500 },
    );
  }
}
