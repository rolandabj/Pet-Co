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

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  firebaseUser: FirebaseUser | null;
  login: (email: string, password: string) => Promise<{ user?: AppUser; error?: string }>;
  register: (email: string, password: string, name: string, role: UserRole) => Promise<{ user?: AppUser; error?: string }>;
  googleLogin: () => Promise<{ user?: AppUser; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<AppUser>) => { user?: AppUser; error?: string };
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
          setUser(appUser);
        } else {
          // Check local session as fallback
          const local = localAuth.getCurrentUser();
          if (local) {
            setUser(local);
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
        const redirectResult = await getRedirectResult(auth);
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
        // Ignore redirect result errors
      }

      // Try popup first
      const result = await signInWithPopup(auth, googleProvider);
      const credential = result.user;
      const appUser = localAuth.setSessionFromFirebase({
        uid: credential.uid,
        email: credential.email || '',
        name: credential.displayName || credential.email?.split('@')[0] || 'User',
        photoURL: credential.photoURL,
      });
      setFirebaseUser(result.user);
      setUser(appUser);
      return { user: appUser };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
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

  const updateProfile = useCallback((updates: Partial<AppUser>) => {
    const result = localAuth.updateProfile(updates);
    if (result.user) setUser(result.user);
    return result;
  }, []);

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
