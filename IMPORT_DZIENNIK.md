# Import danych z e-dziennika (Vulcan / eduVULCAN / Librus)

**Status:** propozycja architektury · **Data:** 28 października 2026
**Pytanie:** jak przenieść oceny, plan lekcji, sprawdziany i zadania z dziennika szkolnego do Plecaka?

---

## 0. Wnioski w trzech zdaniach

1. **Nie warto ani nie wolno** wpisywać loginu i hasła do dziennika w naszej aplikacji ani pośredniczyć w logowaniu przez własny serwer — Vulcan od 2024 r. **aktywnie blokuje i zawiesza konta** nieoficjalnych klientów, a strony użytkowników nie mają backendu, który mógłby bezpiecznie trzymać sekrety.
2. Najbezpieczniejsza i najbardziej uniwersalna droga to **definicja formatu wymiany** (`plecak-import-v1.json`) plus trzy niezależne sposoby jego wytworzenia: **wklejka/plik**, **asystent w przeglądarce** (bookmarklet na zalogowanej stronie dziennika) i **konwerter CLI** z istniejących eksportów OSS.
3. To realne i tanie: oceny, plan, sprawdziany i zadania domowe mapują się 1:1 na nasz model danych. Import planu lekcji rozwiązuje przy okazji zadanie „edytowalne dzwonki”, bo dziennik podaje **godziny każdej lekcji**.

---

## 1. Stan faktyczny — co trzeba wiedzieć przed pisaniem kodu

### 1.1 Vulcan blokuje nieoficjalnych klientów

- **25 kwietnia 2024** — Wulkanowy (najpopularniejszy otwarty klient) przestał się logować: Vulcan dołożył do odpowiedzi logowania kod, który tylko nieoficjalny klient interpretował jako błąd („No Access”).
- **Lipiec/sierpień 2024** — Szkolny.eu zakończył obsługę dziennika „na zawsze”, Wezuwiusz został zamknięty po pismie od Vulcana.
- **Wrzesień 2026** — projekt vulcan-notify odnotował **zawieszenie kont** przez eduVULCAN w trakcie działania integracji. To nie jest ryzyko teoretyczne.

**Konsekwencja dla nas:** żadnej automatycznej synchronizacji w tle, żadnego logowania z naszej domeny. Ryzyko ponosi użytkownik i musi być o nim uczciwie poinformowany **przed** importem.

### 1.2 Jak dziś działa uwierzytelnianie

| System | Mechanizm | Trudność dla nas |
| --- | --- | --- |
| **UONET+** (`dziennik.vulcan.edu.pl/<symbol>`) | Zwykła sesja w przeglądarce; dane przez same-origin `POST /api/Context`, `/api/PlanZajec`, `/api/SprawdzianyZadaniaDomowe`, `/api/Oceny` | **Niska** — snippet uruchomiony na zalogowanej stronie ma sesję „za darmo” |
| **eduVULCAN** (`uczen.eduvulcan.pl`) | Nowe API mobilne „Hebe”: parowanie urządzenia kluczem **RSA 2048** (JWT z `/api/ap` → `/api/mobile/register/jwt`), każde żądanie podpisane `canonicalUrl + digest + data` (RSA-PKCS#1v1.5-SHA256); alternatywnie cookies sesji webowej | **Wysoka** — wymaga generowania i trzymania klucza; zrobimy to najwyżej w narzędziu lokalnym, nigdy w aplikacji |
| **Librus Synergia** | Brak publicznego API dla ucznia/rodzica; oficjalne eksporty (XML dla szkół, CSV w widokach), istnieją klienci OSS | **Średnia** — realny jest import z pliku |

### 1.3 Co da się zaimportować

| Dane | Vulcan (UONET+/Hebe) | Librus | Nasz model |
| --- | --- | --- | --- |
| Oceny cząstkowe | ✅ wartość, waga, kategoria, data, nauczyciel | ✅ | `Subject.grades[]` |
| Oceny przewidywane/końcowe | ✅ | ⚠️ | (nie importujemy — liczymy sami) |
| Plan lekcji | ✅ z godzinami i salami, także zastępstwa | ✅ | `timetable` + **dzwonki** |
| Sprawdziany / kartkówki | ✅ typ + przedmiot + data | ✅ | `Task.kind` |
| Zadania domowe | ✅ opis + termin | ✅ | `Task` |
| Frekwencja, uwagi, wiadomości | ✅ / 🔒 (wiadomości = Premium) | ✅ | **poza zakresem v1** |

---

## 2. Cztery warianty — porównanie

| # | Wariant | Ryzyko dla konta | Wysiłek | Pokrycie | Werdykt |
| --- | --- | --- | --- | --- | --- |
| **A** | Import pliku: nasz JSON, CSV z ocenami, ICS z planem | **zerowe** | mały | zależne od tego, co uczeń zdoła wyeksportować | ✅ fundament |
| **B** | Asystent w przeglądarce: bookmarklet/snippet na **zalogowanej** stronie dziennika → pobiera `plecak-import.json` | **niskie** (jednorazowo, ręcznie, w własnej sesji, tempo człowieka) | średni | duże (oceny, plan, sprawdziany, zadania) | ✅ rekomendowany |
| **C** | Konwerter CLI z gotowych eksportów OSS (VulcanScope / Hebe JSON / librus-synergia) | **niskie** (użytkownik sam ich używa) | mały | pełne | ✅ dla „power userów” |
| **D** | Logowanie w aplikacji / serwer proxy / auto-sync w tle | **wysokie** (blokady, zawieszenia kont, RODO) | duży | pełne | ❌ odrzucone |

**Rekomendacja: A jako podstawa, B jako główna ścieżka, C jako wsparcie.** Wariant D odpada nie z powodu trudności technicznej, tylko dlatego, że wymagałby trzymania sekretów użytkownika na naszym serwerze — a to dokładnie to, czego ten projekt świadomie unika („wszystko zostaje w przeglądarce”).

---

## 3. Architektura docelowa

Kluczowa decyzja: **nie piszemy integracji z dziennikiem — piszemy format i normalizator.** Dzięki temu każdy adapter (bookmarklet, CLI, ręczny plik) produkuje ten sam dokument, a aplikacja ma tylko jedną ścieżkę importu do przetestowania.

```
┌─────────────────────┐
│ UONET+ bookmarklet  │──┐
├─────────────────────┤  │
│ eduVULCAN snippet   │──┤   plecak-import-v1.json    ┌──────────────┐   ┌─────────────┐
├─────────────────────┤  ├──► (JournalSnapshot) ────► │  normalizer  │──►│   merge     │──► localStorage
│ CLI: VulcanScope    │──┤   wersja + źródło + data    │ (czysta f-cja│   │ (dedup po   │    (schema v3)
├─────────────────────┤  │                             │  + testy)    │   │ externalId) │
│ CSV / ICS / ręczne  │──┘                             └──────────────┘   └─────────────┘
└─────────────────────┘
```

### 3.1 Format wymiany `plecak-import-v1`

```ts
// src/lib/journal/types.ts
export type JournalSource = "uonet" | "eduvulcan" | "librus" | "manual";

export type JournalSnapshot = {
  format: "plecak-import";
  version: 1;
  source: JournalSource;
  exportedAt: string;        // ISO
  student?: { name?: string; className?: string; school?: string };

  grades?: JournalGrade[];
  timetable?: JournalLesson[];   // konkretne daty/godziny, nie siatka
  exams?: JournalExam[];
  homework?: JournalHomework[];
};

export type JournalGrade = {
  externalId: string;        // stabilny ID z dziennika (klucz oceny/kolumny)
  subject: string;
  value: string;             // "5", "5+", "4-" — dokładnie jak w dzienniku
  weight?: number;           // waga kolumny
  category?: string;         // "sprawdzian", "kartkówka", "aktywność"…
  date?: string;             // YYYY-MM-DD
  teacher?: string;
  comment?: string;
};

export type JournalLesson = {
  date: string;              // YYYY-MM-DD
  start: string;             // "08:00"
  end: string;               // "08:45"
  subject: string;
  room?: string;
  teacher?: string;
  canceled?: boolean;
  substitution?: boolean;
};

export type JournalExam = {
  externalId: string;
  subject: string;
  date: string;
  type: "sprawdzian" | "kartkówka" | "praca klasowa" | "odpowiedź" | "inne";
  description?: string;
  teacher?: string;
};

export type JournalHomework = {
  externalId: string;
  subject: string;
  due: string;               // YYYY-MM-DD
  description: string;
  teacher?: string;
};
```

### 3.2 Normalizator — czysta funkcja, w pełni testowalna

```ts
// src/lib/journal/normalize.ts
export type NormalizedImport = {
  subjects: Subject[];       // gotowe do scalenia
  timetable: string[][];     // 5 × N pod nowe dzwonki
  bells: [string, string][]; // wyliczone z planu!
  tasks: Task[];
  warnings: string[];        // np. „pominięto 3 oceny opisowe”
  stats: { grades: number; lessons: number; exams: number; homework: number };
};

export function normalizeSnapshot(snapshot: JournalSnapshot, options?: {
  bells?: [string, string][];       // jeśli użytkownik ma już własne dzwonki
  week?: "A" | "B";                 // dla planów dwutygodniowych
}): NormalizedImport;
```

**Wyliczanie dzwonków z planu** — to największa wartość dodana. Dziennik podaje `start`/`end` każdej lekcji, więc:

1. zbieramy wszystkie pary `(start, end)` z całego tygodnia,
2. sortujemy i usuwamy duplikaty (tolerancja ±5 min na zastępstwa),
3. bierzemy najczęstszy zestaw → to są „dzwonki” szkoły,
4. numer lekcji = pozycja w tym zestawie; plan układamy w siatkę 5 × N.

Efekt: użytkownik nie przepisuje 40 komórek ręcznie, a my dostajemy dane do funkcji „edytowalne dzwonki” z roadmapy.

### 3.3 Scalanie i idempotencja

Największe ryzyko importu to duplikaty: uczeń importuje dane we wrześniu, potem w październiku — i ma każdą ocenę dwa razy.

**Rozwiązanie:** deterministyczne ID i znacznik pochodzenia.

```ts
// ID zależne tylko od źródła i identyfikatora w dzienniku
const localId = (source: JournalSource, externalId: string) =>
  `${source}:${hash31(externalId)}`;

// Grade / Task dostają dwa nowe, opcjonalne pola:
type Origin = {
  source: "manual" | JournalSource;
  externalId?: string;
  importedAt?: string;
};
```

Zasady scalania:

| Sytuacja | Zachowanie |
| --- | --- |
| Element importowany **już istnieje** (to samo `source` + `externalId`) | aktualizacja pól (np. ocena zmieniona w dzienniku), bez duplikatu |
| Element **nie istnieje** | dodanie |
| Element **dodany ręcznie** w Plecaku | nigdy nie ruszamy przy imporcie |
| Element importowany, którego **nie ma już w dzienniku** | zostaje (nie usuwamy danych użytkownika automatycznie) — tylko ostrzeżenie w raporcie |
| Konflikt: ta sama ocena ręczna i importowana | zostają obie, w raporcie „możliwy duplikat” |

To wymaga **migracji schematu do wersji 3** (`DATA_VERSION = 3`): dekodery `decodeSubjects`/`decodeTasks` uzupełniają `origin: { source: "manual" }` dla istniejących wpisów. Mechanizm wersjonowania już mamy, więc to zmiana o kilka linii.

### 3.4 Kreator importu w UI

Zamiast „wrzuć plik i módl się”, trzy kroki:

1. **Źródło** — wybór: „Mam plik z dziennika”, „Uruchom asystenta”, „Wklej dane”.
2. **Podgląd i wybór zakresu** — checkboxy: oceny / plan / sprawdziany / zadania; liczniki „+34 nowe oceny, 2 zaktualizowane, 0 konfliktów”.
3. **Scalenie** — wynik + raport ostrzeżeń + przycisk „Cofnij import” (mamy już infrastrukturę toastów z akcją i kopię zapasową przed importem robioną automatycznie).

---

## 4. Mapowanie danych — szczegóły

### 4.1 Oceny

| Dziennik | Plecak | Uwagi |
| --- | --- | --- |
| `wartość: "5"`, `"5+"`, `"4-"` | `Grade.value` bez zmian | nasz `parseGrade` już to rozumie |
| waga kolumny (np. `3`) | `Grade.weight` | zaokrąglamy do 1–5, poza zakresem → 1 |
| kategoria („sprawdzian”, „kartkówka”) | `Grade.note` | prefiks, np. `sprawdzian · sem. 1` |
| nauczyciel, komentarz | `Grade.note` (sklejone) | limit 200 znaków |
| oceny opisowe („celująco”, „brak zadania”) | **pomijane** | `parseGrade` by je odrzucił; raport pokazuje ile |
| ocena końcowa/przewidywana | **pomijane** | liczymy własną średnią i prognozę |

### 4.2 Plan i dzwonki

| Dziennik | Plecak |
| --- | --- |
| lista lekcji z `data`, `godzinaOd`, `godzinaDo`, `przedmiot`, `sala` | siatka `timetable[dzień][numer]` |
| godziny lekcji | wyliczone `BELLS` (patrz 3.2) |
| okienko (brak lekcji w slocie) | `""` |
| zastępstwo / odwołana lekcja | lekcja z adnotacją; odwołane → `""` + ostrzeżenie |
| nauczyciel, sala | pole opcjonalne w `JournalLesson`; w v1 pomijane w siatce (nasz plan ich nie ma) |

### 4.3 Sprawdziany i zadania → `Task`

| Typ w dzienniku | Nasz `Kind` |
| --- | --- |
| sprawdzian, praca klasowa | `sprawdzian` |
| kartkówka | `kartkówka` |
| odpowiedź, prezentacja, projekt | `projekt` |
| zadanie domowe | `zadanie` |

`title` = opis (obcięty do 200 znaków), `due` = data, `subject` = nazwa przedmiotu, `done` = `false`.

---

## 5. Jak to wygląda dla użytkownika

### Wariant B — asystent w przeglądarce (UONET+)

1. Uczeń loguje się do dziennika **normalnie**, w swojej przeglądarce.
2. Przeciąga na pasek zakładek przycisk **„Plecak: pobierz dane”** (albo wkleja snippet w konsolę — obie opcje muszą być opisane).
3. Snippet czyta **tę samą stronę, na której użytkownik jest zalogowany** (`credentials: "include"`), składa `plecak-import-v1.json` i pobiera plik.
4. W Plecaku: „Twoje dane → Importuj” i plik ląduje w aplikacji.

Cały kod ma ~80 linii i jest w 100% audytowalny — nie wysyła danych nigdzie poza pobranie pliku na dysk.

```js
// szkic dla UONET+ (do dopracowania na realnym API)
(async () => {
  const get = (url, body) =>
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then((r) => r.json());

  const ctx = await get("/api/Context");
  const idDziennik = ctx?.uczniowie?.[0]?.idDziennik;
  const [plan, sprawdziany] = await Promise.all([
    get("/api/PlanZajec", { idDziennik, dataOd: "2026-09-01", dataDo: "2026-10-31", zakresDanych: 2 }),
    get("/api/SprawdzianyZadaniaDomowe", { idDziennik, dataOd: "2026-09-01", dataDo: "2026-10-31" }),
  ]);

  const snapshot = {
    format: "plecak-import",
    version: 1,
    source: "uonet",
    exportedAt: new Date().toISOString(),
    timetable: (plan ?? []).map((l) => ({ date: l.data, start: l.godzinaOd, end: l.godzinaDo, subject: l.przedmiot })),
    exams: (sprawdziany ?? []).filter((s) => s.typ !== 4).map((s) => ({ externalId: String(s.id), subject: s.przedmiotNazwa, date: s.data, type: "sprawdzian" })),
    homework: (sprawdziany ?? []).filter((s) => s.typ === 4).map((s) => ({ externalId: String(s.id), subject: s.przedmiotNazwa, due: s.data, description: "" })),
  };

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "plecak-import.json";
  a.click();
  URL.revokeObjectURL(a.href);
})();
```

> Dla **eduVULCAN** (nowe) ten sam pomysł działa na `uczen.eduvulcan.pl/<tenant>/api/…`, ale trzeba dorzucić token `X-V-RequestVerificationToken` i `Request-Id`/`Request-Timestamp` — to osobny adapter, do napisania po weryfikacji na żywym koncie.

### Wariant C — konwerter CLI

```bash
# Użytkownik robi eksport np. VulcanScope (Python) do data/*.json,
# a my tylko tłumaczymy format — bez logowania, bez kluczy.
node scripts/przygotuj-import.mjs --from vulcanscope --dir ./data --out plecak-import.json
node scripts/przygotuj-import.mjs --from librus-csv --in oceny.csv --out plecak-import.json
```

Zaleta: nasze repo nie zawiera **żadnego** kodu logowania do dziennika. Tylko transformacja plik → plik.

---

## 6. Bezpieczeństwo, prawo i uczciwość wobec użytkownika

| Zasada | Dlaczego |
| --- | --- |
| **Nigdy nie prosimy o login i hasło do dziennika** | nie mamy serwera, nie mamy gdzie ich bezpiecznie trzymać; phishingowy wzorzec |
| **Żadnego proxy ani „synchronizacji w chmurze”** | dane ocen uczniów na naszym serwerze = RODO, odpowiedzialność, koszty |
| **Import wyłącznie na żądanie użytkownika** | Vulcan zawiesza konta za automatyzację; ręczne tempo człowieka minimalizuje ryzyko |
| **Nie obchodzimy płatnych funkcji** (np. wiadomości Premium) | to już nie „własne dane”, a obejście licencji |
| **Ostrzeżenie przed importem** | „Import korzysta z Twojej zalogowanej sesji. Niektóre dzienniki blokują nieoficjalne narzędzia — decyzja i ryzyko po Twojej stronie.” |
| **Zero telemetrii** | import nie może wysyłać nigdzie danych, nawet anonimowo |
| **Kopia przed scaleniem** | automatyczny eksport stanu sprzed importu + „Cofnij import” |

**Uwaga prawna (nie jest to porada prawna):** pobranie *własnych* danych przez zalogowanego użytkownika jest zwykle akceptowane społecznie, ale może naruszać regulamin dziennika. Dlatego: żadnej automatyzacji w tle, żadnego logowania za użytkownika, żadnego hostowanego proxy — a użytkownik dostaje jasną informację przed importem.

---

## 7. Plan wdrożenia

| Etap | Zakres | Efekt | Czas |
| --- | --- | --- | --- |
| **1. Fundament** | typy `JournalSnapshot`, normalizator (oceny, plan, dzwonki, zadania), scalanie z dedup, migracja schematu do v3, testy jednostkowe na danych syntetycznych | każdy plik `plecak-import-v1.json` da się zaimportować | 1–1,5 dnia |
| **2. Kreator w UI** | 3-krokowy import w `DataPanel`, podgląd zakresów, raport, „Cofnij import” | użytkownik widzi, co się zmieni, zanim kliknie | 1 dzień |
| **3. Adapter UONET+** | bookmarklet + strona „Jak to zrobić” (kopiuj/wklej, bez instalacji), weryfikacja na realnym API | główna ścieżka dla większości szkół | 1–2 dni |
| **4. Konwerter CLI** | `scripts/przygotuj-import.mjs` dla eksportów VulcanScope/Hebe i CSV Librusa | pełne pokrycie dla chętnych | 1 dzień |
| **5. Adapter eduVULCAN** | snippet na `uczen.eduvulcan.pl` (token anti-forgery), obsługa błędów i zmian API | nowe szkoły | 2 dni + utrzymanie |
| **6. ICS / plan dwutygodniowy** | import planu z pliku `.ics`, obsługa tygodni A/B | szkoły z planem w kalendarzu | 1–2 dni |

**Kolejność ma znaczenie:** etapy 1–2 są niezależne od tego, czy uda się dogadać z API konkretnego dziennika. Nawet jeśli Vulcan zmieni API za miesiąc, fundament i kreator zostają.

---

## 8. Czego świadomie nie robimy

- ❌ logowania do dziennika w aplikacji,
- ❌ serwera proxy i „synchronizacji w chmurze”,
- ❌ automatycznego odpytywania API w tle (ryzyko zawieszenia konta),
- ❌ importu frekwencji, uwag i wiadomości w v1 (inny model danych, mniejsza wartość),
- ❌ obchodzenia płatnych funkcji eduVULCAN Premium,
- ❌ publikowania gotowych integracji z danymi prawdziwych uczniów w repozytorium (tylko dane syntetyczne w testach).

---

## 9. Co trzeba sprawdzić, zanim napiszemy adaptery

1. **Czy Twoja szkoła używa UONET+ (`dziennik.vulcan.edu.pl`) czy eduVULCAN (`eduvulcan.pl`)?** To determinuje, który adapter ma sens jako pierwszy.
2. Czy w panelu dziennika jest **eksport do CSV/PDF** ocen lub planu — jeśli tak, etap 4 może być jeszcze tańszy.
3. Czy plan lekcji jest **jedno- czy dwutygodniowy**.
4. Czy w szkole są **dzwonki inne niż 45-minutowe** (to i tak rozwiążemy automatem z godzin lekcji).

---

## 10. Źródła

- VulcanScope — pełny eksport eduVULCAN/Hebe, opis parowania kluczem RSA i lista endpointów: https://github.com/PantoYT/VulcanScope
- vulcan-notify — realne doświadczenia z API eduVULCAN, m.in. zawieszenie kont (wrzesień 2026): https://github.com/kintecus/vulcan-notify
- TeleVulcan — przechwycone endpointy UONET+ (`Context`, `PlanZajec`, `SprawdzianyZadaniaDomowe`) i znaczenie `typ` 1–4: https://github.com/Erop4ik/TeleVulcan
- vulcan-api (nieoficjalne API UONET+): https://github.com/kapi2289/vulcan-api
- Historia blokad nieoficjalnych klientów: https://czyvulcanapojebalo.pl/historia
- Blokada Wulkanowego (kwiecień 2024) i praktyki Vulcana: https://consumerrights.wiki/w/EduVULCAN
- librus-synergia — nieoficjalny klient Librusa (zakres danych: oceny, plan, frekwencja): https://github.com/MichalZaniewicz/librus-synergia
