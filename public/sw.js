/*
 * Service worker Plecaka.
 *
 * Aplikacja po zbudowaniu jest jednym plikiem HTML, więc wystarczy trzymać
 * w pamięci podręcznej dokument i ikony. Dane użytkownika nigdy nie przechodzą
 * przez ten mechanizm — leżą wyłącznie w localStorage.
 *
 * Zasada: sieć pierwsza, pamięć podręczna jako ratunek (szkoła, autobus,
 * słaby zasięg). HTML zawsze odświeżany, żeby nowa wersja wchodziła bez
 * czyszczenia danych.
 */

const VERSION = "plecak-v2";
const CACHE_PREFIX = "plecak-";
const scope = new URL(self.registration.scope);
const shareAction = new URL("./index.html?akcja=import", scope);
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./icon.svg",
  "./plecak-sync.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const isAsset = (url) => /\.(png|svg|webmanifest|js|css|woff2?)$/i.test(new URL(url).pathname);

/**
 * „Udostępnij” z systemu (share_target) przychodzi jako POST do index.html.
 * GitHub Pages nie przyjmie POST-a, więc zamieniamy go na zwykłe wejście
 * z parametrami w adresie — aplikacja odczyta je tak samo jak skrót.
 */
async function handleShare(request) {
  const form = await request.formData().catch(() => null);
  const params = new URLSearchParams({ akcja: "import" });
  for (const key of ["title", "text", "url"]) {
    const value = form?.get(key);
    if (typeof value === "string" && value.trim()) params.set(key, value.slice(0, 500));
  }
  // `Response.redirect` wymaga adresu absolutnego — względny rzuciłby TypeError
  // i „Udostępnij" kończyłoby się błędem zamiast wejściem do aplikacji.
  const target = new URL(`./index.html?${params.toString()}`, self.location.href);
  return Response.redirect(target.href, 303);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method === "POST") {
    const target = new URL(request.url);
    // Przechwytuj wyłącznie deklarowany w manifeście cel systemowego udostępniania.
    // Żądania POST innych aplikacji na tej samej domenie muszą przejść do sieci.
    if (target.origin === shareAction.origin && target.pathname === shareAction.pathname && target.search === shareAction.search) {
      event.respondWith(handleShare(request));
    }
    return;
  }

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return; // inne projekty i czcionki zostają poza cache

  // Dokumenty: sieć, a bez sieci ostatnia zapisana kopia.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (await cache.match("./index.html")) ?? (await cache.match("./")) ?? Response.error();
        })
    );
    return;
  }

  if (!isAsset(request.url)) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void cache.put(request, copy);
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })
  );
});

// Pozwala aplikacji zapytać, czy jest nowsza wersja (i pokazać podpowiedź).
self.addEventListener("message", (event) => {
  if (event.data === "sprawdz-wersje") void self.registration.update();
});
