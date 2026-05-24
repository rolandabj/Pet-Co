/**
 * Firebase Admin SDK initializer.
 *
 * Server-only module — never import this from client components.
 * Uses service-account credentials via environment variables.
 */
import type { ServiceAccount } from 'firebase-admin';
import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';

// Lazy imports so this module can be required without throwing when
// the Admin SDK is not installed (e.g. in test environments).
let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;

function getCredentials(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    // Private keys from env vars often arrive with literal \n sequences
    // that need to be converted to actual newlines.
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

/**
 * Get or initialise the Firebase Admin app.
 * Returns null when credentials are missing (safe to call before they are set).
 */
export function getAdminApp() {
  if (cachedApp) return cachedApp;

  const credentials = getCredentials();
  if (!credentials) return null;

  // Dynamic import keeps the module from crashing at module-graph time
  // when firebase-admin is absent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin');

  if (admin.apps.length === 0) {
    cachedApp = admin.initializeApp({ credential: admin.credential.cert(credentials) });
  } else {
    cachedApp = admin.app();
  }
  return cachedApp;
}

/**
 * Get the Firebase Admin Auth instance.
 * Returns null when credentials are missing.
 */
export function getAdminAuth() {
  if (cachedAuth) return cachedAuth;

  const app = getAdminApp();
  if (!app) {
    cachedAuth = null;
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin');
  cachedAuth = admin.auth();
  return cachedAuth;
}
