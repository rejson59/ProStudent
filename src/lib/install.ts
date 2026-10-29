import { detectPlatform } from "./mobile";

/**
 * Instalacja z ekranu głównego.
 *
 * `beforeinstallprompt` przychodzi tylko w Chrome/Edge/Opera na Androidzie
 * i komputerze — Safari na iOS nie pozwala wywołać instalacji z kodu, więc
 * dostaje instrukcję. Ten plik trzyma stan w jednym miejscu, żeby zarówno
 * karta instalacji, jak i panel danych mówiły to samo.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

const notify = () => listeners.forEach((listener) => listener(deferred !== null));

export function watchInstallPrompt(onChange: (available: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};

  listeners.add(onChange);
  onChange(deferred !== null);

  const onPrompt = (event: Event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    notify();
  };

  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    notify();
    return choice?.outcome === "accepted";
  } catch {
    return false;
  }
}

export const canPromptInstall = () => deferred !== null;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** Czy warto pokazywać podpowiedź instalacji (telefon/tablet, nie zainstalowano). */
export function shouldSuggestInstall(): boolean {
  return !isStandalone() && detectPlatform() !== "desktop";
}
