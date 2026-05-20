'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppUser, UserRole } from '@/lib/types';
import { localAuth } from '@/lib/localAuth';
import { getFirebaseAuth } from '@/lib/firebase';
import { signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user?: AppUser; error?: string }>;
  register: (email: string, password: string, name: string, role: UserRole) => Promise<{ user?: AppUser; error?: string }>;
  googleLogin: () => Promise<{ user?: AppUser; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<AppUser>) => { user?: AppUser; error?: string };
  requireAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const current = localAuth.getCurrentUser();
    setUser(current);
    setLoading(false);
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
    // Try Firebase first, fall back to local
    try {
      const { auth, googleProvider } = getFirebaseAuth();
      const result = await signInWithPopup(auth, googleProvider);
      const credential = result.user;
      const email = credential.email || 'user@gmail.com';
      const name = credential.displayName || email.split('@')[0];
      const photoURL = credential.photoURL;
      
      localAuth.saveGoogleAccount(email, name);
      const authResult = localAuth.googleLogin(email, name, photoURL);
      if (authResult.user) setUser(authResult.user);
      return authResult;
    } catch {
      // Fallback: show modal handled by component
      return { error: 'firebase_modal' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const { auth } = getFirebaseAuth();
      await firebaseSignOut(auth);
    } catch { /* ignore */ }
    localAuth.logout();
    setUser(null);
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
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, logout, updateProfile, requireAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
