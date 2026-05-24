import { getAdminAuth } from './firebase-admin';

export async function requireFirebaseUser(request: Request) {
  const authHeader = request.headers.get('authorization') || '';

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization Bearer token');
  }

  const token = authHeader.slice('Bearer '.length);
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    throw new Error('Firebase Admin Auth is not initialized (missing credentials)');
  }

  const decoded = await adminAuth.verifyIdToken(token);

  return decoded;
}
