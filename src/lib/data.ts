export type Kind = "zadanie" | "kartkówka" | "sprawdzian" | "projekt";
export type Task = { id: string; title: string; subject: string; due: string; kind: Kind; done: boolean };
export type Grade = { id: string; value: string; weight: number; note: string };
export type Subject = { id: string; name: string; grades: Grade[] };
export type Card = { id: string; deck: string; front: string; back: string; box: number };
export type Session = { id: string; at: number; minutes: number; seed: number };

export const uid = () => Math.random().toString(36).slice(2, 10);

export const BELLS: [string, string][] = [
  ["8:00", "8:45"],
  ["8:55", "9:40"],
  ["9:50", "10:35"],
  ["10:45", "11:30"],
  ["11:50", "12:35"],
  ["12:45", "13:30"],
  ["13:40", "14:25"],
  ["14:35", "15:20"],
];

export const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"];
export const DAYS_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt"];

export const defaultTimetable: string[][] = [
  ["Matematyka", "Polski", "Angielski", "Fizyka", "WF", "Historia", "", ""],
  ["Biologia", "Matematyka", "Chemia", "Polski", "Geografia", "Informatyka", "Angielski", ""],
  ["Polski", "Historia", "Matematyka", "WF", "Angielski", "Plastyka", "", ""],
  ["Chemia", "Fizyka", "Polski", "Matematyka", "Biologia", "Godz. wych.", "WF", ""],
  ["Angielski", "Informatyka", "Geografia", "Matematyka", "Polski", "", "", ""],
];

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function parseGrade(s: string): number | null {
  const m = s.trim().match(/^([1-6])\s*([+-]?)$/);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2] === "+") v += 0.5;
  if (m[2] === "-") v -= 0.25;
  return Math.min(6, Math.max(1, v));
}

export function weightedAvg(grades: Grade[]) {
  let sum = 0;
  let w = 0;
  for (const g of grades) {
    const v = parseGrade(g.value);
    if (v == null) continue;
    sum += v * g.weight;
    w += g.weight;
  }
  return { avg: w ? sum / w : null, sum, w };
}

export function predicted(avg: number | null): number | null {
  if (avg == null) return null;
  if (avg >= 5.5) return 6;
  if (avg >= 4.75) return 5;
  if (avg >= 3.75) return 4;
  if (avg >= 2.75) return 3;
  if (avg >= 1.75) return 2;
  return 1;
}

export const GRADE_NAMES: Record<number, string> = {
  6: "celujący",
  5: "bardzo dobry",
  4: "dobry",
  3: "dostateczny",
  2: "dopuszczający",
  1: "niedostateczny",
};

export const PALETTE = ["#6f9f7e", "#e07a5f", "#eebc55", "#8f8ad4", "#5f9fd6", "#e3879a", "#4fb3a9", "#c48a5a", "#a77fc4", "#7aa84a"];

const KNOWN: Record<string, string> = {
  matematyka: "#5f9fd6",
  polski: "#e07a5f",
  angielski: "#8f8ad4",
  fizyka: "#4fb3a9",
  chemia: "#a77fc4",
  biologia: "#7aa84a",
  historia: "#c48a5a",
  geografia: "#6f9f7e",
  wf: "#eebc55",
  informatyka: "#5b8bd0",
  plastyka: "#e3879a",
};

export function subjectColor(name: string) {
  // Defensywnie: dane z localStorage mogą być w starym formacie.
  const key = (typeof name === "string" ? name : "").trim().toLowerCase();
  if (!key) return "var(--color-muted)";
  if (KNOWN[key]) return KNOWN[key];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const dateISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function daysUntil(iso: string) {
  const today = new Date(dateISO(new Date()) + "T00:00:00");
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const l = n % 10;
  const l2 = n % 100;
  if (l >= 2 && l <= 4 && !(l2 >= 12 && l2 <= 14)) return few;
  return many;
}

export function relDay(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return "dziś";
  if (n === 1) return "jutro";
  if (n === 2) return "pojutrze";
  if (n === -1) return "wczoraj";
  if (n < 0) return `${-n} ${plural(-n, "dzień", "dni", "dni")} temu`;
  return `za ${n} ${plural(n, "dzień", "dni", "dni")}`;
}

/** Koniec roku szkolnego: ostatni piątek czerwca (pierwszy piątek po 20 czerwca). */
export function schoolYearBounds(now: Date) {
  const endOf = (y: number) => {
    const e = new Date(y, 5, 21);
    while (e.getDay() !== 5) e.setDate(e.getDate() + 1);
    return e;
  };
  const startOf = (y: number) => {
    const s = new Date(y, 8, 1);
    while (s.getDay() === 0 || s.getDay() === 6) s.setDate(s.getDate() + 1);
    return s;
  };
  let y = now.getFullYear();
  if (now.getMonth() >= 8) y += 1;
  const end = endOf(y);
  const nextStart = startOf(y);
  const onVacation = now > addDays(end, 1) && now < nextStart;
  return { start: startOf(y - 1), end, onVacation, nextStart };
}

export const QUOTES = [
  ["Nie musisz być świetny, żeby zacząć. Ale musisz zacząć, żeby być świetny.", "Zig Ziglar"],
  ["Sukces to suma małych wysiłków powtarzanych dzień po dniu.", "Robert Collier"],
  ["Wykształcenie to to, co zostaje, gdy zapomnisz wszystkiego, czego się nauczyłeś.", "Albert Einstein"],
  ["Najlepszy moment na posadzenie drzewa był 20 lat temu. Drugi najlepszy jest teraz.", "przysłowie chińskie"],
  ["Ciekawość jest silniejsza niż strach.", "Wisława Szymborska (parafraza)"],
  ["Nie liczy się, jak wolno idziesz, dopóki się nie zatrzymujesz.", "Konfucjusz"],
  ["Rób, co możesz, z tym, co masz, tam, gdzie jesteś.", "Theodore Roosevelt"],
  ["Mózg to nie naczynie do napełnienia, lecz ogień do rozpalenia.", "Plutarch"],
  ["Jedna strona dziennie to 365 stron rocznie.", "zdrowy rozsądek"],
  ["Błąd to dowód, że próbujesz.", "nieznany autor"],
  ["Odpoczynek też jest częścią nauki.", "każdy dobry nauczyciel"],
];

export function defaultTasks(): Task[] {
  const t = new Date();
  return [
    { id: uid(), title: "Rozprawka: „Lalka” – motyw samotności", subject: "Polski", due: dateISO(addDays(t, 2)), kind: "zadanie", done: false },
    { id: uid(), title: "Funkcja kwadratowa – rozdział 4", subject: "Matematyka", due: dateISO(addDays(t, 4)), kind: "sprawdzian", done: false },
    { id: uid(), title: "Słówka Unit 6", subject: "Angielski", due: dateISO(addDays(t, 1)), kind: "kartkówka", done: false },
    { id: uid(), title: "Prezentacja o ekosystemach", subject: "Biologia", due: dateISO(addDays(t, 9)), kind: "projekt", done: false },
    { id: uid(), title: "Zad. 3–7 str. 112", subject: "Fizyka", due: dateISO(addDays(t, -1)), kind: "zadanie", done: true },
  ];
}

export function defaultSubjects(): Subject[] {
  const g = (value: string, weight: number, note = ""): Grade => ({ id: uid(), value, weight, note });
  return [
    { id: uid(), name: "Matematyka", grades: [g("4", 3, "sprawdzian"), g("5", 1, "zadanie"), g("3+", 2, "kartkówka"), g("5", 1)] },
    { id: uid(), name: "Polski", grades: [g("5-", 3, "wypracowanie"), g("4", 2, "kartkówka"), g("6", 1, "aktywność")] },
    { id: uid(), name: "Angielski", grades: [g("5", 2), g("5+", 1), g("4", 3, "test")] },
    { id: uid(), name: "Biologia", grades: [g("4+", 2), g("4", 3)] },
    { id: uid(), name: "Historia", grades: [g("3", 3, "sprawdzian"), g("5", 1, "referat")] },
  ];
}

export function defaultCards(): Card[] {
  const c = (deck: string, front: string, back: string): Card => ({ id: uid(), deck, front, back, box: 1 });
  return [
    c("Angielski", "to procrastinate", "zwlekać, odkładać na później"),
    c("Angielski", "reliable", "niezawodny, godny zaufania"),
    c("Angielski", "to take for granted", "uważać za oczywiste"),
    c("Angielski", "thoroughly", "dokładnie, gruntownie"),
    c("Historia", "Chrzest Polski", "966 r."),
    c("Historia", "Bitwa pod Grunwaldem", "15 lipca 1410 r."),
    c("Historia", "Konstytucja 3 Maja", "1791 r. – pierwsza w Europie"),
    c("Chemia", "H₂SO₄", "kwas siarkowy(VI)"),
    c("Chemia", "Liczba Avogadra", "6,022 · 10²³ mol⁻¹"),
    c("Chemia", "NaCl", "chlorek sodu (sól kuchenna)"),
  ];
}
