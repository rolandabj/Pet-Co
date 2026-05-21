import { AppUser, UserRole } from './types';

const USERS_KEY = 'paws_users';
const SESSION_KEY = 'paws_session';

/**
 * Hash a password using the Web Crypto API (SHA-256).
 * Returns a hex-encoded hash string.
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Local email/password auth fallback used when Firebase is not configured.
 * Real Google auth goes through Firebase Auth directly (firebase.ts).
 * In production with Firebase configured, email/password should also use
 * Firebase Auth — this module exists as a dev-friendly fallback.
 *
 * Passwords are hashed with SHA-256 via the Web Crypto API before storage.
 */
class LocalAuth {
  private users: (AppUser & { password?: string })[] = [];
  private session: AppUser | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
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
    localStorage.setItem(USERS_KEY, JSON.stringify(this.users));
  }

  private saveSession(user: AppUser) {
    this.session = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  clearSession() {
    this.session = null;
    localStorage.removeItem(SESSION_KEY);
  }

  getCurrentUser(): AppUser | null {
    return this.session;
  }

  isLoggedIn(): boolean {
    return !!this.session;
  }

  async register(email: string, password: string, name: string, role: UserRole): Promise<{ user?: AppUser; error?: string }> {
    const existing = this.users.find(u => u.email === email);
    if (existing) return { error: 'An account with this email already exists.' };

    const hashedPassword = await hashPassword(password);
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
    const hashedPassword = await hashPassword(password);
    const user = this.users.find(u => u.email === email && u.password === hashedPassword);
    if (!user) return { error: 'Invalid email or password.' };
    const { password: _, ...safeUser } = user;
    this.saveSession(safeUser as AppUser);
    return { user: safeUser as AppUser };
  }

  /** Store a user returned from real Firebase Google auth into local session. */
  setSessionFromFirebase(
    firebaseUser: { email: string; name: string; photoURL?: string | null; uid?: string },
    role?: UserRole,
  ): AppUser {
    const now = new Date().toISOString();
    const id = firebaseUser.uid || 'google_' + Date.now();
    const appUser: AppUser = {
      id,
      email: firebaseUser.email,
      name: firebaseUser.name,
      role: role || 'owner',
      photoURL: firebaseUser.photoURL || null,
      createdAt: now,
      authMethod: 'google',
    };

    // Persist to the local user store so the admin panel sees them
    const idx = this.users.findIndex(u => u.email === firebaseUser.email);
    if (idx >= 0) {
      this.users[idx] = { ...this.users[idx], ...appUser };
    } else {
      this.users.push(appUser);
    }
    this.save();
    this.saveSession(appUser);
    return appUser;
  }

  logout() {
    this.clearSession();
  }

  updateProfile(updates: Partial<AppUser>): { user?: AppUser; error?: string } {
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
    return this.users.map(({ password, ...u }) => u as AppUser);
  }

  deleteUser(userId: string) {
    this.users = this.users.filter(u => u.id !== userId);
    this.save();
  }
}

export const localAuth = new LocalAuth();
