'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppUser, UserRole } from '@/lib/types';
import { localAuth } from '@/lib/localAuth';
import { getFirebaseAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateFirebaseProfile } from '@/lib/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { updateUserDocRest } from '@/lib/firestore-rest';

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
  isInitialized: boolean;
  firebaseUser: FirebaseUser | null;
  /** Canonical user ID for Firestore-backed documents (pets, favorites, reviews, payments).
   *  Prefers Firebase Auth UID; falls back to user.id only when Firebase is unavailable.
   *  Never equals a localAuth-generated `user_` timestamp ID when Firebase is configured. */
  effectiveUserId: string | null;
  login: (email: string, password: string) => Promise<{ user?: AppUser; error?: string }>;
  register: (email: string, password: string, name: string, role: UserRole) => Promise<{ user?: AppUser; error?: string }>;
  googleLogin: (role?: UserRole) => Promise<{ success: boolean; error: string | null }>;
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Listen for Firebase auth state changes (persists across page reloads)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initUser = async (appUser: AppUser) => {
      // Set the user immediately so the UI doesn't redirect to /login
      // while we wait for the Firestore enhancement below.
      setUser(appUser);

      // Fetch Firestore user doc to merge custom fields, with a timeout
      // so it can't hang if Firestore is unreachable.
      try {
        const db = getFirestoreDb();
        if (!db) {
          setLoading(false);
          return;
        }
        const userSnap = await timeout(
          getDoc(doc(db, 'users', appUser.id)),
          4000,
          'Firestore getDoc'
        );
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUser({
            ...appUser,
            role: data.role || appUser.role,
            name: data.name || appUser.name,
            phone: data.phone,
            location: data.location,
          });
        }
      } catch {
        /* Firestore may not be available — proceed with local data */
      }

      // Only mark loading complete AFTER the Firestore role fetch has
      // resolved — otherwise the dashboard page will see the default
      // 'owner' role and briefly flash the wrong layout.
      setLoading(false);
    };

    try {
      const { auth } = getFirebaseAuth();
      if (!auth) {
        setIsInitialized(true);
        setLoading(false);
        return;
      }
      unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        // Mark initialization complete as soon as Firebase Auth reports
        // the user's identity — even before the Firestore doc fetch below.
        // This lets downstream components (e.g. Dashboard) safely dispatch
        // network requests with a valid token.
        setIsInitialized(true);
        if (fbUser) {
          setFirebaseUser(fbUser);
          // Determine the auth method from Firebase provider data (F3)
          const authMethod = fbUser.providerData?.some(p => p?.providerId === 'google.com')
            ? 'google'
            : 'email';
          const appUser = localAuth.setSessionFromFirebase({
            uid: fbUser.uid,
            email: fbUser.email || '',
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            photoURL: fbUser.photoURL,
          }, undefined, authMethod);
          initUser(appUser);
        } else {
          // No Firebase user — clear firebaseUser so effectiveUserId doesn't
          // return a stale Firebase UID from a previous session.
          setFirebaseUser(null);

          const local = localAuth.getCurrentUser();

          // Google sign-in ALWAYS goes through Firebase Auth. If Firebase
          // says no user but localAuth has a Google session, the Firebase
          // Auth account was deleted/revoked — the session is stale.
          if (local && local.authMethod === 'google') {
            localAuth.logout();
            setUser(null);
            setLoading(false);
          } else if (local) {
            // Fall back to localAuth session (email/password that may have
            // originated from pure localAuth or Firebase — can't distinguish)
            initUser(local);
          } else {
            setUser(null);
            setLoading(false);
          }
        }
      });
    } catch {
      // Firebase not configured — fall back to local auth
      setIsInitialized(true);
      const local = localAuth.getCurrentUser();
      if (local) setUser(local);
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // 1) Try Firebase Auth first — persists across devices (F3)
    try {
      const { auth } = getFirebaseAuth();
      if (auth) {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged listener will fire synchronously and set the user,
        // but we build the AppUser here for the return value.
        const appUser: AppUser = {
          id: credential.user.uid,
          email: credential.user.email || email,
          name: credential.user.displayName || email.split('@')[0],
          role: 'owner',
          photoURL: credential.user.photoURL || null,
          createdAt: credential.user.metadata.creationTime || new Date().toISOString(),
          authMethod: 'email',
        };
        setUser(appUser);
        setFirebaseUser(credential.user);
        setLoading(false);
        return { user: appUser };
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      // If Firebase is configured but login failed, return the error.
      // Only fall through to localAuth when Firebase is completely unavailable.
      if (fbErr.code) {
        const msg =
          fbErr.code === 'auth/user-not-found' ? 'No account found with this email.' :
          fbErr.code === 'auth/wrong-password' || fbErr.code === 'auth/invalid-credential' ? 'Invalid email or password.' :
          fbErr.code === 'auth/invalid-email' ? 'Invalid email format.' :
          fbErr.code === 'auth/too-many-requests' ? 'Too many login attempts. Please try again later.' :
          'Login failed. Please try again.';
        setLoading(false);
        return { error: msg };
      }
      // No fbErr.code means Firebase configuration issue — fall through to localAuth
    }

    // 2) Fallback to localAuth for offline / preview modes (Firebase unavailable)
    const result = await localAuth.login(email, password);
    if (result.user) {
      setUser(result.user);
      setLoading(false);
    }
    return result;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, role: UserRole) => {
    // 1) Try Firebase Auth first — persists across devices (F3)
    try {
      const { auth } = getFirebaseAuth();
      if (auth) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateFirebaseProfile(credential.user, { displayName: name });
        const userId = credential.user.uid;
        const userEmail = credential.user.email || email;
        // onAuthStateChanged will fire synchronously and update state,
        // but we build the AppUser for the return + role persistence
        const appUser: AppUser = {
          id: userId,
          email: userEmail,
          name,
          role,
          photoURL: null,
          createdAt: new Date().toISOString(),
          authMethod: 'email',
        };
        setUser(appUser);
        setFirebaseUser(credential.user);
        setLoading(false);
        // Persist role to Firestore
        try {
          await updateUserDocRest(userId, { role, name });
          if (role === 'provider') {
            try {
              const { createProviderRest } = await import('@/lib/firestore-rest');
              await createProviderRest({
                email: userEmail,
                name,
                businessName: `${name.split(' ')[0]}'s Pet Business`,
                contactEmail: userEmail,
                type: 'walkers',
                category: 'Dog Walker',
                emoji: '🏪',
                desc: 'New pet service provider',
                location: '',
                documentId: userId,
              });
            } catch {
              // Non-critical — ProviderDashboard onboarding form is the fallback
            }
          }
        } catch {
          /* Firestore may not be available */
        }
        return { user: appUser };
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      // Return clear error messages for known Firebase Auth failures.
      // Only fall through to localAuth when Firebase is completely unavailable
      // (no fbErr.code).
      if (fbErr.code) {
        const msg =
          fbErr.code === 'auth/email-already-in-use' ? 'An account with this email already exists.' :
          fbErr.code === 'auth/weak-password' ? 'Password should be at least 6 characters.' :
          fbErr.code === 'auth/invalid-email' ? 'Invalid email format.' :
          fbErr.code === 'auth/operation-not-allowed' ? 'Email/password signup is not enabled. Contact support.' :
          'Registration failed. Please try again.';
        setLoading(false);
        return { error: msg };
      }
      // No fbErr.code means Firebase configuration issue — fall through to localAuth
    }

    // 2) Fallback to localAuth for offline / preview modes (Firebase unavailable)
    const result = await localAuth.register(email, password, name, role);
    if (result.user) {
      setUser(result.user);
      setLoading(false);
      try {
        // Persist role to Firestore users collection
        await updateUserDocRest(result.user.id, { role, name });
        // Auto-create a minimal provider doc for new provider registrations
        if (role === 'provider') {
          try {
            const { createProviderRest } = await import('@/lib/firestore-rest');
            await createProviderRest({
              email: result.user.email,
              name: result.user.name,
              businessName: `${name.split(' ')[0]}'s Pet Business`,
              contactEmail: result.user.email,
              type: 'walkers',
              category: 'Dog Walker',
              emoji: '🏪',
              desc: 'New pet service provider',
              location: '',
              documentId: result.user.id,
            });
          } catch {
            // Non-critical — ProviderDashboard onboarding form is the fallback
          }
        }
      } catch {
        /* Firestore may not be available — local data is sufficient */
      }
    }
    return result;
  }, []);

  const googleLogin = useCallback(async (role?: UserRole) => {
    try {
      const { auth, googleProvider } = getFirebaseAuth();

      // 1. Guard: Firebase configuration missing entirely
      if (!auth || !googleProvider) {
        return { success: false, error: 'Google Auth configuration is missing.' };
      }

      // ── Try to load the user's existing role from Firestore ─────
      // This must run BEFORE any routing/creation decisions so that
      // returning users never see a role-selection screen and their
      // role is never overwritten.
      const getExistingRole = async (uid: string): Promise<UserRole | null> => {
        try {
          const db = getFirestoreDb();
          if (!db) return null;
          const snap = await timeout(
            getDoc(doc(db, 'users', uid)),
            4000,
            'Firestore getDoc (googleLogin)'
          );
          if (snap.exists()) {
            const data = snap.data();
            return (data.role as UserRole) ?? null;
          }
        } catch {
          /* Firestore may be unreachable — caller handles null */
        }
        return null;
      };

      // Helper to build AppUser from Firebase credential with a resolved role
      const buildAppUser = (credential: FirebaseUser, resolvedRole: UserRole) => {
        const appUser = localAuth.setSessionFromFirebase({
          uid: credential.uid,
          email: credential.email || '',
          name: credential.displayName || credential.email?.split('@')[0] || 'User',
          photoURL: credential.photoURL,
        }, resolvedRole);
        return appUser;
      };

      // Persist a NEW user's role to Firestore (only called for first-time users)
      const persistNewUser = async (appUser: AppUser) => {
        try {
          await updateUserDocRest(appUser.id, { role: appUser.role, name: appUser.name });
          // Auto-create a minimal provider doc for new provider registrations
          if (appUser.role === 'provider') {
            try {
              const { createProviderRest } = await import('@/lib/firestore-rest');
              await createProviderRest({
                email: appUser.email,
                name: appUser.name,
                businessName: `${appUser.name.split(' ')[0]}'s Pet Business`,
                contactEmail: appUser.email,
                type: 'walkers',
                category: 'Dog Walker',
                emoji: '🏪',
                desc: 'New pet service provider',
                location: '',
                documentId: appUser.id,
              });
            } catch {
              // Non-critical — ProviderDashboard onboarding form is the fallback
            }
          }
        } catch {
          /* Firestore may not be available */
        }
      };

      // ── Common handler for popup & redirect results ──────────────
      const handleCredential = async (credential: FirebaseUser) => {
        // 1) Check Firestore for an existing, immutable role
        const existingRole = await getExistingRole(credential.uid);

        // 2) Scenario A (Returning User): role exists in Firestore → freeze it
        //    Scenario B (Brand New User): no role yet → use the caller-supplied role
        const resolvedRole = existingRole ?? role ?? 'owner';

        const appUser = buildAppUser(credential, resolvedRole);
        setFirebaseUser(credential);

        // 3) CRITICAL: For NEW users, MUST await the Firestore doc creation
        //    BEFORE setting user state and completing loading. This prevents
        //    the dashboard from rendering before the user's role is persisted
        //    — avoiding a brief flash of the wrong layout.
        if (!existingRole) {
          await persistNewUser(appUser);
        }

        // 4) NOW it's safe to set the user — the Firestore doc is committed
        setUser(appUser);
        setLoading(false);

        return { success: true, error: null };
      };

      // Handle redirect result first (if we came back from a redirect)
      try {
        const redirectResult = await timeout(
          getRedirectResult(auth),
          5000,
          'getRedirectResult'
        );
        if (redirectResult?.user) {
          return handleCredential(redirectResult.user);
        }
      } catch {
        // No pending redirect result — ignore
      }

      // Try popup with a timeout — 60s to allow for 2FA, password entry,
      // and any account-creation flows on the Google side.
      const popupResult = await timeout(
        signInWithPopup(auth, googleProvider),
        60000,
        'signInWithPopup'
      );
      return handleCredential(popupResult.user);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      const domain = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
      const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

      // 3. CANCELLATION PATH: user closed the popup — not really an error
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return { success: false, error: 'cancelled' };
      }
      // Popup blocked — try redirect instead
      if (error.code === 'auth/popup-blocked') {
        try {
          const { auth, googleProvider } = getFirebaseAuth();
          if (auth && googleProvider) {
            await signInWithRedirect(auth, googleProvider);
          }
          return { success: false, error: 'redirecting' };
        } catch {
          return { success: false, error: 'Sign-in redirected. Please try again after the page reloads.' };
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
        console.warn(msg);
        return { success: false, error: msg };
      }
      // Unauthorized domain — tell the user exactly what to whitelist
      if (error.code === 'auth/unauthorized-domain') {
        const msg =
          `⚠️ This domain (${domain}) is not authorized for Google sign-in. ` +
          `Please add "${origin}" to the Authorized Domains list ` +
          `in your Firebase Console (Authentication → Settings).`;
        console.warn(msg);
        return { success: false, error: msg };
      }
      // Operation not supported in this environment
      if (error.code === 'auth/operation-not-supported-in-this-environment') {
        return { success: false, error: 'Google sign-in is not available in this preview environment. Please use email/password login instead.' };
      }
      // OAuth code exchange failure — typically a Firebase Console / Google Cloud
      // Console OAuth client ID or redirect URI mismatch. Try redirect as fallback
      // since it uses a different redirect URI flow (`__/auth/handler`).
      if (error.code === 'auth/invalid-credential' && error.message?.includes('CODE_EXCHANGE')) {
        console.warn('Google OAuth code exchange failed — attempting redirect fallback:', error.message);
        try {
          const { auth, googleProvider } = getFirebaseAuth();
          if (auth && googleProvider) {
            await signInWithRedirect(auth, googleProvider);
          }
          return { success: false, error: 'redirecting' };
        } catch {
          const msg =
            `⚠️ Google sign-in configuration error. ` +
            `The OAuth code exchange with Google failed. ` +
            `This usually means the Firebase project's Web client ID ` +
            `doesn't match the Google Cloud Console OAuth client. ` +
            `Please verify in the Firebase Console (Authentication → Sign-in method → Google) ` +
            `that the "Web client ID" is correct, or use email/password login instead.`;
          console.warn(msg);
          return { success: false, error: msg };
        }
      }
      // 4. GENERAL FAILURE PATH: Return the error message safely
      console.error('Google login interaction failed:', err);
      return { success: false, error: error.message || 'An unknown authentication error occurred.' };
    }
  }, []);

  const logout = useCallback(async () => {
    // 1. Clear local session FIRST — before Firebase sign-out — so that if
    //    onAuthStateChanged fires during signOut(), it finds no local session
    //    and goes straight to the setUser(null) code path.
    localAuth.logout();

    try {
      const { auth } = getFirebaseAuth();
      if (auth) {
        await firebaseSignOut(auth);
      }
    } catch { /* ignore */ }

    // 2. Wipe React state so the UI re-renders to unauthenticated immediately.
    setUser(null);
    setFirebaseUser(null);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<AppUser>) => {
    const result = localAuth.updateProfile(updates);
    if (result.user) setUser(result.user);

    // Also save name/phone/location to Firestore so they survive a refresh
    const uid = firebaseUser?.uid || result.user?.id;
    if (uid && (updates.name !== undefined || updates.phone !== undefined || updates.location !== undefined)) {
      try {
        const firestoreUpdates: Record<string, string> = {};
        if (updates.name !== undefined) firestoreUpdates.name = updates.name;
        if (updates.phone !== undefined) firestoreUpdates.phone = updates.phone;
        if (updates.location !== undefined) firestoreUpdates.location = updates.location;
        await updateUserDocRest(uid, firestoreUpdates);
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
    <AuthContext.Provider value={{
      user, loading, isInitialized, firebaseUser,
      login, register, googleLogin, logout, updateProfile, requireAuth,
      // Canonical ID: always prefer Firebase Auth UID for Firestore-backed data.
      // When Firebase is available, effectiveUserId MUST equal fbUser.uid.
      // When Firebase is unavailable, fall back to the localAuth user id.
      effectiveUserId: firebaseUser?.uid ?? user?.id ?? null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
