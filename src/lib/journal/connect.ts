/**
 * Podpowiedzi dla użytkownika komputera: system, przeglądarka i skróty
 * klawiszowe. Bez tego karta połączenia mówiła „Ctrl+Shift+B” także
 * użytkownikowi Maca i nie mówiła nic o tym, czego szukać w menu.
 */

export type Os = "mac" | "windows" | "linux" | "other";

type NavigatorLike = {
  userAgent?: string;
  platform?: string;
  userAgentData?: { platform?: string };
};

export function detectOs(nav: NavigatorLike = typeof navigator === "undefined" ? {} : navigator): Os {
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  const ua = nav.userAgent ?? "";
  const haystack = `${platform} ${ua}`;
  if (/mac|iphone|ipad|ipod/i.test(platform) || /mac os x|macintosh/i.test(ua)) return "mac";
  if (/win/i.test(platform) || /windows/i.test(ua)) return "windows";
  if (/linux|x11/i.test(haystack) && !/android/i.test(ua)) return "linux";
  return "other";
}

/** „Ctrl + Shift + B” na Windows/Linux, „⌘ + Shift + B” na Macu. */
export function shortcut(os: Os, keys: string): string {
  return `${os === "mac" ? "⌘" : "Ctrl"} + ${keys.split("+").join(" + ")}`;
}

export const showBookmarksShortcut = (os: Os) => shortcut(os, "Shift+B");
export const addBookmarkShortcut = (os: Os) => shortcut(os, "D");
export const devtoolsShortcut = (os: Os) => (os === "mac" ? "⌥ + ⌘ + I" : "F12");

export type Browser = "chrome" | "edge" | "firefox" | "safari" | "opera" | "other";

export function detectBrowser(ua: string): Browser {
  if (/Edg\//i.test(ua)) return "edge";
  if (/OPR\/|Opera/i.test(ua)) return "opera";
  if (/Firefox\/|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome\/|CriOS/i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

export const BROWSER_NAMES: Record<Browser, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  safari: "Safari",
  opera: "Opera",
  other: "Twoja przeglądarka",
};

/** Gdzie w menu schowana jest pozycja „dodaj zakładkę”, gdy skrót nie działa. */
export function addBookmarkMenu(browser: Browser): string {
  switch (browser) {
    case "chrome":
      return "menu ⋮ → Zakładki → Menedżer zakładek → ⋮ → Dodaj nową zakładkę";
    case "edge":
      return "menu … → Ulubione → Zarządzaj ulubionymi → Dodaj ulubioną";
    case "firefox":
      return "menu ☰ → Zakładki → Zarządzaj zakładkami → Dodaj zakładkę";
    case "safari":
      return "Zakładki → Dodaj zakładkę (⌘ + D)";
    case "opera":
      return "menu O → Zakładki → Dodaj stronę";
    default:
      return "menu przeglądarki → Zakładki → Dodaj zakładkę";
  }
}

export const JOURNAL_URL = "https://eduvulcan.pl/";
