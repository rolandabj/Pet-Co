import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/auth/delete-user
 * DELETE /api/auth/delete-user
 *
 * Securely deletes a Firebase Authentication user record via the Admin SDK.
 *
 * Request body (JSON):
 *   { uid: string; requesterUid: string; requesterRole?: string }
 *
 * - Users can delete their own account (requesterUid === uid).
 * - Admins can delete any account.
 * - All other requests are rejected.
 */
async function handleDeleteUser(req: NextRequest) {
  let uid: string | undefined;

  try {
    const body = await req.json();
    uid = body.uid;
    const { requesterUid, requesterRole } = body;

    // --- Validate required fields ---
    if (!uid || !requesterUid) {
      return NextResponse.json(
        { error: 'Missing required fields: uid, requesterUid' },
        { status: 400 },
      );
    }

    // --- Authorization: only self-deletion or admin ---
    const isSelf = requesterUid === uid;
    const isAdmin = requesterRole === 'admin';

    if (!isSelf && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: you can only delete your own account unless you are an admin.' },
        { status: 403 },
      );
    }

    // --- Perform the deletion via Admin SDK ---
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin SDK is not configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to your environment.' },
        { status: 500 },
      );
    }

    await auth.deleteUser(uid);

    return NextResponse.json({ success: true, uid });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    console.error('Admin deleteUser failed:', error);

    // Handle "user not found" gracefully — idempotent deletion
    if (error.code === 'auth/user-not-found') {
      return NextResponse.json({ success: true, uid, note: 'User not found in Auth (already deleted)' });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to delete Firebase Auth user.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return handleDeleteUser(req);
}

export async function DELETE(req: NextRequest) {
  return handleDeleteUser(req);
}
