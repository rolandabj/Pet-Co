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

  try {
    const adminAuth = getAdminAuth();

    const decoded = await adminAuth.verifyIdToken(token);

    console.log('🐛 API TOKEN VERIFIED', {
      uid: decoded.uid,
      email: decoded.email,
      aud: decoded.aud,
      iss: decoded.iss,
    });

    return decoded;
  } catch (error: any) {
    console.error('🐛 API TOKEN VERIFY FAILED', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });

    throw error;
  }
}
