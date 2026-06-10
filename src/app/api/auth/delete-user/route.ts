import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/server-auth';
import { readBoundedBodyJSON, deleteUserSchema } from '@/lib/validation';
import { checkRateLimit, clientIp, makeKey } from '@/lib/rate-limit';

/**
 * POST /api/auth/delete-user
 * DELETE /api/auth/delete-user
 *
 * Deletes a Firebase Authentication user record via the Admin SDK.
 * Admin-only — the caller's Firebase ID token + Firestore admin role
 * are verified by requireAdmin().
 *
 * Request body (JSON):
 *   { uid: string }
 */
async function handleDeleteUser(req: NextRequest) {
  let uid: string | undefined;

  try {
    // Inline rate limit (defence-in-depth; middleware also enforces this)
    const rl = checkRateLimit(makeKey('delete-user', clientIp(req)), {
      windowMs: 15 * 60 * 1000,
      maxRequests: 10,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later.' },
        { status: 429 },
      );
    }

    // Verify caller is an admin (crypto-verified via Firebase ID token + Firestore role check)
    await requireAdmin(req);

    const { uid: bodyUid } = deleteUserSchema.parse(await readBoundedBodyJSON(req));
    uid = bodyUid;

    // Perform the deletion via Admin SDK
    const adminAuth = getAdminAuth();
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ success: true, uid });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };

    // Auth/forbidden errors from requireAdmin or requireFirebaseUser
    if (error.message === 'Missing Authorization Bearer token' || error.message === 'Admin access required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Validation errors
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
    }

    // Handle "user not found" gracefully — idempotent deletion
    if (error.code === 'auth/user-not-found') {
      return NextResponse.json({ success: true, uid, note: 'User not found in Auth (already deleted)' });
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Admin deleteUser failed:', error?.message);
    }

    return NextResponse.json(
      { error: 'An internal server error occurred.' },
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
