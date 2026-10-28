import { parseGrade, type Bells, type Kind, type Subject, type Task } from "../data";
import type { JournalSnapshot } from "./types";

export type { Bells };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const fromMinutes = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** FNV-1a 32-bit → base36. Stabilny między uruchomieniami i przeglądarkami. */
export function hash31(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Deterministyczne ID: ten sam wpis z dziennika zawsze dostaje to samo `id`. */
export const journalId = (source: string, externalId: string) => `${source}:${hash31(externalId)}`;

/**
 * Wylicza „dzwonki” szkoły z godzin lekcji.
 *
 * Dziennik podaje `start`/`end` każdej lekcji, więc nie trzeba ich przepisywać.
 * Tolerancja ±4 min pochłania drobne różnice wynikające z zastępstw.
 */
export function deriveBells(lessons: { start: string; end: string }[]): Bells {
  if (!lessons.length) return [];

  const buckets = new Map<string, { start: number; end: number; count: number }>();
  for (const lesson of lessons) {
    const start = minutes(lesson.start);
    const end = minutes(lesson.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    // Zaokrąglamy do 5 minut, żeby „8:00–8:45” i „8:00–8:44” trafiły do jednego koszyka.
    const key = `${Math.round(start / 5)}-${Math.round(end / 5)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.start = Math.min(bucket.start, start);
      bucket.end = Math.max(bucket.end, end);
    } else {
      buckets.set(key, { start, end, count: 1 });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((bucket, index, all) => index === 0 || bucket.start - all[index - 1].start > 4)
    .map((bucket) => [fromMinutes(bucket.start), fromMinutes(bucket.end)] as [string, string]);
}

export type ImportSelection = {
  grades: boolean;
  timetable: boolean;
  tasks: boolean;
};

export type ImportStats = {
  gradesNew: number;
  gradesUpdated: number;
  subjectsNew: number;
  lessons: number;
  exams: number;
  homework: number;
  bells: number;
};

export type ImportResult = {
  subjects: Subject[];
  tasks: Task[];
  timetable: string[][] | null;
  bells: Bells | null;
  warnings: string[];
  stats: ImportStats;
};

const normalizeKey = (name: string) => name.trim().toLowerCase();

/**
 * Scalanie snapshotu z danymi w aplikacji.
 *
 * Zasady:
 *  - elementy zaimportowane wcześniej (to samo `source` + `externalId`) są aktualizowane,
 *  - elementy dodane ręcznie nigdy nie są ruszane,
 *  - elementy spoza snapshotu zostają (nie kasujemy danych użytkownika),
 *  - plan lekcji jest zastępowany, bo pochodzi w całości z dziennika.
 */
export function mergeSnapshot(
  snapshot: JournalSnapshot,
  current: { subjects: Subject[]; tasks: Task[]; timetable: string[][] },
  selection: ImportSelection
): ImportResult {
  const warnings: string[] = [];
  const stats: ImportStats = {
    gradesNew: 0,
    gradesUpdated: 0,
    subjectsNew: 0,
    lessons: 0,
    exams: 0,
    homework: 0,
    bells: 0,
  };

  let subjects: Subject[] = current.subjects.map((subject) => ({ ...subject, grades: [...subject.grades] }));

  /* ----------------------------- oceny ----------------------------- */
  if (selection.grades) {
    const invalidGrades = (snapshot.grades ?? []).filter((grade) => parseGrade(grade.value) == null);
    if (invalidGrades.length) {
      warnings.push(
        `Pominięto ${invalidGrades.length} ${
          invalidGrades.length === 1 ? "ocenę" : "ocen"
        } opisaną słownie (np. „${invalidGrades[0].value}”) — potrafimy liczyć tylko oceny 1–6 z plusami i minusami.`
      );
    }

    for (const grade of snapshot.grades ?? []) {
      if (parseGrade(grade.value) == null) continue;

      let subject = subjects.find((candidate) => normalizeKey(candidate.name) === normalizeKey(grade.subject));
      if (!subject) {
        subject = { id: `subj:${hash31(normalizeKey(grade.subject))}`, name: grade.subject, grades: [] };
        subjects.push(subject);
        stats.subjectsNew++;
      }

      const id = journalId(snapshot.source, grade.externalId);
      const note = [grade.category, grade.comment].filter(Boolean).join(" · ").slice(0, 200);
      const weight = grade.weight && grade.weight > 0 ? Math.min(5, Math.max(1, Math.round(grade.weight))) : 1;

      const existing = subject.grades.find((candidate) => candidate.id === id);
      if (existing) {
        if (existing.value !== grade.value || existing.weight !== weight || existing.note !== note) {
          existing.value = grade.value;
          existing.weight = weight;
          existing.note = note;
          stats.gradesUpdated++;
        }
      } else {
        subject.grades.push({
          id,
          value: grade.value,
          weight,
          note,
          source: snapshot.source,
          externalId: grade.externalId,
        });
        stats.gradesNew++;
      }
    }
    subjects = subjects.filter((subject) => subject.grades.length > 0 || subject.name);
  }

  /* ----------------------------- plan ------------------------------ */
  let timetable: string[][] | null = null;
  let bells: Bells | null = null;

  if (selection.timetable && snapshot.timetable?.length) {
    const usable = snapshot.timetable.filter((lesson) => !lesson.canceled);
    const derived = deriveBells(usable);
    const slots = Math.max(derived.length, 8);

    if (derived.length > 0) {
      bells = [...derived];
      stats.bells = derived.length;
    }

    const grid: string[][] = Array.from({ length: 5 }, () => Array.from({ length: slots }, () => ""));
    const dayNames = new Map<string, number>();

    for (const lesson of usable) {
      const date = new Date(`${lesson.date}T00:00:00`);
      // 0 = niedziela. Poniedziałek = 1.
      const dayIndex = date.getDay() - 1;
      if (dayIndex < 0 || dayIndex > 4) continue;

      const slot = derived.findIndex(([start, end]) => {
        const startDiff = Math.abs(minutes(start) - minutes(lesson.start));
        const endDiff = Math.abs(minutes(end) - minutes(lesson.end));
        return startDiff <= 4 && endDiff <= 4;
      });
      if (slot < 0) continue;

      // Ta sama lekcja w tym samym slocie w kolejnym tygodniu nie powinna nadpisywać
      // innej — dlatego zapisujemy tylko, gdy pole jest wolne.
      if (!grid[dayIndex][slot]) grid[dayIndex][slot] = lesson.subject;
      dayNames.set(lesson.date, dayIndex);
    }

    if (dayNames.size === 0) {
      warnings.push("W danych nie było żadnej lekcji w dni powszednie — planu nie zmieniono.");
    } else {
      timetable = grid;
      stats.lessons = usable.length;
    }

    if (derived.length === 0) {
      warnings.push("Nie udało się ustalić godzin lekcji — dzwonki pozostały bez zmian.");
    }
  }

  /* ------------------------- sprawdziany i zadania ------------------ */
  const tasks: Task[] = [...current.tasks];

  const kindFor = (type?: string, fallback: Kind = "zadanie"): Kind => {
    const value = (type ?? "").toLowerCase();
    if (value.includes("sprawdzian") || value.includes("praca klasowa")) return "sprawdzian";
    if (value.includes("kartków") || value.includes("kartkow")) return "kartkówka";
    if (value.includes("projekt") || value.includes("prezentac") || value.includes("odpowied")) return "projekt";
    return fallback;
  };

  /** `kindPrefix` rozdziela sprawdziany i zadania domowe o tym samym ID z dziennika. */
  const upsertTask = (task: Omit<Task, "id">, kindPrefix: "exam" | "hw", externalId: string) => {
    const id = journalId(snapshot.source, `${kindPrefix}:${externalId}`);
    const existing = tasks.find((candidate) => candidate.id === id);
    const next: Task = { ...task, id, source: snapshot.source, externalId };
    if (existing) {
      Object.assign(existing, next);
    } else {
      tasks.push(next);
    }
  };

  if (selection.tasks) {
    for (const exam of snapshot.exams ?? []) {
      upsertTask(
        {
          title: exam.description?.trim() || `${kindFor(exam.type, "sprawdzian")} – ${exam.subject}`,
          subject: exam.subject,
          due: exam.date,
          kind: kindFor(exam.type, "sprawdzian"),
          done: false,
        },
        "exam",
        exam.externalId
      );
      stats.exams++;
    }

    for (const homework of snapshot.homework ?? []) {
      upsertTask(
        {
          title: homework.description,
          subject: homework.subject,
          due: homework.due,
          kind: "zadanie",
          done: false,
        },
        "hw",
        homework.externalId
      );
      stats.homework++;
    }
  }

  // Sprzątamy zadania importowane, które zniknęły ze snapshotu i nie zostały zrobione.
  // (Zrobionych nie ruszamy — to historia użytkownika.)
  if (selection.tasks && (snapshot.exams || snapshot.homework)) {
    const present = new Set<string>([
      ...(snapshot.exams ?? []).map((exam) => journalId(snapshot.source, `exam:${exam.externalId}`)),
      ...(snapshot.homework ?? []).map((homework) => journalId(snapshot.source, `hw:${homework.externalId}`)),
    ]);
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (task.source === snapshot.source && task.externalId && !task.done && !present.has(task.id)) {
        tasks.splice(i, 1);
      }
    }
  }

  const dayCount = new Set(snapshot.timetable?.map((lesson) => lesson.date) ?? []).size;
  if (selection.timetable && dayCount > 0) {
    const bellsInfo =
      stats.bells > 0
        ? `${stats.bells} lekcji dziennie — możesz je poprawić w Planie lekcji`
        : "bez zmian, bo nie udało się ich ustalić";
    warnings.push(`Plan z ${dayCount} dni. Godziny dzwonków: ${bellsInfo}.`);
  }

  return { subjects, tasks, timetable, bells, warnings, stats };
}
