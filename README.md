# 🎒 ProStudent / Plecak

**Szkolne centrum dowodzenia dla uczniów** — plan lekcji, zadania, oceny, timer fokusu i fiszki w jednej aplikacji. Wszystko działa w przeglądarce, bez konta i bez backendu: dane zapisują się lokalnie w `localStorage`.

> Nazwa „Plecak” to nazwa produktu widoczna w interfejsie. Repozytorium nazywa się ProStudent.

**[▶ Otwórz aplikację](https://rejson59.github.io/ProStudent/)** — wersja online wdrażana automatycznie z `main` przez GitHub Pages.

---

## ✨ Co potrafi

| Moduł | Funkcje |
| --- | --- |
| **Pulpit** | Powitanie z imieniem, zegar, niebo zmieniające się z porą dnia, status „teraz i za chwilę” (lekcja / przerwa / weekend), dzisiejszy plan, najbliższe zadania, średnia, ogród, licznik do wakacji, myśl dnia, szybka notatka |
| **Plan lekcji** | Siatka 5 dni × 8 lekcji, edycja inline, automatyczne kolory przedmiotów, podświetlenie bieżącej lekcji i przeszłych, podsumowanie godzin w tygodniu, tabela dzwonków, widok mobilny dzień po dniu |
| **Zadania** | Typy (zadanie / kartkówka / sprawdzian / projekt), terminy, grupowanie (zaległe, dziś, jutro, ten tydzień, później), filtry, licznik testów w 7 dni |
| **Oceny** | Wagi ocen, skala z plusami/minusami, średnia ważona, prognoza oceny końcowej, „do paska”, kalkulator „ile muszę dostać” |
| **Fokus** | Timer Pomodoro z trybami, generowane proceduralnie dźwięki tła (deszcz, fale, kominek, szum), presety, statystyki dnia i tygodnia, seria dni |
| **Fiszki** | Pudełka Leitnera, powtórki ważone, talie, sterowanie klawiaturą |
| **Ogród** | Każda ukończona sesja fokusu sadzi unikalny kwiat (generowany z ziarna) |
| **Dane** | Eksport/import kopii zapasowej (JSON), trwałe przechowywanie, pełny reset, samonaprawa uszkodzonych zapisów |
| **Na telefon** | Instalacja z ekranu głównego (PWA): ikona obok aplikacji, pełny ekran, praca offline, skróty „Zadania”/„Plan”/„Dziennik”, „Udostępnij” z innej aplikacji tworzy zadanie, otwieranie plików `.json` |
| **Dziennik** | Pozycja „Dziennik” w menu: import ocen, planu (z automatycznymi dzwonkami) i sprawdzianów z **eduVULCAN**. **Najprościej: skopiuj stronę dziennika i wklej** — Plecak sam rozpozna oceny, plan i sprawdziany (albo kliknij „Wklej ze schowka”). Ta sama droga działa na telefonie, tablecie i komputerze, bez instalacji. Opcjonalnie: jednorazowa zakładka w przeglądarce, plik `snapshot.json` albo agent `sync-agent/` |
| **Globalne** | Paleta poleceń `Ctrl/⌘ + K`, skróty `1–6`, tryb dzień/noc/auto (z `prefers-color-scheme`), konfetti, powiadomienia o końcu sesji, „Cofnij” po usunięciu |

---

## 🧰 Stack

- **React 19** + **TypeScript 5.9** (tryb `strict`)
- **Vite 7** + `vite-plugin-singlefile` (build = jeden plik HTML)
- **Tailwind CSS 4** (`@theme`, własne tokeny kolorów, wariant `night`)
- Zero zależności runtime poza `react`, `react-dom`, `clsx`, `tailwind-merge`
- Fonty: Fraunces + Plus Jakarta Sans (Google Fonts)

---

## 🚀 Start

Wymagania: Node.js **20.19+** lub **22.12+** (wymóg Vite 7).

```bash
npm install
npm run dev       # http://localhost:5173
```

### Skrypty

| Skrypt | Opis |
| --- | --- |
| `npm run dev` | Serwer developerski z HMR |
| `npm run build` | Build produkcyjny do `dist/index.html` (jeden plik) |
| `npm run preview` | Podgląd builda produkcyjnego |
| `npm run typecheck` | Sprawdzenie typów bez emitowania plików |
| `npm test` | Testy jednostkowe (Vitest) — logika ocen, planu, dat i dekodery danych |

---

## 🗂️ Struktura

```
src/
├─ App.tsx                 # nawigacja, motyw, paleta poleceń, timer, toasty
├─ main.tsx                # punkt wejścia + rejestracja service workera
├─ types/                  # deklaracje dla mostu dziennika
├─ index.css               # tokeny Tailwind @theme, motyw nocny, animacje
├─ components/
│  ├─ Dashboard.tsx        # pulpit (hero + 9 kart)
│  ├─ Timetable.tsx        # plan lekcji (desktop + mobile)
│  ├─ Tasks.tsx            # zadania i sprawdziany
│  ├─ Grades.tsx           # oceny, średnie, kalkulator
│  ├─ Focus.tsx            # timer, dźwięki, statystyki
│  ├─ Flashcards.tsx       # fiszki Leitnera
│  ├─ CommandPalette.tsx   # Ctrl+K
│  ├─ Garden.tsx / Sky.tsx # grafika SVG generowana proceduralnie
│  ├─ Icon.tsx / ui.tsx    # ikony i komponenty bazowe
│  └─ ...
├─ lib/
│  ├─ store.ts             # magazyn localStorage (useSyncExternalStore, sync między kartami)
│  ├─ schema.ts            # dekodery/walidatory zapisów + rejestr kluczy
│  ├─ nav.ts               # definicja zakładek
│  ├─ notify.ts            # powiadomienia systemowe (bez wyjątków na Safari)
│  ├─ useMediaQuery.ts     # reaktywny prefers-color-scheme
│  ├─ data.ts              # typy, dane domyślne, oceny, daty, cytaty
│  ├─ schedule.ts          # logika „jaka lekcja teraz”
│  ├─ useTimer.ts          # timer Pomodoro z zapisem stanu
│  ├─ audio.ts             # syntezator dźwięków tła (Web Audio API)
│  ├─ logic.test.ts        # testy jednostkowe
│  └─ color.ts / confetti.ts
└─ utils/cn.ts
```

---

## 💾 Dane i prywatność

- Wszystko trzymane jest **wyłącznie lokalnie** w `localStorage` pod prefiksem `plecak:` (m.in. `tasks`, `subjects`, `timetable`, `cards`, `sessions`, `theme`).
- Brak backendu, brak analityki, brak kont. Oceny nie opuszczają urządzenia.
- **Kopia zapasowa:** przycisk „Twoje dane” (sidebar lub stopka) → eksport do pliku JSON i import na innym urządzeniu. Import zastępuje obecne dane i pomija nieznane sekcje.
- **Ochrona:** aplikacja prosi o *trwałe przechowywanie* (`navigator.storage.persist`), a każde odczytanie danych przechodzi walidację — uszkodzony zapis jest naprawiany lub zastępowany wartością domyślną zamiast wywalać interfejs.
- **Awaria:** globalny `ErrorBoundary` pozwala pobrać kopię danych jeszcze przed czyszczeniem.
- **Import z e-dziennika:** domyślnie zakładka-przycisk w przeglądarce (bez instalacji, hasło nigdy nie trafia do Plecaka). Dla pełnej automatyzacji jest też agent (`sync-agent/`), a aplikacja czyta wtedy gotowy plik z `http://127.0.0.1:8787`. Hasło nigdy nie trafia do przeglądarki, klucz parowania zostaje na dysku (`sync-agent/data/`, w `.gitignore`). Szczegóły i ograniczenia: [IMPORT_DZIENNIK.md](./IMPORT_DZIENNIK.md).
- Jedyny zewnętrzny request (poza lokalnym agentem) to czcionki z Google Fonts.

---

## 📱 Na telefonie i tablecie

Plecak jest aplikacją PWA — nie trzeba nic instalować ze sklepu:

- **Android/Chrome:** zakładka „Dziennik” → „Zainstaluj” (albo menu ⋮ → „Dodaj do ekranu głównego”).
- **iPhone/iPad (Safari):** przycisk Udostępnij → „Dodaj do ekranu początkowego”.
- Po instalacji aplikacja otwiera się bez paska przeglądarki, **działa offline** (plan i zadania w autobusie), a długie przytrzymanie ikony pokazuje skróty: **Zadania**, **Plan**, **Dziennik**.
- **„Udostępnij” z innej aplikacji** (np. link albo notatka) tworzy zadanie w Plecaku.
- Plik `.json` z danymi dziennika można otworzyć bezpośrednio w Plecaku („Otwórz za pomocą”), a Plecak pokaże podgląd importu.

## 📋 Import z dziennika w trzech krokach

1. Otwórz dziennik i zaloguj się.
2. Zaznacz całą stronę i skopiuj (`Ctrl`/`⌘`+`A`, potem `Ctrl`/`⌘`+`C`; na telefonie przytrzymaj tekst → „Zaznacz wszystko” → „Kopiuj”).
3. W Plecaku: **Dziennik → Wklej ze schowka** (albo wklej w pole) → sprawdź podgląd → **Zaimportuj**.

Plecak rozpoznaje cztery rzeczy: dokument `plecak-import-v1`, adres z `#dziennik=…`, skopiowaną stronę (HTML) oraz zwykły tekst z ocenami i planem. Nie zgaduje na siłę — jeśli nic nie rozpozna, mówi to wprost, a podgląd pokazuje, co znalazł, przed zapisem.

## 🧪 Testy

```bash
npm test                      # 91 testów aplikacji (Vitest)
node --test                    # 22 testy agenta (w katalogu sync-agent/)
```

Testy agenta sprawdzają podpis RSA żądań (weryfikowany kluczem z certyfikatu), generowanie certyfikatu X.509, mapowanie odpowiedzi dziennika, CORS i lokalny serwer oraz odporność synchronizacji na częściowe błędy.

Testy aplikacji pokrywają logikę, która najłatwiej psuje się po cichu: skalę ocen z plusami/minusami, średnią ważoną i progi oceny końcowej, polską odmianę liczebników, status lekcji (weekend / przed / lekcja / przerwa / po), kalendarz szkolny oraz dekodery danych ze schowka (m.in. normalizację planu do 5 × 8 i odrzucanie uszkodzonych wpisów).

CI (`.github/workflows/ci.yml`) uruchamia `typecheck`, testy i build na każdym Pull Requeście.

## 📋 Stan projektu i plan rozwoju

Projekt jest funkcjonalny i przechodzi `typecheck` + testy + `build`.

- **[REVIEW.md](./REVIEW.md)** — audyt: błędy, dostępność, wydajność, pomysły produktowe, roadmapa.
- **[IMPORT_DZIENNIK.md](./IMPORT_DZIENNIK.md)** — import z eduVULCAN: parowanie urządzenia, format `plecak-import-v1`, zasady scalania, ograniczenia i plan awaryjny.
- **[sync-agent/README.md](./sync-agent/README.md)** — instrukcja agenta synchronizacji (`login`, `sync`, `serve`, `status`).

---

## 🤝 Współpraca

1. `npm install`
2. Utwórz branch: `git checkout -b feat/nazwa-zmiany`
3. Przed commitem: `npm run typecheck && npm run build`
4. Otwórz Pull Request — CI (`.github/workflows/ci.yml`) sprawdzi typy i build.

## Przejście z portalu Rejson

Na `https://rejson59.github.io` dokument rozpoznaje jednorazowy znacznik przejścia i wczytuje animację wyjścia przed startem aplikacji — również wtedy, gdy projekt ma własny service worker. Bez znacznika, w ramce, na innych domenach i przy niedostępnej pamięci sesji kod nie pobiera zasobów portalu. Skrypt nie przenosi kont ani danych między domenami; na innych originach wyjście z portalu nie jest gwarantowane.

Plecak zachowuje własny tryb offline; jego service worker czyści tylko stare cache o prefiksie `plecak-` i przechwytuje POST wyłącznie dla zadeklarowanego w manifeście udostępniania. Nie usuwa cache innych projektów.
