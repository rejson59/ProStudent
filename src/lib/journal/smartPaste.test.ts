import { describe, expect, it } from "vitest";
import { htmlToText, recognizePaste } from "./smartPaste";
import { encodeSnapshotParam } from "./hash";
import type { JournalSnapshot } from "./types";

const NOW = new Date(2026, 9, 28); // środa, 28 października 2026

const snapshot: JournalSnapshot = {
  format: "plecak-import",
  version: 1,
  source: "eduvulcan",
  exportedAt: "2026-10-28T08:00:00.000Z",
  grades: [{ externalId: "a", subject: "Matematyka", value: "5+" }],
  timetable: [{ date: "2026-10-28", start: "08:00", end: "08:45", subject: "Matematyka" }],
};

describe("wklejanie danych", () => {
  it("przyjmuje dokument JSON", () => {
    const result = recognizePaste(JSON.stringify(snapshot), NOW);
    expect(result?.kind).toBe("json");
    expect(result?.snapshot.grades).toHaveLength(1);
    expect(result?.snapshot.source).toBe("eduvulcan");
  });

  it("przyjmuje adres z #dziennik=…", () => {
    const link = `https://rejson59.github.io/ProStudent/#dziennik=${encodeSnapshotParam(snapshot)}`;
    const result = recognizePaste(link, NOW);
    expect(result?.kind).toBe("link");
    expect(result?.snapshot.timetable?.[0].subject).toBe("Matematyka");
  });

  it("przyjmuje sam fragment bez adresu", () => {
    expect(recognizePaste(`dziennik=${encodeSnapshotParam(snapshot)}`, NOW)?.kind).toBe("link");
  });

  it("odrzuca śmieci i puste wejście", () => {
    expect(recognizePaste("", NOW)).toBeNull();
    expect(recognizePaste("   ", NOW)).toBeNull();
    expect(recognizePaste("Cześć, tu nic nie ma.", NOW)).toBeNull();
    expect(recognizePaste("{nie json}", NOW)).toBeNull();
  });
});

describe("rozpoznawanie skopiowanej strony", () => {
  it("czyta oceny w wierszach z przedmiotem", () => {
    const text = ["Oceny", "Matematyka: 5, 4, 3+", "Polski 4 5", "Fizyka 6-"].join("\n");
    const result = recognizePaste(text, NOW);
    const grades = result?.snapshot.grades ?? [];
    expect(grades.map((g) => `${g.subject}=${g.value}`)).toEqual([
      "Matematyka=5",
      "Matematyka=4",
      "Matematyka=3+",
      "Polski=4",
      "Polski=5",
      "Fizyka=6-",
    ]);
  });

  it("czyta oceny pod nazwą przedmiotu w osobnej linii", () => {
    const text = ["Matematyka", "5 4 3", "Polski", "np bz 6"].join("\n");
    const grades = recognizePaste(text, NOW)?.snapshot.grades ?? [];
    expect(grades).toHaveLength(6);
    expect(grades.at(-1)?.subject).toBe("Polski");
    expect(grades.at(-1)?.value).toBe("6");
  });

  it("nie bierze numeru lekcji za ocenę", () => {
    const text = ["1 Plan lekcji", "2 Matematyka"].join("\n");
    expect(recognizePaste(text, NOW)).toBeNull();
  });

  it("czyta plan lekcji i przypisuje daty do dni tygodnia", () => {
    const text = ["Plan lekcji", "Poniedziałek", "1 08:00 - 08:45 Matematyka 12", "2 08:55 - 09:40 Polski 8", "Wtorek", "08:00 - 08:45 Fizyka 3"].join(
      "\n"
    );
    const lessons = recognizePaste(text, NOW)?.snapshot.timetable ?? [];
    expect(lessons).toHaveLength(3);
    expect(lessons[0]).toMatchObject({ date: "2026-11-02", start: "08:00", end: "08:45", subject: "Matematyka", room: "12" });
    expect(lessons[1]).toMatchObject({ subject: "Polski", room: "8" });
    expect(lessons[2]).toMatchObject({ date: "2026-11-03", subject: "Fizyka" });
  });

  it("bez nazwy dnia przypisuje lekcje do dziś i mówi o tym", () => {
    const result = recognizePaste("08:00 - 08:45 Matematyka", NOW);
    expect(result?.snapshot.timetable?.[0].date).toBe("2026-10-28");
    expect(result?.notes.join(" ")).toContain("bez nazwy dnia");
  });

  it("czyta sprawdziany z datą", () => {
    const text = ["Sprawdziany", "Fizyka 05.11.2026 sprawdzian kinematyka", "Matematyka 12.11.2026 kartkówka"].join("\n");
    const exams = recognizePaste(text, NOW)?.snapshot.exams ?? [];
    expect(exams).toHaveLength(2);
    expect(exams[0]).toMatchObject({ subject: "Fizyka", date: "2026-11-05", type: "sprawdzian" });
    expect(exams[1]).toMatchObject({ subject: "Matematyka", date: "2026-11-12", type: "kartkówka" });
  });

  it("czyta skopiowaną tabelę HTML", () => {
    const html = `
      <table>
        <tr><td>Matematyka</td><td>5</td><td>4+</td></tr>
        <tr><td>Polski</td><td>3</td><td>5</td></tr>
      </table>`;
    const result = recognizePaste(html, NOW);
    expect(result?.kind).toBe("html");
    expect(result?.snapshot.grades?.map((g) => g.subject)).toEqual(["Matematyka", "Matematyka", "Polski", "Polski"]);
  });

  it("usuwa skrypty i style ze skopiowanej strony", () => {
    const text = htmlToText("<style>.x{color:red}</style><script>var a=1</script><p>Matematyka: 5, 4</p>");
    expect(text).not.toContain("color");
    expect(text).not.toContain("var a");
    expect(text).toContain("Matematyka: 5, 4");
  });

  it("nie dubluje tych samych ocen przy wielokrotnym skopiowaniu", () => {
    const text = ["Matematyka: 5, 5", "Matematyka: 5"].join("\n");
    const grades = recognizePaste(text, NOW)?.snapshot.grades ?? [];
    expect(grades).toHaveLength(1);
  });

  it("nie bierze wagi ani daty za ocenę", () => {
    const text = ["Matematyka 5 waga 2 12.10.2026 4 waga 1 15.10.2026"].join("\n");
    const grades = recognizePaste(text, NOW)?.snapshot.grades ?? [];
    expect(grades.map((g) => g.value)).toEqual(["5", "4"]);
  });

  it("czyta oceny rozrzucone po wierszach z datami", () => {
    const text = ["Matematyka", "5 12.10.2026", "4 15.10.2026", "3+ waga 3 20.10.2026"].join("\n");
    const values = recognizePaste(text, NOW)?.snapshot.grades?.map((g) => g.value) ?? [];
    expect(values).toEqual(["5", "4", "3+"]);
  });

  it("czyta oceny w kolumnie, gdy między nimi stoją kategorie", () => {
    const text = ["Oceny", "Matematyka", "5", "sprawdzian", "4", "aktywność", "3+", "Polski", "6"].join("\n");
    const grades = recognizePaste(text, NOW)?.snapshot.grades ?? [];
    expect(grades.map((g) => `${g.subject}=${g.value}`)).toEqual([
      "Matematyka=5",
      "Matematyka=4",
      "Matematyka=3+",
      "Polski=6",
    ]);
  });

  it("nagłówek sekcji przerywa przypisywanie ocen do przedmiotu", () => {
    const text = ["Matematyka", "5", "Frekwencja", "6"].join("\n");
    const grades = recognizePaste(text, NOW)?.snapshot.grades ?? [];
    expect(grades.map((g) => g.value)).toEqual(["5"]);
  });

  it("pomija nagłówki i menu strony", () => {
    const text = ["Dziennik", "Frekwencja", "Ogłoszenia", "Matematyka: 5"].join("\n");
    const grades = recognizePaste(text, NOW)?.snapshot.grades ?? [];
    expect(grades).toHaveLength(1);
    expect(grades[0].subject).toBe("Matematyka");
  });
});
