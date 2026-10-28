/**
 * Zakładka-przycisk (bookmarklet) do uruchamiania na stronie dziennika.
 *
 * Kod jest celowo malutki: wstrzykuje `plecak-sync.js` z GitHub Pages, który
 * robi całą robotę. Gdyby strona dziennika blokowała zewnętrzne skrypty (CSP),
 * użytkownik może wkleić ten sam kod w konsoli — dlatego druga wersja nie
 * używa prefiksu `javascript:`.
 */

export const BRIDGE_FILE = "plecak-sync.js";

export function bridgeUrl(base = "https://rejson59.github.io/ProStudent/"): string {
  return `${base.replace(/\/+$/, "")}/${BRIDGE_FILE}`;
}

const BOOT = (url: string) =>
  `(function(){` +
  `if(window.__plecakSync){window.__plecakSync.run();return}` +
  `var s=document.createElement('script');` +
  `s.type='module';s.src='${url}?t='+Date.now();` +
  `s.onerror=function(){alert('Nie udało się wczytać Plecaka. Sprawdź połączenie z internetem.')};` +
  `(document.head||document.documentElement).appendChild(s)` +
  `})()`;

/**
 * Kod zakładki gotowy do wklejenia w pole adresu / do `href`.
 * Zostawiamy go surowego — przeglądarki przyjmują w `javascript:` spacje,
 * a kodowanie percentami psuje część rozszerzeń do zakładek.
 */
export function bookmarkletCode(base?: string): string {
  return `javascript:${BOOT(bridgeUrl(base))}`;
}

/** Ten sam kod bez prefiksu — do wklejenia w konsolę deweloperską. */
export function consoleSnippet(base?: string): string {
  return BOOT(bridgeUrl(base));
}
