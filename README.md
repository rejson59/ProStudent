# 🎒 ProStudent / Plecak

**Szkolne centrum dowodzenia dla uczniów** — plan lekcji, zadania, oceny, timer fokusu i fiszki w jednej aplikacji. Wszystko działa w przeglądarce, bez konta i bez backendu: dane zapisują się lokalnie w `localStorage`.

> Nazwa „Plecak” to nazwa produktu widoczna w interfejsie. Repozytorium nazywa się ProStudent.

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
| **Globalne** | Paleta poleceń `Ctrl/⌘ + K`, skróty `1–6`, tryb dzień/noc/auto, konfetti, powiadomienia o końcu sesji |

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

---

## 🗂️ Struktura

```
src/
├─ App.tsx                 # nawigacja, motyw, paleta poleceń, timer, toasty
├─ main.tsx
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
│  ├─ store.ts             # useLocal (localStorage) i useNow
│  ├─ data.ts              # typy, dane domyślne, oceny, daty, cytaty
│  ├─ schedule.ts          # logika „jaka lekcja teraz”
│  ├─ useTimer.ts          # timer Pomodoro
│  ├─ audio.ts             # syntezator dźwięków tła (Web Audio API)
│  └─ color.ts / confetti.ts
└─ utils/cn.ts
```

---

## 💾 Dane i prywatność

- Wszystko trzymane jest **wyłącznie lokalnie** w `localStorage` pod prefiksem `plecak:` (m.in. `tasks`, `subjects`, `timetable`, `cards`, `sessions`, `theme`).
- Brak backendu, brak analityki, brak kont. Oceny nie opuszczają urządzenia.
- **Uwaga:** wyczyszczenie danych witryny usuwa wszystko bezpowrotnie. Eksport/import kopii zapasowej jest jednym z pierwszych punktów w [REVIEW.md](./REVIEW.md).
- Jedyny zewnętrzny request to czcionki z Google Fonts.

---

## 📋 Stan projektu i plan rozwoju

Projekt jest funkcjonalny i przechodzi `typecheck` + `build`. Szczegółowy audyt (błędy, dostępność, wydajność, pomysły produktowe, roadmapa) znajduje się w **[REVIEW.md](./REVIEW.md)**.

---

## 🤝 Współpraca

1. `npm install`
2. Utwórz branch: `git checkout -b feat/nazwa-zmiany`
3. Przed commitem: `npm run typecheck && npm run build`
4. Otwórz Pull Request — CI (`.github/workflows/ci.yml`) sprawdzi typy i build.
