/** Wspólne konto Rejsona, niezależne od lokalnych danych aplikacji. */
const API = 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/';
// Publiczny klucz anon. Dostęp do kont wymaga hasła/PIN-u lub tokenu sesji.
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
export const COMMUNITY_SESSION_KEY = 'rejson_community_session_v1';
export type CommunitySession = { token: string; username: string };
type Stored = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Requester = typeof fetch;

function sessionShape(value: unknown): CommunitySession | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return typeof item.token === 'string' && item.token.length >= 16 &&
    typeof item.username === 'string' && item.username.length > 0
    ? { token: item.token, username: item.username } : null;
}
export function readCommunitySession(storage: Pick<Storage, 'getItem'>): CommunitySession | null {
  try { return sessionShape(JSON.parse(storage.getItem(COMMUNITY_SESSION_KEY) || 'null')); }
  catch { return null; }
}
export function validCredentials(mode: 'login' | 'register', username: string, secret: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username.trim()) &&
    secret.length > 0 && new TextEncoder().encode(secret).length <= 72 &&
    (mode === 'login' || Array.from(secret).length >= 10);
}
async function rpc(name: string, params: object, request: Requester): Promise<unknown> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    response = await request(API + name, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params), signal: controller.signal,
    });
  } catch { throw new Error('Nie udało się połączyć z kontem. Spróbuj ponownie później.'); }
  finally { clearTimeout(timer); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'Nie udało się połączyć z kontem.';
    throw new Error(message);
  }
  return body;
}
/** Nie ufamy nazwie przechowywanej w przeglądarce; potwierdza ją serwer. */
export async function verifyCommunitySession(session: CommunitySession, request: Requester = fetch): Promise<CommunitySession | null> {
  const result = await rpc('community_whoami', { p_token: session.token }, request);
  if (!result || typeof result !== 'object' || !('username' in result)) throw new Error('Nieprawidłowa odpowiedź serwera konta.');
  const { username } = result;
  if (username === null) return null;
  if (typeof username !== 'string' || !username) throw new Error('Nieprawidłowa odpowiedź serwera konta.');
  return { token: session.token, username };
}
/** Konto jest tworzone/logowane w grze; hasło/PIN nigdy nie trafia do URL ani localStorage. */
export async function authenticateCommunity(mode: 'login' | 'register', username: string, secret: string, request: Requester = fetch): Promise<CommunitySession> {
  const name = username.trim();
  if (!validCredentials(mode, name, secret)) throw new Error('Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.');
  const response = await rpc(mode === 'register' ? 'community_register' : 'community_login', { p_username: name, p_pin: secret }, request);
  const session = sessionShape(response);
  if (!session) throw new Error(mode === 'register' ? 'Serwer przyjął rejestrację, ale odpowiedź była nieprawidłowa. Spróbuj się zalogować.' : 'Nieprawidłowa odpowiedź serwera konta.');
  try {
    const verified = await verifyCommunitySession(session, request);
    if (!verified) throw new Error('Sesja wygasła.');
    return verified;
  } catch (error) {
    if (mode === 'register') throw new Error('Konto utworzono, ale nie udało się potwierdzić sesji. Spróbuj się zalogować.');
    throw error;
  }
}
export function saveCommunitySession(storage: Stored, session: CommunitySession): void {
  storage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify(session));
}
export function forgetCommunitySession(storage: Pick<Stored, 'removeItem'>): void {
  storage.removeItem(COMMUNITY_SESSION_KEY);
}
