import { useMemo, useState } from "react";
import { useLocal } from "../lib/store";
import { decodeTimetable } from "../lib/schema";
import { BELLS, DAYS, DAYS_SHORT, defaultTimetable, subjectColor } from "../lib/data";
import { lessonStatus } from "../lib/schedule";
import { Btn, CardTitle, PageHeader, SubjectDot } from "./ui";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

function Cell({
  value,
  editing,
  onChange,
  active,
  past,
  label,
}: {
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  active: boolean;
  past: boolean;
  label: string;
}) {
  const color = subjectColor(value);
  if (editing)
    return (
      <input
        list="subjects-list"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        aria-label={label}
        className="w-full h-full min-h-[52px] rounded-xl px-3 text-sm bg-paper border border-dashed border-line focus:border-sage outline-none"
      />
    );
  if (!value) return <div className="min-h-[52px] rounded-xl border border-dashed border-line/70" />;
  return (
    <div
      className={`min-h-[52px] rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-2 transition ${active ? "ring-2 ring-offset-2 ring-offset-card scale-[1.03] shadow-lg" : ""} ${past ? "opacity-50" : ""}`}
      style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color: `color-mix(in oklab, ${color} 70%, var(--color-ink))`, ...(active ? { ["--tw-ring-color" as string]: color } : {}) }}
    >
      <span className="w-1 self-stretch rounded-full" style={{ background: color }} />
      <span className="truncate">{value}</span>
      {active && <span className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />}
    </div>
  );
}

export function Timetable({ now }: { now: Date }) {
  const toast = useToast();
  const [tt, setTt] = useLocal<string[][]>("timetable", defaultTimetable, decodeTimetable);
  const [editing, setEditing] = useState(false);
  const dow = now.getDay();
  const todayIdx = dow >= 1 && dow <= 5 ? dow - 1 : -1;
  const [mobileDay, setMobileDay] = useState(todayIdx >= 0 ? todayIdx : 0);
  const st = lessonStatus(now, tt);
  const activeLesson = st.state === "lesson" ? st.index : -1;

  const set = (d: number, l: number, v: string) => setTt((p) => p.map((row, i) => (i === d ? row.map((c, j) => (j === l ? v : c)) : row)));

  const allSubjects = useMemo(() => Array.from(new Set(tt.flat().filter(Boolean))).sort(), [tt]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    tt.flat().forEach((s) => s && m.set(s, (m.get(s) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tt]);
  const total = counts.reduce((a, [, n]) => a + n, 0);
  const maxN = counts[0]?.[1] ?? 1;

  const isPast = (d: number, l: number) => {
    if (d !== todayIdx) return false;
    if (st.state === "after") return true;
    if (st.state === "lesson") return l < st.index;
    if (st.state === "break") return l <= st.prev;
    return false;
  };

  return (
    <div>
      <PageHeader kicker="Tydzień w pigułce" title="Plan lekcji">
        <div className="flex gap-2">
          {editing && (
            <Btn
              variant="ghost"
              onClick={() => {
                const previous = tt.map((row) => [...row]);
                setTt(defaultTimetable.map((row) => [...row]));
                toast("Przywrócono przykładowy plan", {
                  action: { label: "Cofnij", run: () => setTt(previous) },
                });
              }}
            >
              Przywróć przykład
            </Btn>
          )}
          <Btn
            variant={editing ? "solid" : "soft"}
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
          >
            <Icon name={editing ? "check" : "edit"} className="w-4 h-4" /> {editing ? "Gotowe" : "Edytuj plan"}
          </Btn>
        </div>
      </PageHeader>
      <datalist id="subjects-list">
        {allSubjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* Desktop grid */}
      <div className="card p-4 md:p-6 hidden md:block rise">
        <div className="grid gap-2" style={{ gridTemplateColumns: "88px repeat(5, minmax(0, 1fr))" }}>
          <div />
          {DAYS.map((d, i) => (
            <div key={d} className={`text-center text-sm font-semibold py-2 rounded-xl ${i === todayIdx ? "bg-ink text-paper" : "text-muted"}`}>
              {d}
            </div>
          ))}
          {BELLS.map((b, l) => (
            <div key={l} className="contents">
              <div className={`flex flex-col justify-center text-xs tabular-nums pr-2 ${activeLesson === l ? "text-ink font-semibold" : "text-muted"}`}>
                <span className="font-display text-base text-ink">{l + 1}.</span>
                {b[0]}–{b[1]}
              </div>
              {DAYS.map((_, d) => (
                <Cell
                  key={d}
                  value={tt[d][l]}
                  editing={editing}
                  onChange={(v) => set(d, l, v)}
                  active={d === todayIdx && l === activeLesson}
                  past={isPast(d, l)}
                  label={`${DAYS[d]}, ${l + 1}. lekcja (${b[0]}–${b[1]})`}
                />
              ))}
            </div>
          ))}
        </div>
        {editing && <p className="text-xs text-muted mt-4">Wpisz nazwę przedmiotu w dowolne pole. Kolory przypisują się same. Puste pole = okienko.</p>}
      </div>

      {/* Mobile list */}
      <div className="md:hidden rise">
        <div className="flex gap-2 mb-4">
          {DAYS_SHORT.map((d, i) => (
            <button key={d} onClick={() => setMobileDay(i)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer ${mobileDay === i ? "bg-ink text-paper" : "card"} ${i === todayIdx && mobileDay !== i ? "!border-sage" : ""}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="card p-4 space-y-2">
          {BELLS.map((b, l) => (
            <div key={l} className="flex items-center gap-3">
              <div className="w-16 text-xs text-muted tabular-nums">
                <b className="text-ink">{l + 1}.</b> {b[0]}
              </div>
              <div className="flex-1">
                <Cell
                  value={tt[mobileDay][l]}
                  editing={editing}
                  onChange={(v) => set(mobileDay, l, v)}
                  active={mobileDay === todayIdx && l === activeLesson}
                  past={isPast(mobileDay, l)}
                  label={`${DAYS[mobileDay]}, ${l + 1}. lekcja (${b[0]}–${b[1]})`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <section className="card p-6 rise" style={{ animationDelay: ".1s" }}>
          <CardTitle icon={<Icon name="chart" className="w-4 h-4" />} color="var(--color-lav)">
            Godziny w tygodniu · {total}
          </CardTitle>
          <div className="space-y-2.5">
            {counts.map(([s, n]) => (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-28 truncate flex items-center gap-2">
                  <SubjectDot color={subjectColor(s)} />
                  {s}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(n / maxN) * 100}%`, background: subjectColor(s) }} />
                </div>
                <span className="w-6 text-right tabular-nums text-muted">{n}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-6 rise" style={{ animationDelay: ".15s" }}>
          <CardTitle icon={<Icon name="timer" className="w-4 h-4" />} color="var(--color-butter)">
            Dzwonki
          </CardTitle>
          <div className="grid grid-cols-2 gap-2">
            {BELLS.map((b, i) => (
              <div key={i} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${activeLesson === i && todayIdx >= 0 ? "bg-butter/20 font-semibold" : "bg-paper"}`}>
                <span className="text-muted">{i + 1}.</span>
                <span className="tabular-nums">
                  {b[0]} – {b[1]}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-4">Przerwy po 10 min, długa przerwa obiadowa po 4. lekcji (20 min).</p>
        </section>
      </div>
    </div>
  );
}
