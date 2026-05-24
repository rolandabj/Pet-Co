import { getAdminAuth } from './firebase-admin';

export async function requireFirebaseUser(request: Request) {
  const authHeader = request.headers.get('authorization') || '';

  console.log('🐛 API AUTH HEADER DEBUG', {
    hasAuthHeader: Boolean(authHeader),
    startsWithBearer: authHeader.startsWith('Bearer '),
    headerStart: authHeader ? authHeader.slice(0, 20) : null,
  });

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization Bearer token');
  }

  const token = authHeader.slice('Bearer '.length);
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    const missing = [];
    if (!process.env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
    if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!process.env.FIREBASE_PRIVATE_KEY) missing.push('FIREBASE_PRIVATE_KEY');
    throw new Error(
      'Firebase Admin Auth is not initialized. Missing env vars: ' +
      (missing.length > 0 ? missing.join(', ') : 'all three') +
      '. Get credentials from Firebase Console → Project settings → Service accounts. ' +
      'Client project: ' + process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    );
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);

    console.log('🐛 API TOKEN VERIFIED', {
      uid: decoded.uid,
      email: decoded.email,
      aud: decoded.aud,
      iss: decoded.iss,
    });

    return decoded;
  } catch (error) {
    console.error('🐛 API TOKEN VERIFY FAILED', error);
    throw error;
  }
}
