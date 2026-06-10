import { getAdminAuth } from './firebase-admin';
import { getDocRest } from './firestore-admin-rest';

export async function requireFirebaseUser(request: Request) {
  const authHeader = request.headers.get('authorization') || '';

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization Bearer token');
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Token verification failed:', error?.message);
    }
    throw error;
  }
}

/**
 * Authenticate the request and verify the caller has an admin role
 * in their Firestore user document.
 *
 * On success returns the decoded Firebase ID token.
 * On failure throws an Error with a user-facing message.
 */
export async function requireAdmin(request: Request) {
  const decoded = await requireFirebaseUser(request);

  const callerDoc = await getDocRest('users', decoded.uid);
  if (!callerDoc) {
    throw new Error('Admin access required');
  }

  // Handle both raw Firestore typed fields ({ stringValue: "admin" })
  // and plain JS objects ({ role: "admin" }).
  const role = callerDoc.role?.stringValue ?? callerDoc.role;
  if (role !== 'admin') {
    throw new Error('Admin access required');
  }

  return decoded;
}
