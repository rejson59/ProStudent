import { describe, expect, it } from "vitest";
import type { Subject, Task } from "../data";
import { decodeSnapshot } from "./types";
import { deriveBells, journalId, mergeSnapshot } from "./normalize";

const subjects: Subject[] = [
  { id: "s1", name: "Matematyka", grades: [{ id: "g-manual", value: "4", weight: 1, note: "" }] },
];
const tasks: Task[] = [
  { id: "t-manual", title: "Ręczne zadanie", subject: "Polski", due: "2026-11-02", kind: "zadanie", done: false },
];
const timetable = Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => ""));

const current = { subjects, tasks, timetable };

const snapshot = decodeSnapshot({
  format: "plecak-import",
  version: 1,
  source: "eduvulcan",
  exportedAt: "2026-10-28T10:00:00.000Z",
  grades: [
    { externalId: "g-1", subject: "Matematyka", value: "5", weight: 3, category: "sprawdzian" },
    { externalId: "g-2", subject: "Fizyka", value: "4+", weight: 1 },
    { externalId: "g-3", subject: "Matematyka", value: "opisowa", weight: 1 },
  ],
  timetable: [
    { date: "2026-10-26", start: "08:00", end: "08:45", subject: "Matematyka" },
    { date: "2026-10-26", start: "08:55", end: "09:40", subject: "Polski" },
    { date: "2026-10-27", start: "08:00", end: "08:45", subject: "Fizyka" },
  ],
  exams: [{ externalId: "e-1", subject: "Fizyka", date: "2026-11-05", type: "sprawdzian", description: "Kinematyka" }],
  homework: [{ externalId: "h-1", subject: "Polski", due: "2026-11-03", description: "Przeczytać rozdział 4" }],
});

describe("decodeSnapshot", () => {
  it("przyjmuje poprawny dokument", () => {
    expect(snapshot).toBeDefined();
    expect(snapshot!.grades).toHaveLength(3);
  });

  it("odrzuca obcy format", () => {
    expect(decodeSnapshot({ format: "cos-innego", version: 1 })).toBeUndefined();
    expect(decodeSnapshot("plik")).toBeUndefined();
    expect(decodeSnapshot({ format: "plecak-import", version: 9 })).toBeUndefined();
  });

  it("odrzuca pojedyncze błędne wpisy, zachowując resztę", () => {
    const decoded = decodeSnapshot({
      format: "plecak-import",
      version: 1,
      source: "file",
      exportedAt: "2026-10-28T10:00:00.000Z",
      grades: [{ subject: "Matematyka", value: "5" }, { subject: "", value: "4" }, null],
      timetable: [{ date: "zły", start: "8:00", end: "8:45", subject: "Polski" }],
    });
    expect(decoded!.grades).toHaveLength(1);
    expect(decoded!.timetable).toHaveLength(0);
  });

  it("normalizuje godziny do HH:MM", () => {
    const decoded = decodeSnapshot({
      format: "plecak-import",
      version: 1,
      source: "file",
      exportedAt: "2026-10-28T10:00:00.000Z",
      timetable: [{ date: "2026-10-26", start: "8:00", end: "8:45", subject: "Polski" }],
    });
    expect(decoded!.timetable![0].start).toBe("08:00");
  });
});

describe("deriveBells", () => {
  it("wylicza dzwonki z godzin lekcji", () => {
    const bells = deriveBells([
      { start: "08:00", end: "08:45" },
      { start: "08:00", end: "08:45" },
      { start: "08:55", end: "09:40" },
      { start: "09:50", end: "10:35" },
    ]);
    expect(bells).toEqual([
      ["08:00", "08:45"],
      ["08:55", "09:40"],
      ["09:50", "10:35"],
    ]);
  });

  it("scala drobne różnice (±4 min)", () => {
    const bells = deriveBells([
      { start: "08:00", end: "08:45" },
      { start: "08:02", end: "08:43" },
    ]);
    expect(bells).toHaveLength(1);
  });

  it("bez lekcji zwraca pustą listę", () => {
    expect(deriveBells([])).toEqual([]);
  });
});

describe("mergeSnapshot", () => {
  const merge = (selection = { grades: true, timetable: true, tasks: true }) =>
    mergeSnapshot(snapshot!, current, selection);

  it("dodaje nowe oceny i nie rusza ręcznych", () => {
    const result = merge();
    const math = result.subjects.find((s) => s.name === "Matematyka")!;
    expect(math.grades.map((g) => g.value)).toContain("4");
    expect(math.grades.map((g) => g.value)).toContain("5");
    expect(math.grades.find((g) => g.id === "g-manual")).toBeDefined();
  });

  it("tworzy przedmiot, którego wcześniej nie było", () => {
    const result = merge();
    expect(result.subjects.some((s) => s.name === "Fizyka")).toBe(true);
    expect(result.stats.subjectsNew).toBeGreaterThanOrEqual(1);
  });

  it("pomija oceny opisowe i ostrzega o nich", () => {
    const result = merge();
    expect(result.warnings.some((w) => w.includes("opisaną słownie"))).toBe(true);
  });

  it("zachowuje wagę i kategorię oceny", () => {
    const math = merge().subjects.find((s) => s.name === "Matematyka")!;
    const grade = math.grades.find((g) => g.externalId === "g-1")!;
    expect(grade.weight).toBe(3);
    expect(grade.note).toBe("sprawdzian");
    expect(grade.source).toBe("eduvulcan");
  });

  it("jest idempotentny — drugi import nie duplikuje ocen", () => {
    const first = merge();
    const second = mergeSnapshot(snapshot!, { subjects: first.subjects, tasks: first.tasks, timetable: first.timetable ?? timetable }, {
      grades: true,
      timetable: true,
      tasks: true,
    });
    expect(second.stats.gradesNew).toBe(0);
    expect(second.subjects.flatMap((s) => s.grades)).toHaveLength(first.subjects.flatMap((s) => s.grades).length);
    expect(second.tasks).toHaveLength(first.tasks.length);
  });

  it("aktualizuje ocenę zmienioną w dzienniku", () => {
    const first = merge();
    const changed = decodeSnapshot({ ...snapshot!, grades: [{ ...snapshot!.grades![0], value: "6" }] })!;
    const second = mergeSnapshot(changed, { subjects: first.subjects, tasks: first.tasks, timetable: timetable }, {
      grades: true,
      timetable: false,
      tasks: false,
    });
    expect(second.stats.gradesUpdated).toBe(1);
    expect(second.subjects.find((s) => s.name === "Matematyka")!.grades.find((g) => g.externalId === "g-1")!.value).toBe("6");
  });

  it("buduje siatkę planu i dzwonki", () => {
    const result = merge();
    expect(result.timetable).not.toBeNull();
    expect(result.timetable![0][0]).toBe("Matematyka");
    expect(result.timetable![0][1]).toBe("Polski");
    expect(result.timetable![1][0]).toBe("Fizyka");
    expect(result.bells).toEqual([
      ["08:00", "08:45"],
      ["08:55", "09:40"],
    ]);
  });

  it("zamienia sprawdziany i zadania na zadania z kind", () => {
    const result = merge();
    const exam = result.tasks.find((t) => t.externalId === "e-1")!;
    expect(exam.kind).toBe("sprawdzian");
    expect(exam.due).toBe("2026-11-05");
    const homework = result.tasks.find((t) => t.externalId === "h-1")!;
    expect(homework.kind).toBe("zadanie");
    expect(homework.title).toContain("rozdział 4");
  });

  it("nie usuwa ręcznie dodanych zadań", () => {
    expect(merge().tasks.some((t) => t.id === "t-manual")).toBe(true);
  });

  it("usuwa importowane, niezrobione zadanie, którego nie ma już w dzienniku", () => {
    const first = mergeSnapshot(snapshot!, { subjects, tasks, timetable }, { grades: false, timetable: false, tasks: true });
    const withoutExam = decodeSnapshot({ ...snapshot!, exams: [] })!;
    const second = mergeSnapshot(withoutExam, { subjects, tasks: [...first.tasks], timetable }, {
      grades: false,
      timetable: false,
      tasks: true,
    });
    expect(second.tasks.some((t) => t.externalId === "e-1")).toBe(false);
    expect(second.tasks.some((t) => t.id === "t-manual")).toBe(true);
  });

  it("respektuje wybór zakresu importu", () => {
    const result = merge({ grades: false, timetable: false, tasks: false });
    expect(result.timetable).toBeNull();
    expect(result.bells).toBeNull();
    expect(result.stats.gradesNew).toBe(0);
    expect(result.stats.exams).toBe(0);
  });
});

describe("journalId", () => {
  it("jest deterministyczne", () => {
    expect(journalId("eduvulcan", "123")).toBe(journalId("eduvulcan", "123"));
    expect(journalId("eduvulcan", "123")).not.toBe(journalId("eduvulcan", "124"));
    expect(journalId("eduvulcan", "123")).not.toBe(journalId("librus", "123"));
  });
});
