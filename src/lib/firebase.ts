import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// 1. Safe Configuration Loader
function getConfig() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // Check critical core keys
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    // Only warn once in the console, avoiding noisy loops
    if (typeof window !== 'undefined' && !(window as any).__firebase_warned__) {
      console.warn(
        "⚠️ Firebase environment variables are missing or still loading.\n" +
        "App will degrade gracefully and rely on localAuth / fallback data layers."
      );
      (window as any).__firebase_warned__ = true;
    }
    return null;
  }

  return config;
}

// 2. Singleton Initialization with Graceful Safety Checks
let app: FirebaseApp | null = null;

export function initFirebase(): FirebaseApp | null {
  const config = getConfig();
  if (!config) return null; // Gracefully degrade without crashing

  if (getApps().length === 0) {
    app = initializeApp(config);
  } else {
    app = getApp();
  }
  return app;
}

// 3. Upgraded Lazy Loaders (Preserving your existing architecture)
export function getFirebaseAuth() {
  const firebaseApp = initFirebase();

  if (!firebaseApp) {
    // Return null so the destructuring safely fails or can be guarded,
    // or return a wrapped null object structure
    return { auth: null, googleProvider: null };
  }

  const authInstance = getAuth(firebaseApp);

  // Return the exact object structure your AuthContext expects!
  return {
    auth: authInstance,
    googleProvider: googleProvider,
  };
}

export function getFirestoreDb(): Firestore | null {
  const firebaseApp = initFirebase();
  if (!firebaseApp) return null;
  return getFirestore(firebaseApp);
}

export function getStorageDb(): FirebaseStorage | null {
  const firebaseApp = initFirebase();
  if (!firebaseApp) return null;
  return getStorage(firebaseApp);
}

// 4. Re-export Firebase Auth helpers for email/password (F3)
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  firebaseUpdateProfile as updateFirebaseProfile,
};

// 5. Export Auth Providers safely
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

