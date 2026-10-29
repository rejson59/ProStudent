import { decodeSnapshotParam } from "./hash";
import { decodeSnapshot, type JournalExam, type JournalGrade, type JournalLesson, type JournalSnapshot } from "./types";

/**
 * Rozpoznawanie tego, co użytkownik wklei.
 *
 * Najprostsza możliwa instrukcja na każdym urządzeniu brzmi: „zaznacz w
 * dzienniku wszystko, skopiuj i wklej tutaj”. Nie każdy umie dodać zakładkę,
 * a na telefonie nie ma paska zakładek — kopiowanie i wklejanie ma każdy.
 *
 * Kolejność: dokument JSON → adres z `#dziennik=` → tekst strony (HTML albo
 * czysty tekst). Rozpoznawanie tekstu jest celowo ostrożne: lepiej pokazać
 * mniej i powiedzieć „sprawdź”, niż dorysować oceny, których nie ma.
 */

export type PasteKind = "json" | "link" | "html" | "text";

export type Recognition = {
  snapshot: JournalSnapshot;
  kind: PasteKind;
  /** Po ludzku: co rozpoznano i na co uważać. */
  notes: string[];
};

const MAX_INPUT = 500_000;

const STOP_WORDS = new Set(
  [
    "plan lekcji",
    "plan zajęć",
    "oceny",
    "ocena",
    "dziennik",
    "dziennik lekcyjny",
    "frekwencja",
    "wiadomości",
    "uczeń",
    "uczennica",
    "semestr",
    "semestry",
    "średnia",
    "zadania",
    "zadania domowe",
    "sprawdziany",
    "kartkówki",
    "ogłoszenia",
    "uwagi",
    "informacje",
    "statystyki",
    "szkoła",
    "klasa",
    "wychowawca",
    "rodzic",
    "ustawienia",
    "wyloguj",
    "pomoc",
    "profil",
    "konto",
    "eduvulcan",
    "vulcan",
    "uonet",
    "lekcja",
    "lekcje",
    "sala",
    "rok szkolny",
    "strona",
    "numer",
    "punkty",
    "punkt",
    "godzina",
    "termin",
    "data",
    "wpis",
    "wpisy",
  ].map((word) => word.toLowerCase())
);

const EXAM_WORDS = /sprawdzian\p{L}*|kartk[oó]wk\p{L}*|praca klasowa|test\p{L}*|odpowied[zź]\p{L}*|wypowied[zź]\p{L}*/iu;

const WEEKDAYS = [
  ["poniedziałek", "poniedzialek", "pon"],
  ["wtorek", "wt"],
  ["środa", "sroda", "śr", "sr"],
  ["czwartek", "czw"],
  ["piątek", "piatek", "pt"],
  ["sobota", "sob"],
  ["niedziela", "niedz"],
];

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** „5+”, „4-”, „np”, „bz” — dokładnie to, co stoi w dzienniku. */
const GRADE = /^(?:[1-6][+\-−]?|np|bz|nb)$/i;
const normalizeGrade = (token: string) => token.replace("−", "-").toLowerCase();

const hasDigits = (value: string) => /\d/.test(value);

/**
 * Wyrzuca z wiersza rzeczy, które tylko wyglądają jak ocena: datę wpisu,
 * wagę („waga 2”) i godziny. Bez tego „5 12.10.2026 waga 2” dawałoby
 * dodatkową dwójkę, której w dzienniku nie ma.
 */
function stripGradeNoise(line: string): string {
  return line
    .replace(/\b(?:waga|wadze|kategoria|kat\.?)\s*:?\s*\d+[.,]?\d*/gi, " ")
    .replace(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ");
}

/** Nazwa przedmiotu: z wielkiej litery, bez cyfr, 3–40 znaków, nie nagłówek strony. */
function looksLikeSubject(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > 40) return false;
  if (hasDigits(text)) return false;
  if (!/^[\p{Lu}]/u.test(text)) return false;
  if ((text.match(/\p{L}/gu) ?? []).length < 3) return false;
  if (STOP_WORDS.has(text.toLowerCase())) return false;
  return /^[\p{L}\s.\-–]+$/u.test(text);
}

/** Zamienia HTML (np. skopiowaną tabelę ze strony) na tekst z podziałem na komórki i wiersze. */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|header|footer|table|ul|ol|dd|dt)>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, " ");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&oacute;/gi, "ó")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));

  return text;
}

type Draft = {
  grades: JournalGrade[];
  timetable: JournalLesson[];
  exams: JournalExam[];
  withoutDay: number;
};

/**
 * Rozbiera skopiowany tekst na oceny, plan i sprawdziany.
 *
 * Heurystyki są konserwatywne: ocena musi pasować do wzoru „cyfra 1–6 (+/−)”
 * albo „np/bz”, a przy jednej ocenie w wierszu wymagamy dwukropka po
 * przedmiocie — inaczej „1 Plan lekcji” zamieniłoby się w jedynkę.
 */
function parseText(raw: string, now: Date): Draft {
  const draft: Draft = { grades: [], timetable: [], exams: [], withoutDay: 0 };

  const lines = raw
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\u2212/g, "-")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  let pendingSubject: string | undefined;
  let weekday: number | undefined; // 1 = poniedziałek … 7 = niedziela
  let seenGrade = new Set<string>();

  const timeRange = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/;
  const dateInLine = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/;

  const weekdayDate = (dayIndex: number): string => {
    // Najbliższe wystąpienie dnia tygodnia licząc od dziś (dziś = 0 dni).
    const today = now.getDay(); // 0 = niedziela
    const target = dayIndex === 7 ? 0 : dayIndex;
    const delta = (target - today + 7) % 7;
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
    return iso(date);
  };

  for (const line of lines) {
    const lower = line.toLowerCase();

    // --- nagłówek dnia tygodnia (plan lekcji) ---
    const dayIndex = WEEKDAYS.findIndex((names) => names.some((name) => lower === name || lower === `${name}:`));
    if (dayIndex !== -1) {
      weekday = dayIndex + 1;
      pendingSubject = undefined;
      continue;
    }

    // --- lekcja: „08:00 - 08:45 Matematyka 12” ---
    const time = timeRange.exec(line);
    if (time) {
      const start = `${pad(Number(time[1]))}:${time[2]}`;
      const end = `${pad(Number(time[3]))}:${time[4]}`;
      const rest = line
        .slice(time.index + time[0].length)
        .replace(/^[\s,;–—-]+/, "")
        .trim();
      const after = rest.split(/\s{2,}|\t/)[0] ?? "";
      const roomMatch = /\s(\d{1,4}[a-z]?)$/i.exec(after);
      const subject = (roomMatch ? after.slice(0, roomMatch.index) : after).trim();

      if (looksLikeSubject(subject) && start < end) {
        if (!weekday) draft.withoutDay++;
        const date = weekday ? weekdayDate(weekday) : iso(now);
        const key = `${date}|${start}|${subject.toLowerCase()}`;
        if (!seenGrade.has(key)) {
          seenGrade.add(key);
          draft.timetable.push({
            date,
            start,
            end,
            subject,
            room: roomMatch ? roomMatch[1] : undefined,
          });
        }
        continue;
      }
    }

    // --- sprawdzian: data + słowo-klucz ---
    if (EXAM_WORDS.test(line)) {
      const date = dateInLine.exec(line);
      if (date) {
        const year = date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3]);
        const when = `${year}-${pad(Number(date[2]))}-${pad(Number(date[1]))}`;
        const before = line.slice(0, date.index).trim();
        const after = line.slice(date.index + date[0].length).replace(/^[\s,;–—-]+/, "").trim();
        const candidate = before || after;
        const subject = candidate
          .split(/\s{2,}|\t/)
          .map((part) => part.trim())
          .find((part) => looksLikeSubject(part));
        if (subject) {
          const type = EXAM_WORDS.exec(line)?.[0].toLowerCase();
          draft.exams.push({
            externalId: `${subject}|${when}|${type ?? ""}`,
            subject,
            date: when,
            type,
            description: after.slice(0, 120) || undefined,
          });
          continue;
        }
      }
    }

    // --- same oceny w wierszu („5 4 3+ 6”) pod nazwą przedmiotu ---
    const gradeLine = stripGradeNoise(line);
    const tokens = gradeLine.split(/[\s,;|]+/).filter(Boolean);
    if (tokens.length && tokens.every((token) => GRADE.test(token))) {
      if (pendingSubject) {
        for (const token of tokens) {
          draft.grades.push({
            externalId: `${pendingSubject}|${token}|${draft.grades.length}`,
            subject: pendingSubject,
            value: normalizeGrade(token),
            category: "ocena",
          });
        }
      }
      continue;
    }

    // --- „Matematyka: 5, 4, 3+” / „Matematyka 5 4 3+” ---
    const colon = /^([^:]{3,40}):\s*(.+)$/.exec(gradeLine);
    const rest = colon ? colon[2] : gradeLine;
    const subjectRaw = colon ? colon[1].trim() : undefined;
    const restTokens = rest.split(/[\s,;|]+/).filter(Boolean);
    const gradeTokens = restTokens.filter((token) => GRADE.test(token));

    const subjectFromLine = subjectRaw ?? restTokens.slice(0, restTokens.indexOf(gradeTokens[0])).join(" ").trim();
    const subject = looksLikeSubject(subjectFromLine) ? subjectFromLine : undefined;

    // Jedna ocena bez dwukropka jest w porządku, gdy wiersz to dokładnie
    // „Przedmiot 5” — inaczej wymagamy co najmniej dwóch ocen, żeby nie brać
    // numerów z menu i list za stopnie.
    const twoTokens = restTokens.length === 2 && !hasDigits(subjectFromLine);
    const minimum = colon || !subjectFromLine || twoTokens ? 1 : 2;
    if (subject && gradeTokens.length >= minimum) {
      for (const token of gradeTokens) {
        draft.grades.push({
          externalId: `${subject}|${token}|${draft.grades.length}`,
          subject,
          value: normalizeGrade(token),
          category: "ocena",
        });
      }
      continue;
    }

    // --- nazwa przedmiotu w osobnym wierszu ---
    if (!hasDigits(line) && looksLikeSubject(line)) {
      pendingSubject = line;
      continue;
    }

    // Kontekst przerywają dopiero nagłówki sekcji i długie wiersze. Krótkie
    // słowa („sprawdzian”, „aktywność”, „kartkówka”) to kategorie ocen i nie
    // mogą gubić nazwy przedmiotu — w dzienniku stoją między stopniami.
    if (STOP_WORDS.has(lower) || line.length > 45) pendingSubject = undefined;
  }

  return draft;
}

function build(draft: Draft, now: Date): JournalSnapshot | null {
  const grades = dedupe(draft.grades, (grade) => `${grade.subject}|${grade.value}`);
  const timetable = dedupe(draft.timetable, (lesson) => `${lesson.date}|${lesson.start}|${lesson.subject}`);
  const exams = dedupe(draft.exams, (exam) => `${exam.subject}|${exam.date}|${exam.type ?? ""}`);

  if (!grades.length && !timetable.length && !exams.length) return null;

  return {
    format: "plecak-import",
    version: 1,
    source: "manual",
    exportedAt: now.toISOString(),
    grades: grades.length ? grades : undefined,
    timetable: timetable.length ? timetable : undefined,
    exams: exams.length ? exams : undefined,
  };
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

function describe(snapshot: JournalSnapshot, kind: PasteKind, draft?: Draft): string[] {
  const notes: string[] = [];
  const parts: string[] = [];
  if (snapshot.grades?.length) parts.push(`${snapshot.grades.length} ocen`);
  if (snapshot.timetable?.length) parts.push(`${snapshot.timetable.length} lekcji`);
  if (snapshot.exams?.length) parts.push(`${snapshot.exams.length} sprawdzianów`);
  if (parts.length) notes.push(`Rozpoznano: ${parts.join(" · ")}.`);

  if (kind === "text" || kind === "html") {
    notes.push("To odczyt ze skopiowanej strony — sprawdź podgląd przed zatwierdzeniem.");
  }
  if (draft?.withoutDay) {
    notes.push(`${draft.withoutDay} lekcji bez nazwy dnia — przypisane do dziś.`);
  }
  if (kind === "text" || kind === "html") {
    notes.push("Wagi i kategorie ocen zostaną ustawione domyślnie (możesz je poprawić w Plecaku).");
  }
  return notes;
}

/**
 * Jeden punkt wejścia dla wszystkiego, co użytkownik wklei:
 * dokument JSON, adres z `#dziennik=`, skopiowana strona dziennika albo sam tekst.
 */
export function recognizePaste(raw: string, now: Date = new Date()): Recognition | null {
  if (typeof raw !== "string") return null;
  const input = raw.slice(0, MAX_INPUT).trim();
  if (!input) return null;

  // 1. Dokument JSON (plik, wklejony `plecak-import-v1`).
  if (input.startsWith("{") || input.startsWith("[")) {
    try {
      const snapshot = decodeSnapshot(JSON.parse(input));
      if (snapshot) {
        const has =
          snapshot.grades?.length || snapshot.timetable?.length || snapshot.exams?.length || snapshot.homework?.length;
        if (has) return { snapshot, kind: "json", notes: describe(snapshot, "json") };
      }
    } catch {
      // dalej: może to JSON w środku dłuższego tekstu
    }
  }

  // 2. Adres (albo sam fragment) z danymi z zakładki.
  const link = /#?dziennik=([A-Za-z0-9\-_%]+)/.exec(input);
  if (link) {
    const snapshot = decodeSnapshotParam(link[1]);
    if (snapshot) return { snapshot, kind: "link", notes: describe(snapshot, "link") };
  }

  // 3. Skopiowana strona albo czysty tekst.
  const isHtml = /<[a-z!/][\s\S]*>/i.test(input);
  const text = isHtml ? htmlToText(input) : input;
  const draft = parseText(text, now);
  const snapshot = build(draft, now);
  if (!snapshot) return null;

  return { snapshot, kind: isHtml ? "html" : "text", notes: describe(snapshot, isHtml ? "html" : "text", draft) };
}
