import type { TabId } from "./nav";

/**
 * Uruchamianie aplikacji z telefonu: skróty z ekranu głównego, „Udostępnij”
 * z innej aplikacji, otwieranie plików .json i sklejanie załączników.
 *
 * Wszystkie funkcje są odporne na brak API — starsze przeglądarki po prostu
 * nic nie dostają, zamiast wywalać ekran.
 */

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ podaje się za macOS — odróżnia go liczba punktów dotyku.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

export type LaunchIntent =
  | { kind: "tab"; tab: TabId }
  | { kind: "journal" }
  | { kind: "import" }
  | null;

/** Czyta `?zakladka=` / `?akcja=` z manifestu (skróty aplikacji). */
export function readLaunchIntent(search: string): LaunchIntent {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const action = params.get("akcja");
  if (action === "dziennik") return { kind: "journal" };
  if (action === "import") return { kind: "import" };

  const tab = params.get("zakladka");
  const allowed: TabId[] = ["home", "plan", "tasks", "grades", "focus", "cards"];
  return tab && (allowed as string[]).includes(tab) ? { kind: "tab", tab: tab as TabId } : null;
}

/**
 * Składa tekst z „Udostępnij” (tytuł + treść + adres) w coś, co da się pokazać
 * użytkownikowi. Zakładka z dziennika wysyła przez `?dziennik=` — łapiemy to
 * w `App.tsx`, tutaj zostaje reszta (np. notatka albo link do zadania).
 */
export type SharedPayload = { title?: string; text?: string; url?: string };

export function readSharedPayload(params: URLSearchParams): SharedPayload | null {
  const title = params.get("title")?.trim() || undefined;
  const text = params.get("text")?.trim() || undefined;
  const url = params.get("url")?.trim() || undefined;
  if (!title && !text && !url) return null;
  return { title, text, url };
}

/** Prosty „tytuł zadania” z tego, co udostępnił użytkownik. */
export function sharedPayloadToTask(payload: SharedPayload): { title: string; note: string } {
  const title = payload.title || payload.text?.split("\n")[0] || payload.url || "Udostępnione";
  const note = [payload.text, payload.url].filter(Boolean).join(" ").trim();
  return { title: title.slice(0, 120), note: note.slice(0, 400) };
}

/* ------------------------------- offline ------------------------------- */

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // Tylko produkcja: w trybie dev cache przeszkadzałby w podglądzie zmian.
  // W trybie dev cache przeszkadzałby w podglądzie zmian.
  const dev = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD !== true;
  if (dev) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
