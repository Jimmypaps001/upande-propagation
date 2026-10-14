import axios from 'axios';
import { storage, StorageKeys } from './storage';
import { probeBaseUrl } from './url';
import { humanText } from './user-message';

function extractError(data: any): string | null {
  if (data && typeof data === 'object') {
    const m = data.message ?? data.exception;
    if (typeof m === 'string') return m;
  }
  return null;
}

export interface LoginResult {
  baseUrl: string;
  userId: string;
  email: string;
  fullName: string | null;
}

/**
 * Sign in with the stock /api/method/login, then read the session back from
 * frappe.auth.get_logged_user. On mobile the login Set-Cookie header is
 * absorbed by the native cookie store, which sends it on the follow-up call --
 * so the follow-up answering as the user IS the proof the session took.
 *
 * Post Harvest reads a sid out of its own `auth.mobile_login` script. This app
 * has no server script of its own, so it keeps the native cookie and confirms
 * it, rather than inventing an endpoint to hand the same cookie back.
 */
export async function loginToServer(bareUrl: string, email: string, password: string): Promise<LoginResult> {
  const baseUrl = await probeBaseUrl(bareUrl);

  const login = await axios.post(
    `${baseUrl}/api/method/login`,
    { usr: email, pwd: password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true },
  );
  if (login.status === 401 || login.status === 403) {
    throw new Error('Invalid email or password.');
  }
  if (login.status < 200 || login.status >= 300) {
    throw new Error(humanText(extractError(login.data)) ?? 'Could not sign in. Try again.');
  }

  const cookie = readSessionCookie(login.headers?.['set-cookie']);
  const who = await axios.get(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    timeout: 15000,
    validateStatus: () => true,
  });
  const userId = (who.data as { message?: string } | null)?.message;
  if (who.status !== 200 || !userId || userId === 'Guest') {
    throw new Error('Signed in, but the server did not keep the session.');
  }

  await storage.set(StorageKeys.instanceUrl, baseUrl);
  await storage.set(StorageKeys.instanceUrlBackup, baseUrl);
  if (cookie) await storage.set(StorageKeys.cookie, cookie);
  await storage.set(StorageKeys.emailBackup, email);
  // Kept in the secure enclave so an expired session can be silently recovered.
  await storage.set(StorageKeys.passwordBackup, password);

  const fullName = (login.data as { full_name?: string } | null)?.full_name ?? null;
  if (fullName) await storage.set(StorageKeys.fullName, String(fullName));

  return { baseUrl, userId, email, fullName };
}

/** `sid=...` out of a Set-Cookie header, whatever else the server set with it. */
function readSessionCookie(setCookie: unknown): string | null {
  const all = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
  for (const line of all) {
    const m = /(?:^|;\s*)sid=([^;]+)/i.exec(String(line));
    if (m && m[1] && m[1] !== 'Guest') return `sid=${m[1]}`;
  }
  return null;
}

/**
 * Silently recover an expired session: re-login with the stored password so the
 * in-flight request can retry. Returns false when credentials are missing or
 * login fails.
 */
export async function reauthenticate(): Promise<boolean> {
  const [email, password, url] = await Promise.all([
    storage.get(StorageKeys.emailBackup),
    storage.get(StorageKeys.passwordBackup),
    storage.get(StorageKeys.instanceUrlBackup),
  ]);
  if (!email || !password || !url) return false;
  try {
    await loginToServer(url, email, password);
    return true;
  } catch {
    return false;
  }
}
