import { BELLS, type Card, type Grade, type Kind, type Session, type Subject, type Task } from "./data";
import type { Mode } from "./useTimer";
import { TAB_IDS } from "./nav";

/**
 * Dekodery danych ze schowka (`localStorage`).
 *
 * Każdy dekoder dostaje surową wartość z `JSON.parse` i zwraca albo poprawny,
 * znormalizowany obiekt, albo `undefined` (wtedy aplikacja używa danych domyślnych).
 * Dzięki temu uszkodzony lub stary zapis nie wywala interfejsu.
 */
export type Decoder<T> = (raw: unknown) => T | undefined;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, max = 500): string | undefined =>
  typeof v === "string" ? v.slice(0, max) : undefined;

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: Kind[] = ["zadanie", "kartkówka", "sprawdzian", "projekt"];
export const LESSON_COUNT = BELLS.length;
export const DAY_COUNT = 5;

/** ID musi być niepustym stringiem — reszta dostaje nowe. */
const id = (v: unknown): string | undefined => {
  const s = str(v, 64);
  return s && s.length > 0 ? s : undefined;
};

export function decodeTab<T extends string>(allowed: readonly T[]): Decoder<T> {
  return (raw) => (typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined);
}

export const decodeTheme: Decoder<"auto" | "day" | "night"> = (raw) =>
  raw === "auto" || raw === "day" || raw === "night" ? raw : undefined;

export const decodeText: Decoder<string> = (raw) => str(raw, 2000);

export const decodeFocusLen: Decoder<number> = (raw) => num(raw, 1, 180);

export const decodeTasksFilter: Decoder<"todo" | "done" | "all"> = (raw) =>
  raw === "todo" || raw === "done" || raw === "all" ? raw : undefined;

/** Nazwa talii fiszek („Wszystkie” też jest poprawną wartością). */
export const decodeDeck: Decoder<string> = (raw) => {
  const value = str(raw, 80)?.trim();
  return value ? value : undefined;
};

function decodeTask(raw: unknown): Task | undefined {
  if (!isObj(raw)) return undefined;
  const title = str(raw.title, 200)?.trim();
  const subject = str(raw.subject, 80)?.trim();
  const due = str(raw.due, 10);
  const kind = KINDS.find((k) => k === raw.kind);
  if (!title || !subject || !due || !ISO_DATE.test(due) || !kind) return undefined;
  return {
    id: id(raw.id) ?? cryptoId(),
    title,
    subject,
    due,
    kind,
    done: raw.done === true,
  };
}

/** Zadania: odrzucamy pojedyncze uszkodzone wpisy, resztę zachowujemy. */
export const decodeTasks: Decoder<Task[]> = (raw) => {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(decodeTask).filter((t): t is Task => t !== undefined);
};

function decodeGrade(raw: unknown): Grade | undefined {
  if (!isObj(raw)) return undefined;
  const value = str(raw.value, 4)?.trim();
  if (!value) return undefined;
  return {
    id: id(raw.id) ?? cryptoId(),
    value,
    weight: num(raw.weight, 0.5, 10) ?? 1,
    note: str(raw.note, 200) ?? "",
  };
}

function decodeSubject(raw: unknown): Subject | undefined {
  if (!isObj(raw)) return undefined;
  const name = str(raw.name, 80)?.trim();
  if (!name) return undefined;
  const grades = Array.isArray(raw.grades)
    ? raw.grades.map(decodeGrade).filter((g): g is Grade => g !== undefined)
    : [];
  return { id: id(raw.id) ?? cryptoId(), name, grades };
}

export const decodeSubjects: Decoder<Subject[]> = (raw) => {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(decodeSubject).filter((s): s is Subject => s !== undefined);
};

function decodeCard(raw: unknown): Card | undefined {
  if (!isObj(raw)) return undefined;
  const deck = str(raw.deck, 80)?.trim();
  const front = str(raw.front, 500)?.trim();
  const back = str(raw.back, 500)?.trim();
  if (!deck || !front || !back) return undefined;
  return {
    id: id(raw.id) ?? cryptoId(),
    deck,
    front,
    back,
    // Wartości spoza 1–5 przycinamy do zakresu zamiast po cichu resetować do 1.
    box:
      typeof raw.box === "number" && Number.isFinite(raw.box)
        ? Math.min(5, Math.max(1, Math.round(raw.box)))
        : 1,
  };
}

export const decodeCards: Decoder<Card[]> = (raw) => {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(decodeCard).filter((c): c is Card => c !== undefined);
};

function decodeSession(raw: unknown): Session | undefined {
  if (!isObj(raw)) return undefined;
  const at = num(raw.at, 0, Number.MAX_SAFE_INTEGER);
  const minutes = num(raw.minutes, 0, 600);
  const seed = num(raw.seed, 0, Number.MAX_SAFE_INTEGER);
  if (at === undefined || minutes === undefined || seed === undefined) return undefined;
  return { id: id(raw.id) ?? cryptoId(), at, minutes, seed: Math.floor(seed) };
}

export const decodeSessions: Decoder<Session[]> = (raw) => {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(decodeSession).filter((s): s is Session => s !== undefined);
};

/**
 * Plan lekcji normalizujemy zawsze do 5 dni × liczba dzwonków.
 * To naprawia zarówno krótsze wiersze, jak i plany z innej szkoły.
 */
export const decodeTimetable: Decoder<string[][]> = (raw) => {
  if (!Array.isArray(raw)) return undefined;
  return Array.from({ length: DAY_COUNT }, (_, day) => {
    const row: unknown = raw[day];
    const cells = Array.isArray(row) ? row : [];
    return Array.from({ length: LESSON_COUNT }, (_, lesson) => str(cells[lesson], 60) ?? "");
  });
};

export type PersistedTimer = {
  mode: Mode;
  endAt: number | null;
  left: number;
  cycles: number;
};

const MODES: Mode[] = ["focus", "short", "long"];

export const decodeTimer: Decoder<PersistedTimer> = (raw) => {
  if (!isObj(raw)) return undefined;
  const mode = MODES.find((m) => m === raw.mode);
  if (!mode) return undefined;
  const endAt = raw.endAt === null ? null : num(raw.endAt, 0, Number.MAX_SAFE_INTEGER);
  const left = num(raw.left, 0, 24 * 3600);
  const cycles = num(raw.cycles, 0, 10_000);
  if (endAt === undefined || left === undefined || cycles === undefined) return undefined;
  return { mode, endAt, left: Math.round(left), cycles: Math.floor(cycles) };
};

/** Generator ID odporny na brak `crypto.randomUUID` (starsze Safari, http). */
export function cryptoId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * Rejestr wszystkich znanych kluczy schowka.
 * Używany przy imporcie kopii zapasowej — pozwala odrzucić śmieci,
 * a przyjąć tylko to, co aplikacja naprawdę rozumie.
 */
export const DATA_DECODERS: Record<string, Decoder<unknown>> = {
  tab: decodeTab(TAB_IDS),
  theme: decodeTheme,
  name: decodeText,
  quicknote: decodeText,
  tasks: decodeTasks,
  timetable: decodeTimetable,
  subjects: decodeSubjects,
  cards: decodeCards,
  sessions: decodeSessions,
  focusLen: decodeFocusLen,
  timer: decodeTimer,
  tasksFilter: decodeTasksFilter,
  cardsDeck: decodeDeck,
};
