import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

function getConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '';
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';

  const missing = [];
  if (!apiKey) missing.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!authDomain) missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!projectId) missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (missing.length > 0) {
    console.error(
      `Firebase: Missing required env vars: ${missing.join(', ')}.\n` +
      'Open .env.local in the project root and fill in the values. See .env.local.example for reference.'
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let googleProvider: GoogleAuthProvider | undefined;

export function initFirebase() {
  if (!getApps().length) {
    app = initializeApp(getConfig());
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();

  // Use the registered OAuth client ID if provided in env
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  googleProvider.setCustomParameters({
    ...(clientId ? { client_id: clientId } : {}),
    prompt: 'select_account',
  });

  return { auth, db, googleProvider };
}

export function getFirebaseAuth() {
  if (!auth || !db) {
    const result = initFirebase();
    auth = result.auth;
    db = result.db;
    googleProvider = result.googleProvider;
  }
  return { auth: auth!, db: db!, googleProvider: googleProvider! };
}

export function getFirestoreDb() {
  if (!db) {
    initFirebase();
  }
  return db!;
}

