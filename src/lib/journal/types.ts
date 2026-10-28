/**
 * Format wymiany danych z e-dziennika: `plecak-import-v1`.
 *
 * Ten sam dokument produkuje każdy adapter (lokalny agent, konwerter CLI,
 * ręcznie przygotowany plik), dzięki czemu aplikacja ma tylko jedną ścieżkę
 * importu do przetestowania.
 */

export type JournalSource = "uonet" | "eduvulcan" | "librus" | "manual" | "file";

export type JournalGrade = {
  externalId: string;
  subject: string;
  /** Dokładnie jak w dzienniku: "5", "5+", "4-". */
  value: string;
  weight?: number;
  category?: string;
  /** YYYY-MM-DD */
  date?: string;
  comment?: string;
};

export type JournalLesson = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM */
  end: string;
  subject: string;
  room?: string;
  canceled?: boolean;
};

export type JournalExam = {
  externalId: string;
  subject: string;
  /** YYYY-MM-DD */
  date: string;
  /** "sprawdzian" | "kartkówka" | "praca klasowa" | "odpowiedź" | "inne" */
  type?: string;
  description?: string;
};

export type JournalHomework = {
  externalId: string;
  subject: string;
  /** YYYY-MM-DD */
  due: string;
  description: string;
};

export type JournalSnapshot = {
  format: "plecak-import";
  version: 1;
  source: JournalSource;
  /** ISO */
  exportedAt: string;
  student?: { name?: string; className?: string; school?: string };
  grades?: JournalGrade[];
  timetable?: JournalLesson[];
  exams?: JournalExam[];
  homework?: JournalHomework[];
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const STR = (v: unknown, max = 300): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

/** Normalizuje "8:00" → "08:00". */
export function normTime(value: string): string {
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

function decodeGrade(raw: unknown): JournalGrade | undefined {
  if (!isObj(raw)) return undefined;
  const subject = STR(raw.subject, 80);
  const value = STR(raw.value, 4);
  if (!subject || !value) return undefined;
  return {
    externalId: STR(raw.externalId, 200) ?? `${subject}|${value}|${STR(raw.date, 10) ?? ""}`,
    subject,
    value,
    weight: typeof raw.weight === "number" && Number.isFinite(raw.weight) ? raw.weight : undefined,
    category: STR(raw.category, 80),
    date: STR(raw.date, 10),
    comment: STR(raw.comment, 200),
  };
}

function decodeLesson(raw: unknown): JournalLesson | undefined {
  if (!isObj(raw)) return undefined;
  const date = STR(raw.date, 10);
  const start = STR(raw.start, 5);
  const end = STR(raw.end, 5);
  const subject = STR(raw.subject, 80);
  if (!date || !start || !end || !subject || !DATE.test(date) || !TIME.test(start) || !TIME.test(end)) {
    return undefined;
  }
  return {
    date,
    start: normTime(start),
    end: normTime(end),
    subject,
    room: STR(raw.room, 40),
    canceled: raw.canceled === true,
  };
}

function decodeExam(raw: unknown): JournalExam | undefined {
  if (!isObj(raw)) return undefined;
  const subject = STR(raw.subject, 80);
  const date = STR(raw.date, 10);
  if (!subject || !date || !DATE.test(date)) return undefined;
  return {
    externalId: STR(raw.externalId, 200) ?? `${subject}|${date}|${STR(raw.description, 60) ?? ""}`,
    subject,
    date,
    type: STR(raw.type, 40),
    description: STR(raw.description, 200),
  };
}

function decodeHomework(raw: unknown): JournalHomework | undefined {
  if (!isObj(raw)) return undefined;
  const subject = STR(raw.subject, 80);
  const due = STR(raw.due, 10);
  const description = STR(raw.description, 200);
  if (!subject || !due || !description || !DATE.test(due)) return undefined;
  return {
    externalId: STR(raw.externalId, 200) ?? `${subject}|${due}|${description}`,
    subject,
    due,
    description,
  };
}

const list = <T>(raw: unknown, decode: (v: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(decode).filter((v): v is T => v !== undefined);
};

/** Tolerancyjny dekoder snapshotu — nieznane pola pomijamy, złe wpisy odrzucamy. */
export function decodeSnapshot(raw: unknown): JournalSnapshot | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.format !== "plecak-import") return undefined;
  if (raw.version !== 1) return undefined;

  const sources: JournalSource[] = ["uonet", "eduvulcan", "librus", "manual", "file"];
  const source = sources.find((s) => s === raw.source) ?? "file";

  const student = isObj(raw.student)
    ? {
        name: STR(raw.student.name, 80),
        className: STR(raw.student.className, 40),
        school: STR(raw.student.school, 120),
      }
    : undefined;

  return {
    format: "plecak-import",
    version: 1,
    source,
    exportedAt: STR(raw.exportedAt, 40) ?? new Date().toISOString(),
    student,
    grades: list(raw.grades, decodeGrade),
    timetable: list(raw.timetable, decodeLesson),
    exams: list(raw.exams, decodeExam),
    homework: list(raw.homework, decodeHomework),
  };
}

export const EMPTY_SNAPSHOT: JournalSnapshot = {
  format: "plecak-import",
  version: 1,
  source: "manual",
  exportedAt: new Date(0).toISOString(),
};
