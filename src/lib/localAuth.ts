import bcrypt from 'bcryptjs';
import { AppUser, UserRole } from './types';

const USERS_KEY = 'paws_users';
const SESSION_KEY = 'paws_session';
const BCRYPT_SALT_ROUNDS = 12;

/**
 * ── Production guard ──────────────────────────────────────────────
 * In production, localStorage-based auth is NEVER used for login,
 * register, or credential persistence. Firebase Auth handles all
 * authentication. This module exists solely as a dev/preview fallback.
 *
 * Behaviour per environment:
 *
 *                    Development / Preview        Production
 *   register()       Hashes + saves to LS         Returns error
 *   login()          Checks hash in LS            Returns error
 *   setSessionFromFirebase()  Writes to LS        Returns AppUser (in-memory only)
 *   getAllUsers()    Returns stored users         Returns []
 *   save()/saveSession()  Writes to LS            No-op
 *   getCurrentUser() Reads from memory            Reads from memory
 *   logout()         Clears LS                    Clears LS
 *
 * ═══════════════════════════════════════════════════════════════════
 */

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Local email/password auth fallback used when Firebase is not configured.
 * Real Google auth goes through Firebase Auth directly (firebase.ts).
 * In production with Firebase configured, email/password should also use
 * Firebase Auth — this module exists as a dev-friendly fallback.
 *
 * Passwords are hashed with bcrypt (12 salt rounds) before storage.
 *
 * Note: Since the app is pre-launch with zero email/password users, there
 * is no migration needed from the previous PBKDF2 hashing scheme.
 */
class LocalAuth {
  private users: (AppUser & { password?: string })[] = [];
  private session: AppUser | null = null;

  constructor() {
    if (typeof window !== 'undefined' && !isProduction()) {
      try {
        this.users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      } catch {
        this.users = [];
        this.session = null;
      }
    }
  }

  private save() {
    if (isProduction()) return; // Never persist to localStorage in production
    localStorage.setItem(USERS_KEY, JSON.stringify(this.users));
  }

  private saveSession(user: AppUser) {
    if (isProduction()) return; // Never persist to localStorage in production
    this.session = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  clearSession() {
    this.session = null;
    if (!isProduction()) {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  getCurrentUser(): AppUser | null {
    return this.session;
  }

  isLoggedIn(): boolean {
    return !!this.session;
  }

  async register(email: string, password: string, name: string, role: UserRole): Promise<{ user?: AppUser; error?: string }> {
    if (isProduction()) {
      return { error: 'Local authentication is disabled in production.' };
    }
    const existing = this.users.find(u => u.email === email);
    if (existing) return { error: 'An account with this email already exists.' };

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user: AppUser & { password: string } = {
      id: 'user_' + Date.now(),
      email,
      password: hashedPassword,
      name,
      role,
      photoURL: null,
      createdAt: new Date().toISOString(),
      authMethod: 'email',
    };
    this.users.push(user);
    this.save();
    const { password: _, ...safeUser } = user;
    this.saveSession(safeUser as AppUser);
    return { user: safeUser as AppUser };
  }

  async login(email: string, password: string): Promise<{ user?: AppUser; error?: string }> {
    if (isProduction()) {
      return { error: 'Local authentication is disabled in production.' };
    }
    const user = this.users.find(u => u.email === email && u.password);
    if (!user || !user.password) return { error: 'Invalid email or password.' };
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return { error: 'Invalid email or password.' };
    const { password: _, ...safeUser } = user;
    this.saveSession(safeUser as AppUser);
    return { user: safeUser as AppUser };
  }

  /** Store a user returned from real Firebase auth into local session.
   *  The uid MUST be the Firebase Auth UID — never a generated fallback ID,
   *  because Firestore-backed documents (pets, favorites, reviews, payments)
   *  use this ID as the canonical owner key.
   *
   *  In production, the AppUser object is returned for in-memory React state
   *  but is NOT written to localStorage — preventing XSS exfiltration of
   *  Firebase user profiles from client-side storage. */
  setSessionFromFirebase(
    firebaseUser: { email: string; name: string; photoURL?: string | null; uid: string },
    role?: UserRole,
    authMethod: 'email' | 'google' = 'google',
  ): AppUser {
    const now = new Date().toISOString();
    const id = firebaseUser.uid;
    const appUser: AppUser = {
      id,
      email: firebaseUser.email,
      name: firebaseUser.name,
      role: role || 'owner',
      photoURL: firebaseUser.photoURL || null,
      createdAt: now,
      authMethod,
    };

    // Persist to the local user store so the admin panel sees them
    // (only in dev — production uses Firestore exclusively)
    if (!isProduction()) {
      const idx = this.users.findIndex(u => u.email === firebaseUser.email);
      if (idx >= 0) {
        this.users[idx] = { ...this.users[idx], ...appUser };
      } else {
        this.users.push(appUser);
      }
      this.save();
      this.saveSession(appUser);
    }

    // Always update the in-memory session so getCurrentUser() returns
    // the Firebase-authenticated user for React state continuity.
    this.session = appUser;
    return appUser;
  }

  logout() {
    this.clearSession();
  }

  updateProfile(updates: Partial<AppUser>): { user?: AppUser; error?: string } {
    if (isProduction()) {
      return { error: 'Profile updates are handled server-side in production.' };
    }
    if (!this.session) return { error: 'Not logged in' };
    const idx = this.users.findIndex(u => u.id === this.session!.id);
    if (idx === -1) return { error: 'User not found' };
    this.users[idx] = { ...this.users[idx], ...updates };
    this.save();
    const { password: _, ...safeUser } = this.users[idx];
    this.saveSession(safeUser as AppUser);
    return { user: safeUser as AppUser };
  }

  getAllUsers(): AppUser[] {
    if (isProduction()) return []; // No localStorage users to merge in production
    return this.users.map(({ password, ...u }) => u as AppUser);
  }

  deleteUser(userId: string) {
    if (isProduction()) return; // No localStorage user store to delete from in production
    this.users = this.users.filter(u => u.id !== userId);
    this.save();
  }
}

export const localAuth = new LocalAuth();
