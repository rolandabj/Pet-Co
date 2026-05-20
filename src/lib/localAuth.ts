import { AppUser, UserRole, GoogleAccount } from './types';

const USERS_KEY = 'paws_users';
const SESSION_KEY = 'paws_session';
const GOOGLE_ACCOUNTS_KEY = 'paws_google_accounts';

class LocalAuth {
  private users: (AppUser & { password?: string })[] = [];
  private session: AppUser | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
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

  register(email: string, password: string, name: string, role: UserRole): { user?: AppUser; error?: string } {
    const existing = this.users.find(u => u.email === email);
    if (existing) return { error: 'An account with this email already exists.' };

    const user: AppUser & { password: string } = {
      id: 'user_' + Date.now(),
      email,
      password,
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

  login(email: string, password: string): { user?: AppUser; error?: string } {
    const user = this.users.find(u => u.email === email && u.password === password);
    if (!user) return { error: 'Invalid email or password.' };
    const { password: _, ...safeUser } = user;
    this.saveSession(safeUser as AppUser);
    return { user: safeUser as AppUser };
  }

  googleLogin(email: string, name: string, photoURL?: string | null): { user?: AppUser; error?: string } {
    let user = this.users.find(u => u.email === email);
    if (!user) {
      const newUser: AppUser = {
        id: 'google_' + Date.now(),
        email,
        name,
        role: 'owner',
        photoURL: photoURL || null,
        createdAt: new Date().toISOString(),
        authMethod: 'google',
      };
      this.users.push(newUser);
      this.save();
      this.saveSession(newUser);
      return { user: newUser };
    }
    user.name = name;
    user.photoURL = photoURL || user.photoURL;
    user.authMethod = 'google';
    this.save();
    const { password: _, ...safeUser } = user;
    this.saveSession(safeUser as AppUser);
    return { user: safeUser as AppUser };
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

  // Google account management
  getSavedGoogleAccounts(): GoogleAccount[] {
    return JSON.parse(localStorage.getItem(GOOGLE_ACCOUNTS_KEY) || '[]');
  }

  saveGoogleAccount(email: string, name: string) {
    const accounts = this.getSavedGoogleAccounts();
    if (!accounts.find(a => a.email === email)) {
      accounts.push({ email, name, addedAt: new Date().toISOString() });
      localStorage.setItem(GOOGLE_ACCOUNTS_KEY, JSON.stringify(accounts));
    }
  }
}

export const localAuth = new LocalAuth();
