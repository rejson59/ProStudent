import { BELLS, toMin, type Bells } from "./data";

export type Status =
  | { state: "weekend" }
  | { state: "free" }
  | { state: "before"; next: number; minsTo: number }
  | { state: "lesson"; index: number; progress: number; minsLeft: number; next: number | null }
  | { state: "break"; prev: number; next: number; progress: number; minsLeft: number }
  | { state: "after" };

export function lessonStatus(now: Date, timetable: string[][], bells: Bells = BELLS): Status {
  const d = now.getDay();
  if (d === 0 || d === 6) return { state: "weekend" };
  const row = timetable[d - 1] ?? [];
  const idx = row
    .map((cell, i) => (typeof cell === "string" && cell.trim() ? i : -1))
    .filter((i) => i >= 0 && i < bells.length);
  if (!idx.length) return { state: "free" };
  const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const start = (i: number) => toMin(bells[i][0]);
  const end = (i: number) => toMin(bells[i][1]);

  if (t < start(idx[0])) return { state: "before", next: idx[0], minsTo: Math.ceil(start(idx[0]) - t) };
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (t >= start(i) && t < end(i)) {
      return { state: "lesson", index: i, progress: (t - start(i)) / (end(i) - start(i)), minsLeft: Math.ceil(end(i) - t), next: idx[k + 1] ?? null };
    }
    const n = idx[k + 1];
    if (n != null && t >= end(i) && t < start(n)) {
      return { state: "break", prev: i, next: n, progress: (t - end(i)) / (start(n) - end(i)), minsLeft: Math.ceil(start(n) - t) };
    }
  }
  return { state: "after" };
}
