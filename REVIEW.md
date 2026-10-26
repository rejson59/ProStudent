# Przegląd projektu ProStudent / „Plecak”

**Data przeglądu:** 26 października 2026
**Zakres:** cały kod z `creative-student-website-design.zip` (31 plików, 22 pliki źródłowe, ~2 700 linii TS/TSX/CSS)
**Stan wyjściowy:** `npm run typecheck` ✅ · `npm run build` ✅ (338,8 kB HTML, 102,5 kB gzip)

---

## 1. TL;DR

To naprawdę porządny, dopracowany wizualnie projekt. Logika jest sensowna, typy `strict`, brak zbędnych zależności, a warstwa graficzna (niebo zależne od godziny, proceduralny ogród, dźwięki generowane w Web Audio) jest ponadprzeciętna jak na aplikację „dla siebie”.

Największe ryzyko nie leży w kodzie UI, tylko w **warstwie danych**: wszystko żyje wyłącznie w `localStorage`, bez walidacji, bez wersjonowania schematu i bez żadnej kopii zapasowej. Jedno „wyczyść dane witryny” lub drobna zmiana struktury danych w przyszłości = utrata ocen i haseł do planu, ewentualnie biały ekran.

### Ocena

| Obszar | Ocena | Komentarz |
| --- | --- | --- |
| Architektura i typy | 8/10 | Czytelny podział `components` / `lib`, `strict`, brak `any` |
| UI / UX | 8,5/10 | Spójny system wizualny, świetne detale, dobra responsywność |
| Odporność danych | 4/10 | Brak walidacji, migracji, backupu, limitu i obsługi błędów zapisu |
| Dostępność | 5/10 | Kontrasty poniżej AA, brak etykiet, brak `role="dialog"`, brak `aria-live` |
| Wydajność | 6,5/10 | Całe drzewo re-renderuje się co sekundę; ciężkie SVG bez memoizacji |
| Bezpieczeństwo | 7/10 | Zero XSS-ów, zero trackingu, ale przestarzały Vite i zewnętrzne fonty |
| Testy | 0/10 | Brak jakichkolwiek testów i lintera |
| Higiena repo | 3/10 → **8/10** | Brak `.gitignore`, README i CI — dodane w tym PR |

### 8 rzeczy do zrobienia najpierw

1. **Eksport / import kopii zapasowej (JSON)** — najtańsze ubezpieczenie od utraty danych. *(P0)*
2. **Walidacja + wersjonowanie `localStorage` i `ErrorBoundary`** — żeby zły zapis nie kończył się białym ekranem. *(P0)*
3. **Naprawa `mute()` w `Focus.tsx`** — wyciszenie działa tylko dla jednego z czterech dźwięków. *(P1)*
4. **`storage` + `useSyncExternalStore` w `store.ts`** — dwie karty przestaną się nadpisywać. *(P1)*
5. **Kontrasty WCAG AA** — `--color-muted` 3,52:1 i biały tekst na `sage` 3,03:1 nie przechodzą. *(P1)*
6. **Edytowalne dzwonki** — godziny lekcji są zaszyte na sztywno w `data.ts`, a każda szkoła ma inne. *(P1, produkt)*
7. **Testy jednostkowe czystej logiki + ESLint** — `parseGrade`, `weightedAvg`, `lessonStatus`, `schoolYearBounds` to idealni kandydaci. *(P1)*
8. **PWA + GitHub Pages** — aplikacja zyskuje instalację na telefonie i pracę offline, co dla „szkolnego centrum dowodzenia” jest naturalne. *(P2)*

---

## 2. Jak to działa (mapa projektu)

Aplikacja to SPA bez routera — zakładka trzymana jest w `localStorage` (`plecak:tab`), a `App.tsx` renderuje jeden z sześciu ekranów. Nie ma backendu ani kont użytkowników. Cały stan aplikacji to 10 kluczy w `localStorage`:

```
plecak:tab, plecak:theme, plecak:name, plecak:quicknote,
plecak:tasks, plecak:timetable, plecak:subjects, plecak:cards,
plecak:sessions, plecak:focusLen
```

Przepływ: `useLocal(key, default)` → `useState` + `localStorage` + własne zdarzenie `plecak-sync` (żeby dwa komponenty używające tego samego klucza były spójne). `useNow(1000)` w `App.tsx` dostarcza „teraz” do `Dashboard`, `Timetable` i `Sky`.

Bardzo dobre decyzje:

- **Zero zależności runtime** poza czterema paczkami — mały bundle, mała powierzchnia ataku.
- **Deterministyczna grafika** — kwiaty i gwiazdy generowane z ziarna (`mulberry`), więc są stabilne między renderami i zapisywalne jako liczba w `Session.seed`.
- **Dźwięki proceduralne** — brak plików audio, zero reklam i licencji.
- **Spójne tokeny kolorów** w `@theme` + wariant `night`.
- **Paleta poleceń (`Ctrl+K`) i skróty 1–6** — rzadkość w projektach hobbystycznych.
- **`prefers-reduced-motion`** uwzględnione w konfetti.

---

## 3. Błędy

### 3.1 Krytyczne (P0)

#### A. Brak walidacji danych z `localStorage` → ryzyko białego ekranu

`src/lib/store.ts:5-15` robi tylko `JSON.parse` i rzutowanie `as T`. Jeśli w pamięci znajdzie się poprawny JSON o złym kształcie, aplikacja się wywala. Konkretny przykład: `src/components/Timetable.tsx:9` wywołuje `subjectColor(value)`, a `value` pochodzi z `tt[d][l]` (`:97`). Gdy zapisany plan ma krótszy wiersz niż 8 lekcji, `value` jest `undefined`, a `subjectColor` w `data.ts:94` robi `name.trim()` → `TypeError` i cały ekran planu znika. Ten sam problem dotknie każdą przyszłą zmianę struktury (np. dodanie `id` do lekcji).

**Potwierdzone empirycznie** (renderowanie w jsdom z podstawionymi danymi w `localStorage`):

| Zapis w `localStorage` | Wynik |
| --- | --- |
| dane domyślne (5×8) | ✅ renderuje się |
| `timetable` = 5 wierszy × 3 lekcje | 💥 `Cannot read properties of undefined (reading 'trim')` |
| `timetable` = `"zepsute"` | 💥 `row.map is not a function` |
| `tasks` = obiekt | 💥 `tasks.filter is not a function` |
| `tasks` = `null` | 💥 `Cannot read properties of null (reading 'filter')` |
| `subjects` = `"x"` | 💥 `subjects.map is not a function` |

Każdy z tych przypadków to dziś **biały ekran bez komunikatu** — i każdy może się zdarzyć przy przyszłej zmianie formatu danych, ręcznej edycji `localStorage` w DevTools albo nieudanym imporcie.

**Fix (szkic):**

```ts
// lib/schema.ts
export const STORAGE_VERSION = 1;

function parseStored<T>(raw: string | null, fallback: T, validate: (v: unknown) => v is T): T {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as unknown;
    return validate(data) ? data : fallback;
  } catch {
    return fallback;
  }
}

export const isTimetable = (v: unknown): v is string[][] =>
  Array.isArray(v) &&
  v.length === 5 &&
  v.every((row) => Array.isArray(row) && row.every((c) => typeof c === "string"));
```

Plus **normalizacja** planu do 5 × 8 (`row.padEnd(8, "")`) i globalny `ErrorBoundary`, który zamiast białego ekranu pokazuje „Coś poszło nie tak — przywróć dane / wyeksportuj”.

#### B. Brak jakiegokolwiek backupu — dane są jedną akcją od zniknięcia

Komentarz w stopce (`App.tsx:211`) uczciwie mówi, że dane są lokalne, ale nie ma żadnego sposobu, by je przenieść na inne urządzenie ani odzyskać. W praktyce: zmiana telefonu, tryb incognito, czyszczenie przeglądarki, zmiana przeglądarki = koniec.

**Fix (mały, ~100 linii):**

- `Eksportuj dane` → `Blob(JSON.stringify(allKeys))` + `URL.createObjectURL` + `<a download="plecak-backup-YYYY-MM-DD.json">`.
- `Importuj dane` → `<input type="file">` + walidacja + potwierdzenie nadpisania + `location.reload()`.
- Przy okazji: `navigator.storage.persist()` (chroni przed automatycznym czyszczeniem przez przeglądarkę) i ostrzeżenie w UI, gdy `navigator.storage.estimate()` zbliża się do limitu.

#### C. Brak `.gitignore` — **naprawione w tym PR**

`node_modules` (104 MB) i `dist/` były nierozróżnialne od źródeł. Dodano `.gitignore`.

---

### 3.2 Ważne (P1)

#### D. `mute()` wycisza tylko jeden z czterech dźwięków

`src/components/Focus.tsx:21-28`:

```tsx
const setVol = (id: SoundId, v: number) => {
  const next = { ...vols, [id]: v };   // `vols` z bieżącego renderu
  savedVols = next;
  setVols(next);
  ambient.set(id, v);
};
const mute = () => SOUNDS.forEach((s) => setVol(s.id, 0)); // 4× ten sam, stary `vols`
```

Każde z czterech wywołań tworzy obiekt z tego samego, zamkniętego w domknięciu `vols`, więc zapisuje się tylko ostatnia zmiana (`brown: 0`). Audio faktycznie się wycisza (bo `ambient.set` wywołane 4×), ale **suwaki i `savedVols` kłamią** — po powrocie na zakładkę dźwięki „wyglądają” na włączone. `preset()` jest napisany poprawnie, co potwierdza, że to zwykłe przeoczenie.

```tsx
const mute = () => {
  const next: Record<SoundId, number> = { rain: 0, waves: 0, fire: 0, brown: 0 };
  savedVols = next;
  setVols(next);
  SOUNDS.forEach((s) => ambient.set(s.id, 0));
};
```

#### E. Brak synchronizacji między kartami przeglądarki

`store.ts:3` i `:22` słuchają własnego zdarzenia `plecak-sync`, a nie natywnego zdarzenia `storage`. Dwie karty otwarte obok siebie nie widzą swoich zmian i **nadpisują się nawzajem** — wystarczy dodać zadanie w karcie A, potem w karcie B, i zadanie z A przepada (B zapisało stan sprzed zmiany).

**Fix:** nasłuchiwać `window.addEventListener("storage", ...)` (dostaje `key`, `newValue`) i dodatkowo wewnętrznego zdarzenia. Docelowo warto przepisać `useLocal` na `useSyncExternalStore` z jednym magazynem na klucz — rozwiązuje to jednocześnie problem F i G.

#### F. Efekty uboczne wewnątrz updatera `setState`

`store.ts:28-37` — `localStorage.setItem` i `dispatchEvent` są wywoływane w funkcji przekazanej do `setVal`. W `StrictMode` (a `main.tsx` go używa) React wywołuje updatery **dwukrotnie**, więc zapis i zdarzenie lecą dwa razy. Do tego dochodzi wyścig: gdy dwa komponenty zmodyfikują `tasks` w tym samym takcie, drugi zapis nadpisze pierwszy (last-write-wins), bo oba startują ze swoich lokalnych kopii stanu.

**Fix:** jeden magazyn `Map<string, unknown>` + `listeners`, zapis poza updaterem, `useSyncExternalStore` w hooku.

#### G. `new Notification()` może rzucić wyjątkiem

`App.tsx:55-57` — sprawdzone jest tylko `"Notification" in window` i uprawnienie. Na Safari/iOS konstruktor `Notification` nie istnieje (mimo że API uprawnień jest), więc dostajemy `TypeError: Illegal constructor` w momencie zakończenia sesji. Powinno być:

```ts
try {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Plecak", { body: ... });
  }
} catch { /* powiadomienia niedostępne */ }
```

Alternatywa docelowa: `ServiceWorkerRegistration.showNotification()` (działa też na Androidzie i po zamknięciu karty).

#### H. Toast: wyścig timerów

`App.tsx:38-41` — każde wywołanie `showToast` tworzy nowy `setTimeout` bez czyszczenia poprzedniego. Dwa toasty w odstępie 1 s → pierwszy timer gasi drugi toast po 2,2 s zamiast 3,2 s. Brak też czyszczenia przy odmontowaniu.

**Fix:** `const toastTimer = useRef<number>()`, `clearTimeout(toastTimer.current)` przed ustawieniem nowego + cleanup w `useEffect`.

#### I. Timer: brak persystencji i guardu przed podwójnym zakończeniem

`src/lib/useTimer.ts:23-45` — `endAt` i `mode` żyją tylko w stanie Reacta:

- odświeżenie strony w połowie sesji **kasuje timer** (ogród i statystyki zostają, sesja nie),
- przy przejściu karty w tło `setInterval` jest dławiony do ~1/min (Chrome), więc licznik „skacze” przy powrocie — na szczęście czas liczony jest z `Date.now()`, więc wartość jest poprawna, ale powiadomienie i chime mogą przyjść z opóźnieniem,
- brak flagi „już zakończono”; przy dwóch tickach przed re-renderem `onFinish` może odpalić się dwukrotnie (podwójny kwiat i podwójna sesja).

**Fix:** zapisywać `{ mode, endAt, cycles }` w `localStorage` i odtwarzać przy starcie (z obsługą „koniec minął, gdy karta była zamknięta”); dodać `const finished = useRef(false)`.

#### J. `key={tab}` na `<main>` resetuje cały stan zakładek

`App.tsx:203`. Trik z `key` ładnie odtwarza animację `rise`, ale przy okazji **odmontowuje zakładkę**: filtr zadań wraca do „Do zrobienia”, talia i aktualna fiszka się gubią, seria fiszek się zeruje. Do tego każda zmiana zakładki od nowa czyta `localStorage` i renderuje całą tablicę.

**Fix:** animacja na wewnętrznym wrapperze z `key={tab}` w środku, a stan filtrów/talii podnieść wyżej lub trzymać w URL/localStorage.

#### K. Usuwanie danych jednym kliknięciem, bez cofnięcia

`Grades.tsx:65-66` — klik w ocenę **natychmiast ją usuwa** (dopiero tooltip po najechaniu mówi o tym). Fiszka: `Flashcards.tsx` „usuń bieżącą fiszkę” bez potwierdzenia. Zadanie: ikona kosza bez potwierdzenia. W aplikacji, w której oceny są jedyną nieodtwarzalną danymi, brak „Cofnij” jest realnym problemem.

**Fix:** toast z akcją „Cofnij” (5 s) — wystarczy trzymać ostatnio usunięty obiekt w stanie; w ostateczności `confirm()`.

#### L. Stałe `id` w SVG

`Sky.tsx` (`sunglow`, `moonglow`, `moonmask`) i `Garden.tsx` (`soil`) używają globalnych identyfikatorów. Dziś działa, bo każdy z nich jest na stronie raz, ale pierwsze użycie dwóch ogrodów (np. miniatura w nagłówku) spowoduje, że gradienty się pomieszają. `useId()` z Reacta załatwia temat. Przy okazji: `moonmask` jest zdefiniowany i nigdy nie użyty.

#### M. Losowe `id` przy każdym odczycie danych domyślnych

`defaultTasks()` i `defaultCards()` (`data.ts:170`, `:192`) generują nowe `uid()` przy każdym wywołaniu. Ponieważ `useLocal("tasks", defaultTasks)` występuje w `App.tsx`, `Dashboard.tsx` i `Tasks.tsx`, **zanim cokolwiek zostanie zapisane, każdy komponent ma inne „te same” dane** (te same tytuły, inne identyfikatory). Po pierwszym zapisie stan się wyrównuje, ale to kruche.

**Fix:** generować dane domyślne raz i zapisywać je do `localStorage` przy pierwszym uruchomieniu (funkcja `bootstrap()` w `main.tsx`) — wtedy wszystkie komponenty czytają ten sam zapis.

---

### 3.3 Drobne (P2)

| # | Problem | Lokalizacja | Uwaga |
| --- | --- | --- | --- |
| N | `confirm()` / `alert()` natywne | `Timetable.tsx:66`, `Grades.tsx:94` | Blokują UI, wyglądają obco; własny dialog lub toast z „Cofnij” |
| O | Brak edycji zadania / oceny / fiszki | `Tasks.tsx`, `Grades.tsx`, `Flashcards.tsx` | Tylko „usuń i dodaj od nowa” |
| P | Listener `keydown` bez tablicy zależności | `Flashcards.tsx:47-59` | Rejestracja przy każdym renderze; wydzielić `useEffect(..., [flipped, current])` |
| Q | `setTimeout` bez cleanupu | `Flashcards.tsx:44` | `setState` po odmontowaniu |
| R | `pick()` może zwrócić `undefined` | `Flashcards.tsx:8-17` | Dla pustej listy `return pool[0]` → crash przy `pick([]).id` |
| S | Wybór przedmiotu nie odświeża się po zmianie planu | `Tasks.tsx` (`useState(subjects[0])`) | Jeśli użytkownik zmieni plan, select zostaje na starym |
| T | `"auto"` motyw ignoruje system | `App.tsx:63` | Warto dodać `prefers-color-scheme` jako źródło |
| U | Twarde kolory w motywie nocnym | `Dashboard.tsx:319` (karta cytatu), `:225` (`text-[#b7862a]`) | Karta cytatu świeci jasno w nocy, kontrast tekstu 1,76:1 |
| V | `sessions` rosną bez końca | `Focus.tsx`, `Dashboard.tsx` | Każda sesja ~70 B, więc limit 5 MB to ~70 tys. wpisów — ryzyko odległe, ale `filter` po sesjach jest O(n) przy każdym ticku; warto agregować po dniu |
| W | Brak obsługi błędów `AudioContext` | `lib/audio.ts:10-20` | `new AudioContext()` może rzucić lub `resume()` odrzucić promise (autoplay policy) |
| X | Generowanie 5–7 s buforów w wątku głównym | `lib/audio.ts:26-60` | kilkaset tysięcy próbek na jeden łańcuch (0,5–0,8 mln) → możliwe zacięcie kilkudziesięciu milisekund |
| Y | Brak `type="button"` w części przycisków w formularzach | `ui.tsx` `Btn` | `Btn` nie ustawia domyślnie `type="button"`; w formularzach może wysyłać |
| Z | `Sky` liczy gradient i 60 gwiazd przy każdym ticku | `Sky.tsx` + `App.tsx:29` | patrz sekcja Wydajność |
| AA | Wszystkie zakładki w jednym bundlu | `App.tsx` | Przy tym rozmiarze bez znaczenia; `React.lazy` dopiero po rezygnacji z single-file |

---

## 4. Bezpieczeństwo i prywatność

**Dobre:**
- Zero `dangerouslySetInnerHTML`, zero `eval`, zero zewnętrznych skryptów.
- Brak analityki, telemetrii i reklam — deklaracja „wszystko lokalnie” jest prawdziwa.
- Zależności przypięte dokładnymi wersjami, `package-lock.json` w repo, brak duplikatów w drzewie.

**Do poprawy:**

1. **Vite 7.3.2 → 7.3.7** — `npm audit` zgłaszał 7 podatności (m.in. cross-origin script execution przez custom middleware, bypass `server.fs.deny`). **Naprawione w tym PR**; został już tylko niski problem `esbuild` dotyczący dev-serwera na Windows.
2. **Google Fonts** (`index.html:8-10`) — jedyny zewnętrzny request. Z punktu widzenia RODO to przekazanie IP i nagłówka `Referer` do Google; bez internetu fonty się nie wczytają i wygląd się psuje. Rekomendacja: `@fontsource/fraunces` + `@fontsource/plus-jakarta-sans` (self-host, ~2 pliki woff2) albo `font-display: swap` z systemowym fallbackiem.
3. **Brak CSP** — przy buildzie single-file można dodać `<meta http-equiv="Content-Security-Policy">` z `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'`. Warto, jeśli aplikacja trafi na Pages.
4. **Dane wrażliwe w `localStorage`** — imię, oceny, notatki. To akceptowalne dla narzędzia lokalnego, ale warto to jasno komunikować (jest w stopce) i nie dodawać żadnych skryptów third-party w przyszłości.
5. **`Notification.requestPermission()`** wywoływane bez informacji zwrotnej — użytkownik nie wie, czy się udało (`App.tsx:126`). Warto pokazać toast z wynikiem.
6. **Brak Dependabot/Renovate** — przy 4 zależnościach runtime to 5 minut konfiguracji i stała ochrona przed kolejnym „Vite 7.3.2”.

---

## 5. Dostępność (WCAG 2.1 AA)

To najmocniejszy obszar do poprawy po danych. Zmierzone kontrasty (obliczone dla faktycznych tokenów z `src/index.css`):

| Element | Kolory | Kontrast | Wymóg AA (14 px) | Wynik |
| --- | --- | --- | --- | --- |
| `--color-muted` na `--color-paper` | `#847c86` / `#f5efe4` | **3,52:1** | 4,5:1 | ❌ |
| `--color-muted` na `--color-card` | `#847c86` / `#fffaf3` | **3,88:1** | 4,5:1 | ❌ |
| Biały tekst na `--color-clay` (przycisk Start) | `#fff` / `#e07a5f` | **2,95:1** | 4,5:1 | ❌ |
| Biały tekst na `--color-sage` („Umiem!”) | `#fff` / `#6f9f7e` | **3,03:1** | 4,5:1 | ❌ |
| Biały tekst na karcie cytatu | `#fff` / `#eebc55` | **1,76:1** | 4,5:1 | ❌ |
| `--color-muted` na `--color-paper` (noc) | `#9893aa` / `#121420` | 6,18:1 | 4,5:1 | ✅ |
| `--color-ink` na `--color-paper` (dzień) | `#2d2a32` / `#f5efe4` | 12,32:1 | 4,5:1 | ✅ |

**Najprostsze poprawki:**

- `--color-muted: #847c86` → `#6f6771` (daje **4,76:1** na papierze i **5,25:1** na karcie) — zmiana jednej linii w `index.css:11`.
- Na kolorowych tłach (`clay`, `sage`, `lav`, `rose`, `butter`) zamiast białego tekstu użyć `--color-ink`: **ciemny tekst przechodzi 4,5:1 na każdym z nich** (4,54–8,03:1). Alternatywa: przyciemnić tła przycisków o ~20%.
- Karta „Myśl dnia” (`Dashboard.tsx:319`) — ograniczyć gradient do `lav → rose`, bez `butter`, albo dać ciemny tekst; w motywie nocnym użyć ciemniejszej wersji gradientu.

**Poza kolorem:**

1. **Zero `<label>` w całym projekcie** — suwaki głośności, `select` z wagą oceny, `input type="date"`, pola formularzy nie mają powiązanych etykiet. Screen reader czyta „suwak, 50%” bez kontekstu. Fix: `<label htmlFor>` + `id` lub `aria-label`.
2. **Paleta poleceń nie jest dialogiem** — brak `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, pułapki focusa i przywrócenia focusa po zamknięciu (`CommandPalette.tsx:37`). Escape działa tylko, gdy focus jest w inpucie.
3. **Toasty bez `aria-live`** (`App.tsx:228`) — użytkownik czytnika nie dowie się o „Dodano zadanie” ani o końcu sesji. Dodaj `role="status" aria-live="polite"`.
4. **Animacje nie respektują `prefers-reduced-motion`** — `rise`, `drift`, `twinkle`, `sway`, `sprout` i `animate-pulse` chodzą zawsze; tylko konfetti sprawdza preferencję (`confetti.ts:4`). Dodaj globalny blok:

   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
   }
   ```

5. **Widoczny focus** — większość przycisków polega na domyślnym obrysie, ale `input` ma własny styl bez `:focus-visible`; warto ujednolicić.
6. **Cele dotykowe** — dolna nawigacja mobilna ma 6 pozycji; przy 320 px szerokości każda ma ~50 px, ale wysokość ikony z podpisem jest na granicy 44 px. Rozważ 5 pozycji + „Więcej”.
7. **`Icon` bez `aria-hidden="true"`** — atrybut jest jako boolean (`Icon.tsx:31`), co React renderuje jako `aria-hidden="true"`, więc OK; ale ikony w przyciskach bez tekstu wymagają `aria-label` (część ma, np. `Focus.tsx:143`, część nie).

---

## 6. Wydajność

1. **Globalny tick co sekundę.** `useNow(1000)` w `App.tsx:29` re-renderuje całe drzewo, w tym `Sky` (60 gwiazd + 3 chmury + gradienty), `Garden` (do 40 kwiatów, każdy z własnym `mulberry`) i cały plan lekcji. Przy otwartej zakładce Fokus dzieje się to non-stop, mimo że zegar jest potrzebny tylko na Pulpicie. **Fix:** `React.memo` na `Sky`/`Garden`, kontekst „minuta” dla statusu lekcji, a sekundowy zegar wydzielić do małego komponentu. Zysk: mniej pracy na klatkę i mniejsze zużycie baterii na telefonie.
2. **Generowanie szumu w wątku głównym** (`audio.ts:26-60`) — 5 s stereo 48 kHz to ~1,3 mln próbek z filtrami IIR w JS. Pierwsze włączenie deszczu może zauważalnie zacząć klatkować. Fix: `OfflineAudioContext` przy `requestIdleCallback` albo Web Worker; bufory można też cache'ować.
3. **`Garden` przelicza kwiaty przy każdym renderze** — `mulberry` i pętla 26 źdźbeł; wynik nie zależy od niczego poza `sessions`, więc `useMemo`/`React.memo` wystarczy.
4. **`Flashcards` rejestruje globalny listener przy każdym renderze** (`:47-59`) — przy animacji flipa to kilkadziesiąt add/remove na sekundę. Dodaj tablicę zależności.
5. **Bundle:** 338,8 kB / 102,5 kB gzip w jednym pliku HTML. Jak na Reacta bardzo dobrze, ale single-file wyłącza cache'owanie między deployami (każdy deploy to nowy plik do pobrania). Warto mieć dwa cele builda: `dist/` (SPA z hashowanymi assetami) i `dist-single/` (offline).
6. **`sessions` bez limitu** — patrz V. Z czasem `filter` po sesjach na Pulpicie i w Fokusie robi się O(n) przy każdym ticku.
7. **Brak `React.lazy`** — niepotrzebne przy jednym pliku; ma sens dopiero po punkcie 5.

---

## 7. UX i pomysły produktowe

Uporządkowane według stosunku efektu do nakładu. Kolumna „Nakład” to orientacyjny czas dla jednej osoby znającej kod.

### Wysoki efekt / niski nakład

| Pomysł | Dlaczego | Nakład |
| --- | --- | --- |
| **Eksport/import JSON + `storage.persist()`** | Ubezpieczenie od utraty wszystkiego | 2–3 h |
| **Toast „Cofnij” po usunięciu** | Eliminuje najczęstszą pomyłkę | 1–2 h |
| **Edytowalne dzwonki** (godziny + liczba lekcji) | Dziś 8:00–15:20 na sztywno; w wielu szkołach lekcje zaczynają się 7:10 albo 8:50, są 45/40-minutowe i krótsze przerwy | 3–4 h |
| **Motyw „system”** | `prefers-color-scheme` to standard, a „auto” po godzinie zaskakuje w pochmurny dzień | 30 min |
| **Globalny wskaźnik dźwięków tła** | Dziś można włączyć deszcz i wyjść z Fokusu — gra dalej, a jedyny „stop” jest w palecie | 1 h |
| **Notatka per przedmiot / lekcja** | „Szybka notatka” jest jedna i globalna | 2 h |
| **Skrót `?` z listą skrótów** | Odkrywalność `Ctrl+K` i `1–6` | 30 min |
| **Sortowanie/priorytet zadań** | Obecnie tylko po dacie; „na jutro” bywa mniej ważne niż „na dziś, ale małe” | 3 h |

### Wysoki efekt / średni nakład

| Pomysł | Dlaczego | Nakład |
| --- | --- | --- |
| **PWA + offline + instalacja** (manifest, service worker, ikony) | Aplikacja szkolna musi działać w autobusie i bez zasięgu; instalacja na ekranie głównym zmienia charakter produktu | 1 dzień |
| **Powiadomienia o sprawdzianach** (T-1 dzień, rano) | Dziś powiadomienia są tylko o końcu timera, czyli o najmniej ważnej rzeczy | 1 dzień |
| **Widok kalendarza miesięcznego** | Zadania + sprawdziany + plan w jednej siatce; dziś lista jest dobra, ale kalendarz odpowiada na pytanie „co mnie czeka w tym tygodniu” | 2 dni |
| **Import planu lekcji** (CSV/ICS, wklejka z Librusa/Idziennika) | Ręczne wpisanie 40 komórek to główna bariera wejścia | 2–3 dni |
| **Tryb tygodni A/B** | W wielu szkołach plan się powtarza co dwa tygodnie | 1 dzień |
| **Undo/redo + historia zmian** | Ochrona przed pomyłkami w ocenach | 1 dzień |
| **Tryb egzaminacyjny** (licznik + blokada rozpraszaczy + wynik) | Naturalne rozszerzenie Fokusu i Fiszek | 2 dni |
| **Tygodniowy cel minut + heatmapa nauki** | Motywacja; dane już są w `sessions` | 1 dzień |

### Wysoki efekt / wysoki nakład

| Pomysł | Dlaczego | Nakład |
| --- | --- | --- |
| **Opcjonalna synchronizacja (Supabase + logowanie)** | Backup i wiele urządzeń; wymaga konta, RLS i polityki prywatności. Można zostawić „local-first” i sync jako opcję | 3–5 dni |
| **Współdzielenie planu linkiem / eksport do PDF** | Wymiana z kolegami z klasy | 2 dni |
| **Import ocen i frekwencji z e-dziennika** | Największy „wow”, ale zależny od API/regulaminu szkoły | ryzykowne |
| **Aplikacja mobilna (Capacitor)** | PWA zwykle wystarcza; native dopiero gdy potrzebne powiadomienia w tle | 1–2 tyg. |

### Rzeczy, których świadomie **nie** warto robić

- **Backend z pełnym kontem na start** — psuje największą zaletę (zero rejestracji, zero danych na serwerze). Sync powinien być opcją, nie wymogiem.
- **Więcej animacji** — projekt jest blisko granicy „ładnie” vs „przesada”; kolejne efekty będą kosztować wydajność i dostępność.
- **Zewnętrzne biblioteki UI** — obecny system tokenów jest spójny; shadcn/Radix miałyby sens tylko punktowo (dialog, tooltip), nie globalnie.

---

## 8. Architektura i jakość kodu

**Co uporządkować:**

1. **`lib/data.ts` robi za dużo** (207 linii) — typy, dane domyślne, matematyka ocen, daty, kalendarz szkolny i cytaty. Podział: `lib/types.ts`, `lib/defaults.ts`, `lib/grades.ts`, `lib/dates.ts`, `lib/quotes.ts`.
2. **`Dashboard.tsx` ma 17 kB i 9 sekcji** — warto wyciągnąć karty (`HeroCard`, `NowCard`, `TodayPlan`, `Upcoming`, `AverageCard`, `GardenCard`, `Countdown`, `QuickNote`, `QuoteCard`). Ułatwi to memoizację i testy.
3. **`store.ts` do przepisania** na `useSyncExternalStore` + walidacja + wersjonowanie (patrz A, E, F). To jeden plik, a załatwia trzy problemy P0/P1.
4. **Alias `@/` istnieje w `tsconfig` i `vite.config`, ale nie jest używany ani razu** — albo używać go konsekwentnie, albo usunąć (martwa konfiguracja).
5. **`// eslint-disable-next-line react-hooks/exhaustive-deps`** (`App.tsx:130`) — w projekcie nie ma ESLinta, więc komentarz nic nie robi, a ukrywa realne ryzyko (brak `timer` w zależnościach). Warto dodać `eslint` + `eslint-plugin-react-hooks` i zobaczyć, co wyskoczy.
6. **Brak `ErrorBoundary`** — przy błędzie w jednym komponencie użytkownik dostaje pustą stronę bez informacji, gdzie są jego dane.
7. **Brak warstwy „repozytorium”** — komponenty bezpośrednio znają klucze `localStorage`. Wydzielenie `TaskRepo`, `SubjectRepo` itd. dałoby jedno miejsce na migracje i walidację.
8. **Testy** — `vitest` + 50 linii testów pokryłoby większość logiki bez DOM:
   - `parseGrade`: `"5"`, `"5+"`, `"4-"`, `"6"`, `"7"` → `null`, `"abc"` → `null`, `" 3 "` → `3`.
   - `weightedAvg` / `predicted`: progi 1,75 / 2,75 / 3,75 / 4,75 / 5,5.
   - `lessonStatus`: weekend, przed pierwszą, w lekcji, na przerwie, po ostatniej, okienko.
   - `schoolYearBounds`: wrzesień, styczeń, czerwiec, wakacje.
   - `plural`: 0, 1, 2–4, 12–14, 22.

---

## 9. Repozytorium i proces

| Element | Stan | Rekomendacja |
| --- | --- | --- |
| `.gitignore` | ❌ → ✅ | Dodane w tym PR (node_modules, dist, env, edytory) |
| README | 2 linijki → ✅ | Rozbudowane: funkcje, stack, start, struktura, prywatność |
| CI | ❌ → ✅ | `.github/workflows/ci.yml`: `npm ci` + typecheck + build na PR |
| `package.json` | `react-vite-tailwind`, 0.0.0 → ✅ | `prostudent@0.1.0`, opis, `engines`, skrypt `typecheck` |
| Audyt zależności | 2 podatności (1 high) → ✅ | Vite 7.3.2 → 7.3.7; został tylko low w `esbuild` (Windows, dev) |
| Testy | ❌ | `vitest` + kilka testów logiki |
| Linter | ❌ | ESLint 9 flat config + `eslint-plugin-react-hooks` + Prettier |
| Licencja | ❌ | Decyzja właściciela; dla projektu publicznego MIT lub „all rights reserved” |
| Dependabot | ❌ | `.github/dependabot.yml` (npm, weekly) |
| GitHub Pages | ❌ | Workflow `deploy-pages` — build jest jednym plikiem HTML, więc wdrożenie jest trywialne |
| ZIP w repo | ⚠️ | `creative-student-website-design.zip` (212 kB) duplikuje źródła; po scaleniu PR można usunąć |
| Opis repo | ✅ | „Strona stworzona dla uczniów…” — warto dopisać technologię i link do demo |
| Templates | ❌ | `PULL_REQUEST_TEMPLATE.md`, szablony issue (bug / pomysł) |

**Kolejność wdrożenia:**

1. Merge tego PR (źródła + README + `.gitignore` + CI + poprawka Vite).
2. Włączenie GitHub Pages → działające demo pod `https://rejson59.github.io/ProStudent/`.
3. Sprint poprawek P0/P1 z sekcji 3.
4. Dostępność (sekcja 5) + testy + linter.
5. PWA i powiadomienia.

---

## 10. Sugerowany plan pracy

| Sprint | Zakres | Efekt | Czas |
| --- | --- | --- | --- |
| **0 — dziś** | `.gitignore`, README, CI, Vite 7.3.7, `mute()`, `try/catch` powiadomień, timer toastu | Repo gotowe, 3 realne błędy mniej | ~2 h |
| **1 — dane** | `store.ts` na `useSyncExternalStore`, walidacja + wersja schematu, `ErrorBoundary`, eksport/import, `storage.persist` | Koniec ryzyka utraty danych i białych ekranów | 1 dzień |
| **2 — dostępność** | kontrasty, etykiety, dialog palety, `aria-live`, `prefers-reduced-motion` | AA w praktyce, lepsze SEO i UX | 1 dzień |
| **3 — produkt** | edytowalne dzwonki, „Cofnij”, edycja zadań, motyw systemowy, wskaźnik dźwięków | Aplikacja „do użycia”, nie tylko „do pokazania” | 2–3 dni |
| **4 — dystrybucja** | PWA + offline, GitHub Pages, powiadomienia o sprawdzianach | Instalacja na telefonie, realna codzienna wartość | 2 dni |
| **5 — skala** | kalendarz miesięczny, import planu, tygodnie A/B, heatmapa | Wyróżnik na tle prostych „todo list” | 1 tydzień |

---

## 11. Co zostało zmienione w tym PR

**Dodane:**
- `.gitignore` — `node_modules`, `dist`, env, pliki edytorów.
- `README.md` — pełna dokumentacja projektu (funkcje, stack, start, struktura, prywatność, plan).
- `.github/workflows/ci.yml` — typecheck + build na każdym PR.
- `REVIEW.md` — ten dokument.

**Zmienione:**
- `package.json` — nazwa `prostudent`, wersja `0.1.0`, opis, `engines.node >= 20.19`, skrypt `typecheck`.
- `vite` 7.3.2 → 7.3.7 (naprawa 7 podatności z `npm audit`, w tym jednej wysokiej).

**Nie zmienione (świadomie):** kod aplikacji. Ten PR jest „importem + dokumentacją”, żeby zmiany funkcjonalne dały się przeglądać osobno. Poprawki z sekcji 3 mogę wdrożyć w kolejnym PR.

---

## 12. Weryfikacja

```bash
npm ci
npm run typecheck   # ✅ bez błędów
npm run build       # ✅ dist/index.html, 338,82 kB (102,51 kB gzip)
npm audit           # ⚠️ 1 low (esbuild, dev server na Windows) — bez wpływu na produkcję
```

Dodatkowo przeprowadzono dymny test renderowania (React `renderToString` + jsdom + `vite.ssrLoadModule`) dla wszystkich sześciu zakładek na danych domyślnych:

```
OK  home    OK  plan    OK  tasks    OK  grades    OK  focus    OK  cards
```

Wszystkie zakładki renderują się poprawnie na poprawnych danych — problem z sekcji 3.1 A dotyczy wyłącznie danych uszkodzonych lub w starym formacie.

---

## 13. Podsumowanie w jednym akapicie

Projekt jest bliżej „gotowego produktu” niż typowego repozytorium-zabawki: przemyślany design, sensowna architektura, zero zbędnych zależności i kilka naprawdę ładnych pomysłów (ogród z sesji, niebo zależne od godziny, proceduralne dźwięki). Żeby jednak komuś realnie służył przez cały rok szkolny, trzeba go opancerzyć w warstwie danych — walidacja, wersjonowanie, backup i obsługa błędów to obecnie jedyna poważna luka. Po niej zostaje już tylko dostępność (kontrasty i etykiety) oraz dystrybucja (PWA, Pages). Reszta to rozszerzanie pomysłów, a nie naprawianie fundamentów.
