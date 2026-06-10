/**
 * Session expiration enforcement.
 *
 * Firebase Auth ID tokens are short-lived (~1 hour) and auto-refreshed by the
 * Firebase SDK.  However, the underlying refresh token is long-lived — this
 * module provides a secondary boundary by enforcing a **maximum absolute
 * session age** (30 days by default).  After that threshold, the user is
 * forced to re-authenticate.
 *
 * A session‑metadata bag (`paws_session_meta` in localStorage) tracks when
 * the session was first established and when it was last verified.
 */

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days
const SESSION_META_KEY = 'paws_session_meta';

interface SessionMeta {
  /** ISO timestamp of when the session was first established (login / register). */
  createdAt: string;
  /** ISO timestamp of the most recent freshness check. */
  lastVerifiedAt: string;
}

/* ---------- helpers ---------- */

function readMeta(): SessionMeta | null {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SessionMeta) {
  localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
}

function clearMeta() {
  localStorage.removeItem(SESSION_META_KEY);
}

/* ---------- public API ---------- */

/**
 * Persist session metadata **after** a successful login / register.
 *
 * @param createdAt — optional ISO timestamp to backdate the session
 *   (e.g. the Firebase `metadata.creationTime`).  Defaults to now.
 */
export function recordSessionStart(createdAt?: string) {
  const now = new Date().toISOString();
  writeMeta({
    createdAt: createdAt ?? now,
    lastVerifiedAt: now,
  });
}

/** Remove session metadata (called on logout). */
export function clearSessionMeta() {
  clearMeta();
}

/**
 * Check whether the persisted session has exceeded the maximum age.
 * Returns `true` if the session is still fresh, `false` if expired or absent.
 */
export function isSessionFresh(): boolean {
  const meta = readMeta();
  if (!meta) return false;
  return Date.now() - new Date(meta.createdAt).getTime() < SESSION_MAX_AGE_MS;
}

/**
 * Enforce the session max-age:
 *  - If no metadata exists → expired (early session from before this module).
 *  - If the session is older than `SESSION_MAX_AGE_MS` → metadata is cleared.
 *
 * Call this once on app initialisation (inside the `onAuthStateChanged`
 * handler).  The caller is responsible for signing the user out when this
 * returns `true`.
 *
 * @returns `true` if the session has expired and should be terminated.
 */
export function enforceSessionExpiry(): boolean {
  const meta = readMeta();

  // No metadata — this is either a brand-new session yet to be recorded, or
  // a pre-existing session from before this module was deployed.  Treat as
  // expired to force re-login.
  if (!meta) return true;

  const age = Date.now() - new Date(meta.createdAt).getTime();

  if (age >= SESSION_MAX_AGE_MS) {
    clearMeta();
    return true;
  }

  // Update verification timestamp so subsequent checks know it's fresh.
  writeMeta({ ...meta, lastVerifiedAt: new Date().toISOString() });
  return false;
}

/**
 * Force-refresh the Firebase ID token by calling `getIdToken(true)`.
 *
 * This is useful on app startup to ensure the cached token hasn't been
 * revoked (e.g. by the admin panel's "Delete User" action).  If the call
 * fails the token is stale/revoked and the caller should sign out.
 *
 * Returns `true` if the token was refreshed successfully, `false` otherwise.
 */
export async function forceTokenRefresh(
  firebaseUser: { getIdToken(forceRefresh: boolean): Promise<string> } | null,
): Promise<boolean> {
  if (!firebaseUser) return false;
  try {
    await firebaseUser.getIdToken(true);
    return true;
  } catch {
    return false;
  }
}
