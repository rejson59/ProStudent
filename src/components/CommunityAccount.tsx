import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authenticateCommunity, COMMUNITY_SESSION_KEY, forgetCommunitySession, readCommunitySession, saveCommunitySession, validCredentials, verifyCommunitySession, type CommunitySession } from '../lib/communityAccount';

type View = 'checking' | 'guest' | 'connected' | 'unavailable';

/** Opcjonalne konto: nie modyfikuje ani nie wysyła danych szkolnych. */
export default function CommunityAccount({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('checking');
  const [session, setSession] = useState<CommunitySession | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    let alive = true;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const refresh = async () => {
      const sequence = ++serial.current;
      let stored: CommunitySession | null = null;
      try { stored = readCommunitySession(window.localStorage); } catch { /* Pamięć może być zablokowana. */ }
      if (!stored) { setSession(null); setView('guest'); return; }
      setView('checking');
      try {
        const verified = await verifyCommunitySession(stored);
        if (!alive || sequence !== serial.current) return;
        try { if (readCommunitySession(window.localStorage)?.token !== stored.token) return; } catch { return; }
        setSession(verified);
        setView(verified ? 'connected' : 'guest');
        if (!verified) setMessage('Sesja wygasła. Zaloguj się ponownie.');
      } catch {
        if (alive && sequence === serial.current) { setSession(null); setView('unavailable'); }
      }
    };
    const storage = (event: StorageEvent) => { if (event.key === COMMUNITY_SESSION_KEY || event.key === null) void refresh(); };
    const changed = () => { void refresh(); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
      if (!items.length) { event.preventDefault(); panel.current.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (!panel.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    void refresh();
    window.addEventListener('storage', storage);
    window.addEventListener('rj:session-change', changed);
    window.addEventListener('keydown', keydown);
    return () => { alive = false; ++serial.current; window.removeEventListener('storage', storage); window.removeEventListener('rj:session-change', changed); window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validCredentials(mode, name, secret)) { setMessage('Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.'); return; }
    if (mode === 'register' && secret !== confirm) { setMessage('Hasła nie są takie same.'); return; }
    const sequence = ++serial.current;
    const password = secret;
    setSecret(''); setConfirm(''); setMessage(''); setBusy(true);
    try {
      const verified = await authenticateCommunity(mode, name, password);
      if (sequence !== serial.current) return;
      try { saveCommunitySession(localStorage, verified); }
      catch { throw new Error('Nie można zapisać sesji w tej przeglądarce.'); }
      setSession(verified); setView('connected');
      window.dispatchEvent(new Event('rj:session-change'));
    } catch (error) {
      if (sequence === serial.current) setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować.');
    } finally { setBusy(false); }
  };
  const logout = () => {
    ++serial.current;
    try { forgetCommunitySession(localStorage); }
    catch { setMessage('Nie udało się usunąć sesji z tej przeglądarki.'); return; }
    setSession(null); setView('guest'); setMessage('Wylogowano na tym urządzeniu.');
    window.dispatchEvent(new Event('rj:session-change'));
  };

  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4" role="presentation">
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="community-title" className="card my-auto w-full max-w-md !rounded-3xl p-5 text-ink shadow-2xl">
      <div className="flex items-center justify-between gap-3"><h2 id="community-title" className="font-display text-2xl font-semibold">Konto Rejson</h2><button type="button" className="rounded-xl border border-line px-3 py-2 cursor-pointer hover:bg-line/50" onClick={onClose} disabled={busy} aria-label="Zamknij konto">✕</button></div>
      <p className="my-3 text-sm text-muted">To samo konto co w RejChat i RejStream. Gra nadal działa bez konta.</p>
      <p className="mb-3 text-sm text-muted">Oceny, plan i pozostałe dane Plecaka nadal są tylko na tym urządzeniu. Logowanie nie przenosi ich na inne urządzenia. W panelu „Twoje dane” możesz zrobić kopię plikową.</p>
      {view === 'checking' && <p role="status">Sprawdzam konto…</p>}
      {view === 'unavailable' && <p role="status">Nie można teraz sprawdzić konta. Spróbuj później; Twoje dane pozostają na urządzeniu.</p>}
      {view === 'connected' && session && <div><p>Zalogowano jako <strong>{session.username}</strong>.</p><p className="mt-2 text-sm"><a className="underline" href="https://rejson59.github.io/logowanie" target="_blank" rel="noopener noreferrer">Ustaw lub zmień hasło na stronie konta</a> (na innej domenie może być potrzebne ponowne logowanie).</p><button type="button" className="mt-3 rounded-xl border border-line px-4 py-2 cursor-pointer hover:bg-line/50" onClick={logout}>Wyloguj na tym urządzeniu</button></div>}
      {view === 'guest' && <>
        <div className="my-3 flex gap-2" role="group" aria-label="Tryb konta">
          <button type="button" className="rounded-xl border border-line px-4 py-2 cursor-pointer aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-50" disabled={busy} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setSecret(''); setConfirm(''); setMessage(''); }}>Zaloguj</button>
          <button type="button" className="rounded-xl border border-line px-4 py-2 cursor-pointer aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-50" disabled={busy} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setSecret(''); setConfirm(''); setMessage(''); }}>Utwórz konto</button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">Nazwa użytkownika<input className="rounded-xl border border-line bg-paper p-2 text-ink" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={24} required disabled={busy} /></label>
          <label className="flex flex-col gap-1 text-sm">{mode === 'login' ? 'Hasło lub dotychczasowy PIN' : 'Hasło'}<input className="rounded-xl border border-line bg-paper p-2 text-ink" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={secret} onChange={(e) => setSecret(e.target.value)} required disabled={busy} /></label>
          {mode === 'register' && <><label className="flex flex-col gap-1 text-sm">Powtórz hasło<input className="rounded-xl border border-line bg-paper p-2 text-ink" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} /></label><p className="text-xs text-muted">Minimum 10 znaków i maksymalnie 72 bajty. Nie ma automatycznego odzyskiwania zapomnianego hasła.</p></>}
          <button type="submit" className="rounded-xl bg-ink px-4 py-2 font-semibold text-paper cursor-pointer disabled:opacity-50" disabled={busy}>{busy ? 'Łączenie…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button>
        </form>
      </>}
      {message && <p className="mt-3 text-sm text-clay" role="status">{message}</p>}
    </div>
  </div>;
}
