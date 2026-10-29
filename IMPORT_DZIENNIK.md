# Import danych z e-dziennika — jak to działa i gdzie są granice

Dokument opisuje **wdrożone** ścieżki importu z eduVULCAN: zakładkę-przycisk
(bez instalacji), agenta (pełna automatyzacja) i format wymiany danych.

## 1. Wniosek w jednym akapicie

Aplikacja Plecak jest statyczna (GitHub Pages, brak backendu), więc nie może
sama zalogować się do dziennika: przeglądarka nie ma gdzie bezpiecznie trzymać
hasła, a serwery Vulcana nie wysyłają nagłówków CORS. Rozwiązania są dwa:
**zakładka-przycisk** (wykonuje się na stronie dziennika, korzysta z sesji,
której użytkownik już używa) oraz **lokalny agent** (automatyczne odświeżanie).
Hasło nigdy nie trafia do aplikacji.

## 1a. Zakładka (domyślna, bez instalacji)

1. Plecak → **Dziennik** → przeciągnij przycisk **„Pobierz z dziennika”** na pasek zakładek.
2. Otwórz eduVULCAN, zaloguj się, kliknij zakładkę.
3. Dane pojawiają się w Plecaku do zatwierdzenia (adres `#dziennik=…`).

Jak to działa technicznie:

- zakładka wstrzykuje `plecak-sync.js` z GitHub Pages (adres w `public/`),
- skrypt czyta tokeny z `https://eduvulcan.pl/api/ap` — **ta sama domena, więc
  sesja działa i nie ma tu żadnego logowania w aplikacji**,
- przy pierwszym uruchomieniu rejestruje klucz urządzenia (RSA 2048 + certyfikat
  X.509 generowane przez WebCrypto) i zapisuje go w `localStorage` dziennika —
  kolejne kliknięcia tylko podpisują żądania,
- pobiera oceny, plan (okno −14…+21 dni), sprawdziany i zadania domowe,
- pakuje je w `plecak-import-v1` i otwiera Plecak z danymi w adresie.

Ograniczenia: trzeba kliknąć za każdym razem (przeglądarka nie działa w tle na
cudzej stronie), a jeśli Vulcan zablokuje zapytania z `eduvulcan.pl` (CORS),
zostaje import pliku. Dlatego ścieżka „z pliku” nigdy nie znika.

## 2. Dlaczego nie inne warianty

| Wariant | Ocena |
| --- | --- |
| Ręczny eksport/import pliku | Działa zawsze, ale nie spełnia wymogu „samo się aktualizuje”. **Zostaje jako fallback.** |
| **Zakładka (bookmarklet)** | **Wybrana jako domyślna**: zero instalacji, sesja dziennika użytkownika, jeden klik. |
| Agent lokalny | Wybrany dla chcących pełnej automatyzacji (odświeżanie co 2 h). Wymaga Node.js — dlatego nie jest domyślny. |
| Logowanie w aplikacji webowej | Odrzucone: hasło w przeglądarce + CORS + RODO. Niemożliwe bez backendu. |
| Backend/proxy w chmurze | Odrzucone: koszty, odpowiedzialność za dane uczniów, blokady Vulcana, brak zgody na trzymanie haseł. |
| Rozszerzenie przeglądarki | Scraping HTML dziennika, kruche, wymaga uprawnień do wszystkich stron. Gorsze niż agent. |
| Auto-sync tylko w przeglądarce (fetch do Vulcana) | Niemożliwe: CORS i brak bezpiecznego miejsca na klucz prywatny. |

Agent to jedyny wariant, który jednocześnie: nie przenosi danych poza komputer,
pozwala na automatyczne odświeżanie i nie wymaga serwera.

## 3. Jednorazowa konfiguracja (parowanie)

```bash
cd sync-agent
node src/cli.mjs login
```

1. Logujesz się na `eduvulcan.pl` w przeglądarce (agent ją otwiera).
2. Otwierasz `https://eduvulcan.pl/api/ap` i kopiujesz zawartość strony.
3. Wklejasz do terminala.

Agent:

1. czyta tokeny uczniów i `tenant` (szkołę) z JWT,
2. generuje parę kluczy **RSA 2048** i samopodpisany certyfikat X.509
   (CN `APP_CERTIFICATE CA Certificate`, ważność 20 lat, fingerprint SHA-1),
3. wysyła `POST /api/mobile/register/jwt` — dziennik zapamiętuje klucz
   publiczny i przypisuje go do urządzenia,
4. pobiera `GET /api/mobile/register/hebe?mode=2` — dane ucznia i `restUrl`,
5. zapisuje `data/credentials.json`: fingerprint, klucz prywatny, certyfikat,
   `restUrl`, profil ucznia.

**Hasło nie jest nigdzie zapisywane.** Od tej chwili każde żądanie jest
podpisane kluczem prywatnym — dokładnie tak działa oficjalna aplikacja.

## 4. Format wymiany: `plecak-import-v1`

Ten sam dokument produkuje agent, konwerter i ręcznie przygotowany plik, więc
aplikacja ma jedną ścieżkę importu do przetestowania.

```json
{
  "format": "plecak-import",
  "version": 1,
  "source": "eduvulcan",
  "exportedAt": "2026-10-28T10:00:00.000Z",
  "student": { "name": "Anna Nowak", "className": "3A", "school": "LO nr 1" },
  "grades": [
    { "externalId": "11", "subject": "Matematyka", "value": "5+", "weight": 2,
      "category": "sprawdzian", "date": "2026-10-01", "comment": "dobra robota" }
  ],
  "timetable": [
    { "date": "2026-10-26", "start": "08:00", "end": "08:45", "subject": "Matematyka", "room": "12" }
  ],
  "exams": [
    { "externalId": "7", "subject": "Fizyka", "date": "2026-11-05", "type": "Kartkówka", "description": "Kinematyka" }
  ],
  "homework": [
    { "externalId": "21", "subject": "Polski", "due": "2026-11-03", "description": "Przeczytać rozdział 4" }
  ]
}
```

- `source`: `eduvulcan` | `uonet` | `librus` | `manual` | `file`
- `externalId` jest wymagane do idempotencji — bez niego każde odświeżenie
  tworzyłoby duplikaty (aplikacja i tak wylicza stabilne ID z `source` + `externalId`).
- Daty `YYYY-MM-DD`, godziny `HH:MM`. Dekoder w aplikacji normalizuje `8:00` → `08:00`
  i odrzuca pojedyncze błędne wpisy, nie cały plik.

## 5. Mapowanie na model aplikacji

| Dziennik (Hebe) | Plecak | Uwagi |
| --- | --- | --- |
| `grade/byPupil` → `Column.Subject.Name`, `Content`, `Column.Weight`, `Column.Category.Name`, `CreatedAt` | `Subject.grades` (`value`, `weight`, `note`, data) | oceny opisowe („np.”) pomijane z ostrzeżeniem; waga przycinana do 1–5 |
| `schedule/withchanges/byPupil` → `DateAt`, `TimeSlot.Start/End`, `Subject.Name`, `Visible`, `Change.Type` | siatka `timetable` + `bells` | odwołane (`Change.Type == 1`) i ukryte lekcje pomijane; dzwonki wyliczane z par start/end (koszyki 5-min, tolerancja ±4 min) |
| `exam/byPupil` → `DeadlineAt`, `Type`, `Content` | `Task` z `kind` | „sprawdzian”/„praca klasowa” → sprawdzian, „kartkówka” → kartkówka, „projekt”/„odpowiedź” → projekt |
| `homework/byPupil` → `DeadlineAt`, `Content` | `Task` z `kind: "zadanie"` | termin = `DeadlineAt` |

### Zasady scalania (idempotencja)

- klucz wpisu: `source` + `externalId` → `journalId()` = `source:hash31(externalId)`,
- powtórny import **aktualizuje** wpis (zmieniona ocena, przesunięty sprawdzian),
- wpisy dodane ręcznie w aplikacji nigdy nie są ruszane,
- importowane, niezrobione zadania, których nie ma już w dzienniku, są usuwane
  (zrobione zostają jako historia),
- plan lekcji jest zastępowany w całości (pochodzi z dziennika),
- cały import można cofnąć jednym kliknięciem (toast „Cofnij”).

## 6. Gdzie to jest w aplikacji

- `src/lib/journal/types.ts` — format i tolerancyjny dekoder `decodeSnapshot()`.
- `src/lib/journal/normalize.ts` — `mergeSnapshot()`, `deriveBells()`, `journalId()`.
- `public/plecak-sync.js` — most uruchamiany zakładką na stronie dziennika (WebCrypto, DER/X.509, podpisywanie, mapowanie).
- `src/lib/journal/bookmarklet.ts` — generowanie kodu zakładki i wersji do konsoli.
- `src/lib/journal/hash.ts` — przekazanie danych przez `#dziennik=…`.
- `src/lib/journal/agent.ts` — klient `GET /health` i `GET /snapshot.json` (timeout, bez cache).
- `src/lib/journal/useJournal.ts` — wspólny zapis/cofanie dla importu i auto-syncu.
- `src/components/JournalImport.tsx` — kreator połączenia: stan agenta → instrukcja z kopiowaniem poleceń → podgląd → import.
- `src/components/DataPanel.tsx` — sekcja „Import z e-dziennika” + przełącznik auto-sync.
- `sync-agent/` — agent: `login`, `sync`, `serve`, `status` + 22 testy.

Wejście: **„Dziennik” w menu bocznym** (na telefonie ikona w nagłówku, na dole link w stopce), a także *Twoje dane → Importuj*, paleta poleceń (`Ctrl/⌘ K` → „dziennik”) i stopka.

> Aplikacja **celowo nie ma formularza logowania do dziennika**. GitHub Pages nie ma backendu, a `lekcjaplus.vulcan.net.pl` nie wysyła nagłówków CORS — hasło wpisane na stronie nie mogłoby nigdzie trafić. Logowanie odbywa się raz, w przeglądarce otwartej przez agenta, a strona dostaje tylko gotowy wynik.

Automatyczna synchronizacja w aplikacji: przy starcie i co 10 minut, jeśli
włączony przełącznik i agent odpowiada. Nowy snapshot (`exportedAt` nowszy niż
zapisany) jest scalany bez pytania — dlatego mechanizm jest „raz skonfiguruj
i zapomnij”, a nie „klikaj import za każdym razem”.

## 7. Ograniczenia — uczciwie

1. **API jest nieoficjalne.** Vulcan może je zmienić bez ostrzeżenia. Agent
   zgłasza błąd i oznacza dane jako nieświeże po 24 h, ale nie naprawi się sam.
2. **Blokady kont.** W 2024 r. zablokowano Wulkanowego, Szkolny.eu i Wezuwiusz;
   we wrześniu 2025 r. zawieszano konta nieoficjalnych integracji; na 2026 r.
   zapowiedziano Centralny Dziennik Elektroniczny. Ryzyko istnieje i jest po
   stronie użytkownika — dlatego agent pyta dziennik raz na kilka godzin,
   a nie co minutę.
3. **„Na zawsze” nie istnieje** przy zamkniętym API. Gwarantujemy natomiast:
   dane zostają na komputerze, aplikacja nie zna hasła, a gdy agent przestanie
   działać — import z pliku nadal działa.
4. **Jedno konto/urządzenie.** Klucz jest przypisany do urządzenia; na drugim
   komputerze trzeba sparować osobno.

## 7a. Telefon i tablet

Zakładki na pasku nie ma na telefonie, więc dla urządzeń mobilnych zostały:

1. **Plik z danymi** — wgranie `snapshot.json` (albo dokumentu `plecak-import-v1`)
   w oknie importu. Na Androidzie działa też „Otwórz za pomocą → Plecak”,
   a na iPhonie „Udostępnij → Plecak” (wymaga zainstalowanej aplikacji).
2. **Agent** — jeśli ktoś ma komputer, może wystawić dane w sieci lokalnej;
   na telefonie wystarczy otworzyć Plecak na tym samym Wi-Fi.

Plecak jako PWA: instalacja z ekranu głównego, praca offline i skróty
(`?zakladka=tasks`, `?zakladka=plan`, `?akcja=dziennik`).

## 7b. Bezpieczeństwo zakładki

- Kod zakładki jest w tym repozytorium (`public/plecak-sync.js`) i wykonuje się
  w kontekście `eduvulcan.pl` — ma dostęp do sesji tej strony, tak jak każda
  wklejona konsola. **Nie klikaj cudzych zakładek „do dziennika”.**
- Klucz urządzenia leży w `localStorage` dziennika. To odpowiednik hasła do
  konta w zakresie odczytu danych — nie udostępniaj go i czyść przez
  „Wyczyść parowanie” w okienku mostu.
- Hasło nie jest nigdzie zapisywane: zakładka nigdy go nie widzi.

## 8. Plan awaryjny (zawsze dostępny)

1. `node src/cli.mjs sync` → `sync-agent/data/snapshot.json`.
2. Plecak → **Twoje dane → Import z e-dziennika → Wybierz plik**.
3. Albo wklej zawartość JSON w pole „Wklej dane”.

Ten sam plik można przygotować ręcznie z dowolnego innego źródła (Librus,
UONET+, arkusz) — aplikacja nie wymaga agenta, tylko formatu.

## 9. Co dalej (jeśli będzie potrzebne)

- ICS z sprawdzianiami do kalendarza (eksport z tego samego snapshotu),
- adapter Librus Synergia (oceny z wagami, plan, frekwencja),
- szyfrowanie snapshotu na dysku (klucz w systemowym magazynie),
- instalator agenta jako usługa systemowa (autostart po zalogowaniu).
