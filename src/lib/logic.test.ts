import { describe, expect, it } from "vitest";
import {
  BELLS,
  dateISO,
  daysUntil,
  parseGrade,
  plural,
  predicted,
  schoolYearBounds,
  subjectColor,
  weightedAvg,
  type Grade,
} from "./data";
import { lessonStatus } from "./schedule";
import {
  decodeCards,
  decodeSessions,
  decodeSubjects,
  decodeTasks,
  decodeTimetable,
  decodeTimer,
} from "./schema";

const grade = (value: string, weight = 1): Grade => ({ id: value + weight, value, weight, note: "" });

describe("parseGrade", () => {
  it("czyta oceny bez znaków", () => {
    expect(parseGrade("5")).toBe(5);
    expect(parseGrade(" 3 ")).toBe(3);
  });

  it("dolicza plus i minus", () => {
    expect(parseGrade("5+")).toBe(5.5);
    expect(parseGrade("4-")).toBe(3.75);
  });

  it("odrzuca śmieci", () => {
    expect(parseGrade("7")).toBeNull();
    expect(parseGrade("0")).toBeNull();
    expect(parseGrade("abc")).toBeNull();
    expect(parseGrade("")).toBeNull();
    expect(parseGrade("3++")).toBeNull();
  });

  it("nie wychodzi poza skalę", () => {
    expect(parseGrade("1-")).toBe(1);
    expect(parseGrade("6+")).toBe(6);
  });
});

describe("weightedAvg", () => {
  it("liczy średnią ważoną", () => {
    expect(weightedAvg([grade("5", 3), grade("3", 1)]).avg).toBe(4.5);
  });

  it("zwraca null bez ocen", () => {
    expect(weightedAvg([]).avg).toBeNull();
    expect(weightedAvg([grade("x")]).avg).toBeNull();
  });

  it("pomija niepoprawne oceny", () => {
    expect(weightedAvg([grade("5", 1), grade("abc", 9)]).avg).toBe(5);
  });
});

describe("predicted", () => {
  it.each([
    [5.5, 6],
    [4.75, 5],
    [4.74, 4],
    [3.75, 4],
    [3.74, 3],
    [2.75, 3],
    [1.75, 2],
    [1.0, 1],
  ])("średnia %s → ocena %s", (avg, expected) => {
    expect(predicted(avg)).toBe(expected);
  });

  it("bez średniej nie ma prognozy", () => {
    expect(predicted(null)).toBeNull();
  });
});

describe("plural", () => {
  it("odmienia po polsku", () => {
    expect(plural(1, "dzień", "dni", "dni")).toBe("dzień");
    expect(plural(3, "dzień", "dni", "dni")).toBe("dni");
    expect(plural(12, "dzień", "dni", "dni")).toBe("dni");
    expect(plural(22, "dzień", "dni", "dni")).toBe("dni");
    expect(plural(0, "dzień", "dni", "dni")).toBe("dni");
  });
});

describe("lessonStatus", () => {
  const timetable = [
    ["Matematyka", "Polski", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["Biologia", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
  ];

  const at = (day: number, hour: number, minute = 0) => {
    const date = new Date(2026, 9, 5); // poniedziałek
    date.setDate(date.getDate() + day);
    date.setHours(hour, minute, 0, 0);
    return date;
  };

  it("rozpoznaje weekend", () => {
    expect(lessonStatus(at(5, 10), timetable).state).toBe("weekend");
  });

  it("rozpoznaje dzień bez lekcji", () => {
    expect(lessonStatus(at(1, 10), timetable).state).toBe("free");
  });

  it("rozpoznaje czas przed pierwszą lekcją", () => {
    const status = lessonStatus(at(0, 7, 10), timetable);
    expect(status.state).toBe("before");
    if (status.state === "before") expect(status.minsTo).toBe(50);
  });

  it("rozpoznaje trwającą lekcję i postęp", () => {
    const status = lessonStatus(at(0, 8, 15), timetable);
    expect(status.state).toBe("lesson");
    if (status.state === "lesson") {
      expect(status.index).toBe(0);
      expect(status.minsLeft).toBe(30);
      expect(status.progress).toBeCloseTo(1 / 3, 5);
    }
  });

  it("rozpoznaje przerwę między lekcjami", () => {
    const status = lessonStatus(at(0, 8, 50), timetable);
    expect(status.state).toBe("break");
    if (status.state === "break") {
      expect(status.prev).toBe(0);
      expect(status.next).toBe(1);
    }
  });

  it("rozpoznaje koniec lekcji", () => {
    expect(lessonStatus(at(0, 16), timetable).state).toBe("after");
  });

  it("tabela z krótszymi wierszami nie wywala funkcji", () => {
    expect(() => lessonStatus(at(0, 9), [["Matematyka"]])).not.toThrow();
  });
});

describe("daty", () => {
  it("dateISO nie przesuwa dnia przez strefę czasową", () => {
    expect(dateISO(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(dateISO(new Date(2026, 11, 31, 23, 30))).toBe("2026-12-31");
  });

  it("daysUntil liczy różnicę dni", () => {
    const today = dateISO(new Date());
    expect(daysUntil(today)).toBe(0);
  });

  it("schoolYearBounds wskazuje wakacje w lipcu", () => {
    const info = schoolYearBounds(new Date(2026, 6, 15));
    expect(info.onVacation).toBe(true);
  });

  it("schoolYearBounds wskazuje rok szkolny w październiku", () => {
    const info = schoolYearBounds(new Date(2026, 9, 26));
    expect(info.onVacation).toBe(false);
    expect(info.end.getMonth()).toBe(5); // czerwiec
    expect(info.start.getFullYear()).toBe(2026);
  });
});

describe("subjectColor", () => {
  it("jest stabilny dla tej samej nazwy", () => {
    expect(subjectColor("Matematyka")).toBe(subjectColor(" matematyka "));
  });

  it("nie wywala się na pustej lub złej wartości", () => {
    expect(subjectColor("")).toBeTruthy();
    // @ts-expect-error — symulujemy uszkodzone dane ze schowka
    expect(subjectColor(undefined)).toBeTruthy();
  });
});

describe("dekodery danych ze schowka", () => {
  it("normalizuje plan do 5 × liczby dzwonków", () => {
    const decoded = decodeTimetable([["Matematyka"], []]);
    expect(decoded).toHaveLength(5);
    expect(decoded![0]).toHaveLength(BELLS.length);
    expect(decoded![0][0]).toBe("Matematyka");
    expect(decoded![0][1]).toBe("");
  });

  it("odrzuca plan, który nie jest tablicą", () => {
    expect(decodeTimetable("zepsute")).toBeUndefined();
    expect(decodeTimetable(null)).toBeUndefined();
    expect(decodeTimetable({})).toBeUndefined();
  });

  it("filtruje uszkodzone zadania, zachowując poprawne", () => {
    const decoded = decodeTasks([
      { title: "Dobre", subject: "Polski", due: "2026-11-01", kind: "zadanie", done: false },
      { title: "", subject: "Polski", due: "2026-11-01", kind: "zadanie" },
      { title: "Zły termin", subject: "Polski", due: "1 listopada", kind: "zadanie" },
      { title: "Zły typ", subject: "Polski", due: "2026-11-01", kind: "egzamin" },
      null,
    ]);
    expect(decoded).toHaveLength(1);
    expect(decoded![0].title).toBe("Dobre");
    expect(decoded![0].id).toBeTruthy();
  });

  it("uzupełnia brakujące pola ocen", () => {
    const decoded = decodeSubjects([{ name: "Matematyka", grades: [{ value: "5" }] }]);
    expect(decoded).toHaveLength(1);
    expect(decoded![0].grades[0].weight).toBe(1);
    expect(decoded![0].grades[0].note).toBe("");
  });

  it("pomija przedmioty bez nazwy", () => {
    expect(decodeSubjects([{ grades: [] }, { name: "  " }])).toEqual([]);
  });

  it("ogranicza pudełko fiszki do 1–5", () => {
    const decoded = decodeCards([{ deck: "A", front: "x", back: "y", box: 99 }]);
    expect(decoded![0].box).toBe(5);
  });

  it("odrzuca sesje bez wymaganych liczb", () => {
    expect(decodeSessions([{ at: Date.now(), minutes: 25 }])).toEqual([]);
    expect(decodeSessions([{ at: Date.now(), minutes: 25, seed: 1 }])).toHaveLength(1);
  });

  it("waliduje zapisany timer", () => {
    expect(decodeTimer({ mode: "focus", endAt: null, left: 1500, cycles: 2 })?.left).toBe(1500);
    expect(decodeTimer({ mode: "xyz", endAt: null, left: 10, cycles: 0 })).toBeUndefined();
    expect(decodeTimer({ mode: "focus", endAt: "jutro", left: 10, cycles: 0 })).toBeUndefined();
  });
});
