'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppUser, UserRole } from '@/lib/types';
import { localAuth } from '@/lib/localAuth';
import { getFirebaseAuth } from '@/lib/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';

/** Promise that rejects after `ms` milliseconds — prevents Firestore SDK hangs. */
function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let id: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, reject) => {
    id = setTimeout(() => reject(new Error(`⏱ ${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(id!));
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  firebaseUser: FirebaseUser | null;
  login: (email: string, password: string) => Promise<{ user?: AppUser; error?: string }>;
  register: (email: string, password: string, name: string, role: UserRole) => Promise<{ user?: AppUser; error?: string }>;
  googleLogin: () => Promise<{ user?: AppUser; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<AppUser>) => Promise<{ user?: AppUser; error?: string }>;
  requireAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function firebaseToAppUser(fbUser: FirebaseUser): AppUser {
  return {
    id: fbUser.uid,
    email: fbUser.email || '',
    name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
    role: 'owner',
    photoURL: fbUser.photoURL,
    createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
    authMethod: 'google',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for Firebase auth state changes (persists across page reloads)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initUser = async (appUser: AppUser) => {
      // Fetch Firestore user doc to merge custom fields, with a timeout
      // so it can't hang if Firestore is unreachable.
      try {
        const db = getFirestoreDb();
        const userSnap = await timeout(
          getDoc(doc(db, 'users', appUser.id)),
          4000,
          'Firestore getDoc'
        );
        if (userSnap.exists()) {
          const data = userSnap.data();
          appUser = { ...appUser, phone: data.phone, location: data.location };
        }
      } catch {
        /* Firestore may not be available — proceed with local data */
      }
      setUser(appUser);
    };

    try {
      const { auth } = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          setFirebaseUser(fbUser);
          const appUser = localAuth.setSessionFromFirebase({
            uid: fbUser.uid,
            email: fbUser.email || '',
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            photoURL: fbUser.photoURL,
          });
          initUser(appUser);
        } else {
          // Check local session as fallback
          const local = localAuth.getCurrentUser();
          if (local) {
            initUser(local);
          } else {
            setUser(null);
            setFirebaseUser(null);
          }
        }
        setLoading(false);
      });
    } catch {
      // Firebase not configured — fall back to local auth
      const local = localAuth.getCurrentUser();
      if (local) setUser(local);
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = localAuth.login(email, password);
    if (result.user) setUser(result.user);
    return result;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, role: UserRole) => {
    const result = localAuth.register(email, password, name, role);
    if (result.user) setUser(result.user);
    return result;
  }, []);

  const googleLogin = useCallback(async () => {
    try {
      const { auth, googleProvider } = getFirebaseAuth();

      // Handle redirect result first (if we came back from a redirect)
      try {
        const redirectResult = await timeout(
          getRedirectResult(auth),
          5000,
          'getRedirectResult'
        );
        if (redirectResult?.user) {
          const credential = redirectResult.user;
          const appUser = localAuth.setSessionFromFirebase({
            uid: credential.uid,
            email: credential.email || '',
            name: credential.displayName || credential.email?.split('@')[0] || 'User',
            photoURL: credential.photoURL,
          });
          setFirebaseUser(credential);
          setUser(appUser);
          return { user: appUser };
        }
      } catch {
        // No pending redirect result — ignore
      }

      // Try popup with a timeout so it can't hang if the OAuth popup
      // can't communicate back to this environment (e.g. unauthorized domain).
      const popupResult = await timeout(
        signInWithPopup(auth, googleProvider),
        15000,
        'signInWithPopup'
      );
      const credential = popupResult.user;
      const appUser = localAuth.setSessionFromFirebase({
        uid: credential.uid,
        email: credential.email || '',
        name: credential.displayName || credential.email?.split('@')[0] || 'User',
        photoURL: credential.photoURL,
      });
      setFirebaseUser(popupResult.user);
      setUser(appUser);
      return { user: appUser };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      const domain = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
      const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

      // User closed the popup — not really an error
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return { error: 'cancelled' };
      }
      // Popup blocked — try redirect instead
      if (error.code === 'auth/popup-blocked') {
        try {
          const { auth, googleProvider } = getFirebaseAuth();
          await signInWithRedirect(auth, googleProvider);
          return { error: 'redirecting' };
        } catch {
          return { error: 'Sign-in redirected. Please try again after the page reloads.' };
        }
      }
      // Popup timed out — the OAuth popup opened but never returned a result
      if (error.message?.includes('signInWithPopup timed out')) {
        const msg =
          `⏱ Google sign-in timed out after 15 seconds. ` +
          `This preview domain (${domain}) may not be authorized for Google sign-in. ` +
          `Please add "${origin}" to the Authorized Domains list ` +
          `in your Firebase Console (Authentication → Settings) ` +
          `or use email/password login instead.`;
        console.error(msg, error);
        return { error: msg };
      }
      // Unauthorized domain — tell the user exactly what to whitelist
      if (error.code === 'auth/unauthorized-domain') {
        const msg =
          `⚠️ This domain (${domain}) is not authorized for Google sign-in. ` +
          `Please add "${origin}" to the Authorized Domains list ` +
          `in your Firebase Console (Authentication → Settings).`;
        console.error(msg, error);
        return { error: msg };
      }
      // Operation not supported in this environment
      if (error.code === 'auth/operation-not-supported-in-this-environment') {
        return { error: 'Google sign-in is not available in this preview environment. Please use email/password login instead.' };
      }
      console.error('Google sign-in error:', error);
      return { error: error.message || 'Google sign-in failed. Please try again.' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const { auth } = getFirebaseAuth();
      await firebaseSignOut(auth);
    } catch { /* ignore */ }
    localAuth.logout();
    setUser(null);
    setFirebaseUser(null);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<AppUser>) => {
    const result = localAuth.updateProfile(updates);
    if (result.user) setUser(result.user);

    // Also save phone/location to Firestore users doc
    const uid = firebaseUser?.uid || result.user?.id;
    if (uid && (updates.phone !== undefined || updates.location !== undefined)) {
      try {
        const db = getFirestoreDb();
        const firestoreUpdates: Record<string, string | undefined> = {};
        if (updates.phone !== undefined) firestoreUpdates.phone = updates.phone;
        if (updates.location !== undefined) firestoreUpdates.location = updates.location;
        await setDoc(doc(db, 'users', uid), firestoreUpdates, { merge: true });
      } catch (err) {
        console.error('Failed to save profile to Firestore:', err);
      }
    }

    return result;
  }, [firebaseUser]);

  const requireAuth = useCallback(() => {
    if (!user) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return false;
    }
    return true;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, firebaseUser, login, register, googleLogin, logout, updateProfile, requireAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
