# plecak-sync — lokalny agent synchronizacji z eduVULCAN

Agent pobiera dane z dziennika i wystawia je aplikacji Plecak jako gotowy plik
`plecak-import-v1.json`. **Działa na Twoim komputerze i tylko na nim** — dane
szkoły nie opuszczają urządzenia, a aplikacja webowa nigdy nie widzi hasła.

```
eduVULCAN  ──(klucz RSA)──►  agent (127.0.0.1:8787)  ──►  Plecak w przeglądarce
```

## Dlaczego osobny program, a nie logowanie w aplikacji

Aplikacja jest statyczna (GitHub Pages): nie ma backendu, więc nie ma gdzie
bezpiecznie trzymać hasła ani klucza. Przeglądarka nie może też odpytać
`lekcjaplus.vulcan.net.pl` (CORS). Agent rozwiązuje oba problemy: trzyma klucz
lokalnie i udostępnia dane na `127.0.0.1`.

## Wymagania

- Node.js 20 lub nowszy (`node -v`),
- konto w eduVULCAN,
- żadnych zależności do instalacji — agent używa wyłącznie modułów Node.

## Pierwsze uruchomienie (jednorazowa konfiguracja)

```bash
cd sync-agent
node src/cli.mjs login
```

1. Agent otworzy `https://eduvulcan.pl/logowanie` — zaloguj się.
2. W tej samej przeglądarce otwórz `https://eduvulcan.pl/api/ap`.
3. Skopiuj **całą** zawartość tej strony (to zwykły tekst z ukrytym polem `ap`).
4. Wklej ją w terminalu i zakończ wejście: `Ctrl+Z` + Enter (Windows) albo `Ctrl+D`.

Agent wygeneruje parę kluczy RSA 2048 + samopodpisany certyfikat (ważny 20 lat),
zarejestruje go w dzienniku i zapisze `data/credentials.json`. **Hasło nie jest
nigdzie zapisywane** — dalsze żądania podpisuje klucz prywatny, który zostaje
wyłącznie na Twoim dysku.

> `data/` jest w `.gitignore`. Nigdy nie wrzucaj `credentials.json` do repo —
> to odpowiednik hasła.

## Codzienne użycie

```bash
node src/cli.mjs serve      # serwer + odświeżanie co 2 h (Ctrl+C kończy)
node src/cli.mjs sync       # jednorazowe odświeżenie
node src/cli.mjs status     # co wiadomo o danych i błędach
```

W Plecaku: **Twoje dane → Import z e-dziennika → Pobierz z agenta**, a przy
zaznaczonym „Synchronizuj automatycznie” aplikacja sama sprawdzi agenta
przy starcie i co 10 minut.

## API agenta (tylko 127.0.0.1)

| Endpoint | Znaczenie |
| --- | --- |
| `GET /health` | `{ ok, version, lastSync, ageHours, stale, student, lastError }` |
| `GET /snapshot.json` | dokument `plecak-import-v1` albo 404 z powodem |
| `GET /` | stroniczka statusu do otwarcia w przeglądarce |

CORS dopuszcza `https://rejson59.github.io` oraz `localhost:5173/4173`.
Nagłówek `Access-Control-Allow-Private-Network: true` pozwala przeglądarce
sięgnąć `127.0.0.1` z bezpiecznego origin (Chrome wymaga tego od 2021 r.).

## Co jest mapowane

| Dziennik (Hebe) | Plecak |
| --- | --- |
| `grade/byPupil` | oceny w `Subjects.grades` (wartość, waga, kategoria, data) |
| `schedule/withchanges/byPupil` | siatka planu + **automatycznie wyliczone dzwonki** |
| `exam/byPupil` | zadania typu sprawdzian / kartkówka |
| `homework/byPupil` | zadania domowe |

Oceny opisowe („np.”, „zad.”) nie są liczone do średniej, ale są zgłaszane
jako ostrzeżenie przy imporcie. Lekcje odwołane są pomijane w planie.

## Ograniczenia — czytaj przed użyciem

- **To API nieoficjalne.** Vulcan może je zmienić bez ostrzeżenia; oficjalna
  aplikacja używa tych samych endpointów, więc zmiany bywają rzadkie, ale się
  zdarzają. Agent nie ukrywa błędów: pokazuje `lastError` i oznacza dane jako
  nieświeże po 24 h.
- **Vulcan blokuje zautomatyzowanych klientów.** W 2024 r. zablokowano
  Wulkanowego, Szkolny.eu i Wezuwiusz; we wrześniu 2025 r. zawieszano konta
  korzystające z nieoficjalnych integracji, a na 2026 r. zapowiedziano Centralny
  Dziennik Elektroniczny. Ryzyko ograniczenia konta istnieje — używaj rozsądnie
  (raz na kilka godzin, nie co minutę) i nie udostępniaj `credentials.json`.
- **Brak gwarancji „na zawsze”.** Nikt nie może jej dać wobec zamkniętego API.
  Dlatego zawsze działa ścieżka zapasowa: plik `plecak-import-v1.json`
  wgrany ręcznie w oknie importu.

## Rozwój

```bash
node --test          # 22 testy: podpis RSA, certyfikat, mapowanie, serwer, sync
```

Struktura:

- `src/der.mjs`, `src/cert.mjs` — minimalny koder DER + certyfikat X.509,
- `src/vulcan.mjs` — podpisywanie żądań i klient API,
- `src/register.mjs` — jednorazowe parowanie,
- `src/snapshot.mjs` — mapowanie odpowiedzi na `plecak-import-v1` (czyste funkcje),
- `src/server.mjs` — serwer HTTP z CORS,
- `src/cli.mjs` — komendy `login` / `sync` / `serve` / `status`.

Podpis: kanoniczny adres `api/mobile/...` (percent-encoded, małe litery) +
`digest` (tylko dla treści) + data GMT; algorytm `sha256withrsa`, nagłówki
`signature`, `vcanonicalurl`, `vdate`, `vapi`.
