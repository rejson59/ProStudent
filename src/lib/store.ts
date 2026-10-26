import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Decoder } from "./schema";

/**
 * Magazyn stanu aplikacji oparty o `localStorage`.
 *
 * Cechy, których brakowało wcześniejszej wersji:
 *  - jedno źródło prawdy w pamięci (`cache`) — wszystkie komponenty widzą ten sam obiekt,
 *  - walidacja przez dekoder (`Decoder<T>`), więc uszkodzony zapis nie wywala UI,
 *  - walidacja i normalizacja przy starcie, z zapisem poprawionej wersji,
 *  - synchronizacja między kartami przez natywne zdarzenie `storage`,
 *  - brak efektów ubocznych w updaterze `setState` (bezpieczne w StrictMode),
 *  - subskrypcja przez `useSyncExternalStore` (React 18+).
 */

export const PREFIX = "plecak:";

type Stored = { [key: string]: unknown };

const cache = new Map<string, unknown>();
const decoders = new Map<string, (raw: unknown) => unknown>();
const listeners = new Map<string, Set<() => void>>();

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, cb: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (!set.size) listeners.delete(key);
  };
}

/** Wartość klucza: z pamięci, ze schowka (po walidacji) albo domyślna. */
function resolve<T>(key: string, initial: T | (() => T), decode?: Decoder<T>): T {
  if (cache.has(key)) return cache.get(key) as T;

  const raw = safeGet(key);
  if (raw != null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const value = decode ? decode(parsed) : (parsed as T);
      if (value !== undefined) {
        cache.set(key, value);
        // Samonaprawa: jeśli dekoder znormalizował dane (np. plan 5×3 → 5×8),
        // zapisujemy poprawioną wersję, żeby błąd nie wracał przy każdym starcie.
        const normalized = JSON.stringify(value);
        if (normalized !== raw) safeSet(key, normalized);
        return value;
      }
    } catch {
      /* uszkodzony JSON — lecimy do wartości domyślnych */
    }
  }

  const fallback = typeof initial === "function" ? (initial as () => T)() : initial;
  cache.set(key, fallback);
  // Zapisujemy od razu, żeby każdy komponent korzystał z tych samych danych
  // (dotąd `defaultTasks()` generowało nowe ID przy każdym wywołaniu).
  safeSet(key, JSON.stringify(fallback));
  return fallback;
}

function write<T>(key: string, value: T) {
  cache.set(key, value);
  safeSet(key, JSON.stringify(value));
  notify(key);
}

/** Synchronizacja między kartami tej samej przeglądarki. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    const key = event.key;
    if (key === null) {
      // `localStorage.clear()` w innej karcie.
      cache.clear();
      [...listeners.keys()].forEach(notify);
      return;
    }
    if (!key.startsWith(PREFIX)) return;

    if (event.newValue == null) {
      cache.delete(key);
    } else {
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        const decode = decoders.get(key);
        const value = decode ? decode(parsed) : parsed;
        if (value === undefined) return;
        cache.set(key, value);
      } catch {
        return;
      }
    }
    notify(key);
  });
}

/**
 * Hook do wartości trzymanej w `localStorage`.
 *
 * @param key      nazwa bez prefiksu, np. `"tasks"`
 * @param initial  wartość domyślna (lub funkcja ją tworząca)
 * @param decode   opcjonalny walidator/normalizator zapisu
 */
export function useLocal<T>(key: string, initial: T | (() => T), decode?: Decoder<T>) {
  const fullKey = PREFIX + key;

  if (decode && !decoders.has(fullKey)) {
    decoders.set(fullKey, decode as (raw: unknown) => unknown);
  }

  const getSnapshot = useCallback(() => resolve(fullKey, initial, decode), [fullKey, initial, decode]);

  const subscribeFn = useCallback((cb: () => void) => subscribe(fullKey, cb), [fullKey]);

  const value = useSyncExternalStore(subscribeFn, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = resolve(fullKey, initial, decode);
      const updated = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      if (Object.is(updated, current)) return;
      write(fullKey, updated);
    },
    [fullKey, initial, decode]
  );

  return [value, setValue] as const;
}

/** Zegar odświeżający się co `intervalMs` (domyślnie raz na sekundę). */
export function useNow(intervalMs = 1000) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const timer = setInterval(cb, intervalMs);
      return () => clearInterval(timer);
    },
    [intervalMs]
  );
  const tick = useSyncExternalStore(
    subscribe,
    // Snapshot to liczba — zmienia się dokładnie raz na `intervalMs`,
    // więc `useMemo` niżej daje stabilne `Date` między tyknięciami.
    () => Math.floor(Date.now() / intervalMs),
    () => 0
  );
  return useMemo(() => new Date(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ------------------------------------------------------------------ */
/* Narzędzia: kopie zapasowe, reset, lista kluczy                      */
/* ------------------------------------------------------------------ */

export const DATA_VERSION = 2;

/** Wszystkie klucze aplikacji obecne w schowku. */
export function exportData(): Stored {
  const out: Stored = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        /* pomijamy uszkodzony wpis */
      }
    }
  } catch {
    /* brak dostępu do localStorage */
  }
  return out;
}

export function resetData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
  cache.clear();
  [...listeners.keys()].forEach(notify);
}

export type ImportResult = { ok: boolean; imported: number; skipped: number; message: string };

/**
 * Import kopii zapasowej. Nieznane klucze są pomijane, znane przechodzą walidację.
 * `knownKeys` to mapa klucz → dekoder; dostarcza ją aplikacja.
 */
export function importData(raw: unknown, knownKeys: Record<string, (value: unknown) => unknown>): ImportResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, imported: 0, skipped: 0, message: "Plik nie zawiera obiektu z danymi." };
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  let imported = 0;
  let skipped = 0;

  for (const [key, value] of entries) {
    const name = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
    const decode = knownKeys[name];
    if (!decode) {
      skipped++;
      continue;
    }
    const decoded = decode(value);
    if (decoded === undefined) {
      skipped++;
      continue;
    }
    write(PREFIX + name, decoded);
    imported++;
  }

  if (!imported) {
    return { ok: false, imported, skipped, message: "Nie znaleziono żadnych danych Plecaka w pliku." };
  }
  return { ok: true, imported, skipped, message: `Zaimportowano ${imported} sekcji danych.` };
}

/** Prosi przeglądarkę o trwałe przechowywanie danych (bez automatycznego czyszczenia). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Przybliżone zużycie schowka w bajtach (do ostrzeżenia w panelu danych). */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
