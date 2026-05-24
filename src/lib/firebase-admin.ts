/**
 * Firebase Admin SDK initializer.
 *
 * Server-only module — never import this from client components.
 * Uses service-account credentials via environment variables.
 *
 * Lazily initialised so that module-level imports don't throw during
 * build time when env vars are absent (e.g. `next build` collecting
 * page data for static pages that happen to import this module).
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let cachedAuth: ReturnType<typeof getAuth> | null = null;
let cachedDb: ReturnType<typeof getFirestore> | null = null;

function ensureInitialized() {
  if (cachedAuth) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Strip surrounding double-quotes if present (some env setups add them)
  // then convert literal \n to actual newline characters.
  const privateKey = rawPrivateKey
    ?.replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');

  console.log('🐛 FIREBASE ADMIN ENV DEBUG', {
    hasProjectId: Boolean(projectId),
    projectId,
    hasClientEmail: Boolean(clientEmail),
    clientEmail,
    hasPrivateKey: Boolean(rawPrivateKey),
    privateKeyStartsCorrectly: rawPrivateKey?.includes('BEGIN PRIVATE KEY'),
  });

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin environment variables');
  }

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });

  cachedAuth = getAuth(app);
  cachedDb = getFirestore(app);
}

/** Get the Firebase Admin Auth instance (lazily initialised). */
export function getAdminAuth() {
  ensureInitialized();
  return cachedAuth!;
}

/** Get the Firebase Admin Firestore instance (lazily initialised). */
export function getAdminDb() {
  ensureInitialized();
  return cachedDb!;
}
