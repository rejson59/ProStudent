import { useMemo, useState } from "react";
import { useLocal } from "../lib/store";
import { decodeTasks, decodeTasksFilter, decodeTimetable } from "../lib/schema";
import { addDays, dateISO, daysUntil, defaultTasks, defaultTimetable, relDay, subjectColor, uid, type Kind, type Task } from "../lib/data";
import { confettiFrom } from "../lib/confetti";
import { Btn, PageHeader, SubjectDot } from "./ui";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

const KINDS: { id: Kind; emoji: string; color: string }[] = [
  { id: "zadanie", emoji: "📝", color: "var(--color-sky)" },
  { id: "kartkówka", emoji: "⚡", color: "var(--color-butter)" },
  { id: "sprawdzian", emoji: "🎯", color: "var(--color-clay)" },
  { id: "projekt", emoji: "🧩", color: "var(--color-lav)" },
];
const kindOf = (k: Kind) => KINDS.find((x) => x.id === k)!;

function groupOf(t: Task) {
  const d = daysUntil(t.due);
  if (d < 0) return "Zaległe";
  if (d === 0) return "Dziś";
  if (d === 1) return "Jutro";
  if (d <= 7) return "W tym tygodniu";
  return "Później";
}
const ORDER = ["Zaległe", "Dziś", "Jutro", "W tym tygodniu", "Później"];

export function Tasks() {
  const toast = useToast();
  const [tasks, setTasks] = useLocal<Task[]>("tasks", defaultTasks, decodeTasks);
  const [tt] = useLocal<string[][]>("timetable", defaultTimetable, decodeTimetable);
  const subjects = useMemo(() => Array.from(new Set(tt.flat().filter(Boolean))).sort(), [tt]);
  // Filtr jest zapamiętywany — wcześniej powrót na zakładkę zawsze resetował go do „Do zrobienia”.
  const [filter, setFilter] = useLocal<"todo" | "done" | "all">("tasksFilter", "todo", decodeTasksFilter);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [due, setDue] = useState(dateISO(addDays(new Date(), 1)));
  const [kind, setKind] = useState<Kind>("zadanie");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setTasks((ts) => [...ts, { id: uid(), title: title.trim(), subject: subject || "Inne", due, kind, done: false }]);
    setTitle("");
  };

  const toggle = (id: string, el: HTMLElement) => {
    const t = tasks.find((x) => x.id === id);
    if (t && !t.done) confettiFrom(el);
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  };
  const remove = (id: string) => {
    const index = tasks.findIndex((task) => task.id === id);
    const removed = tasks[index];
    if (!removed) return;
    setTasks((ts) => ts.filter((x) => x.id !== id));
    toast(`Usunięto: „${removed.title}”`, {
      action: {
        label: "Cofnij",
        run: () =>
          setTasks((ts) => {
            if (ts.some((x) => x.id === removed.id)) return ts;
            const next = [...ts];
            next.splice(Math.min(index, next.length), 0, removed);
            return next;
          }),
      },
    });
  };

  const visible = tasks.filter((t) => (filter === "all" ? true : filter === "done" ? t.done : !t.done)).sort((a, b) => a.due.localeCompare(b.due));
  const groups = filter === "done" ? [["Zrobione", visible] as const] : ORDER.map((g) => [g, visible.filter((t) => groupOf(t) === g)] as const).filter(([, l]) => l.length);

  const todo = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - todo;
  const overdue = tasks.filter((t) => !t.done && daysUntil(t.due) < 0).length;
  const exams = tasks.filter((t) => !t.done && (t.kind === "sprawdzian" || t.kind === "kartkówka") && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7).length;

  return (
    <div>
      <PageHeader kicker="Nic nie umknie" title="Zadania i sprawdziany">
        <div className="flex gap-1 p-1 rounded-2xl bg-line/60">
          {(
            [
              ["todo", `Do zrobienia · ${todo}`],
              ["done", `Zrobione · ${doneCount}`],
              ["all", "Wszystkie"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${filter === id ? "bg-card shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3 md:gap-5 mb-5">
        {[
          { n: todo, label: "otwartych", color: "var(--color-sky)" },
          { n: exams, label: "testów w 7 dni", color: "var(--color-butter)" },
          { n: overdue, label: "zaległych", color: "var(--color-clay)" },
        ].map((s, i) => (
          <div key={i} className="card p-4 md:p-5 rise" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="font-display text-3xl md:text-4xl font-semibold" style={{ color: s.color }}>
              {s.n}
            </div>
            <div className="text-xs md:text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="card p-4 md:p-5 mb-6 rise">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Co trzeba zrobić? np. „Zad. 5 str. 87”"
            aria-label="Treść zadania"
            className="input flex-1"
          />
          <div className="flex gap-3">
            <input
              list="task-subjects"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Przedmiot"
              aria-label="Przedmiot"
              className="input w-full md:w-40"
            />
            <datalist id="task-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Termin zadania"
              className="input"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k.id}
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition cursor-pointer ${kind === k.id ? "border-transparent" : "border-line text-muted hover:text-ink"}`}
                style={kind === k.id ? { background: `color-mix(in oklab, ${k.color} 20%, transparent)`, color: `color-mix(in oklab, ${k.color} 75%, var(--color-ink))` } : {}}
              >
                {k.emoji} {k.id}
              </button>
            ))}
          </div>
          <Btn type="submit" disabled={!title.trim()}>
            <Icon name="plus" className="w-4 h-4" /> Dodaj
          </Btn>
        </div>
      </form>

      {groups.length === 0 && (
        <div className="text-center py-16 rise">
          <div className="text-6xl mb-3">🌤️</div>
          <p className="font-display text-2xl">Pusto jak w szkole w sierpniu</p>
          <p className="text-muted text-sm mt-1">Dodaj zadanie powyżej albo wciśnij Ctrl+K i wpisz „+ nazwa”.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([g, list], gi) => (
          <section key={g} className="rise" style={{ animationDelay: `${gi * 0.05}s` }}>
            <h2 className={`text-xs uppercase tracking-[.18em] font-bold mb-2.5 ${g === "Zaległe" ? "text-clay" : "text-muted"}`}>
              {g} <span className="opacity-60">· {list.length}</span>
            </h2>
            <ul className="space-y-2">
              {list.map((t) => {
                const k = kindOf(t.kind);
                return (
                  <li key={t.id} className={`card !rounded-2xl px-4 py-3 flex items-center gap-3 group transition ${t.done ? "opacity-55" : "hover:-translate-y-0.5"}`}>
                    <button
                      onClick={(e) => toggle(t.id, e.currentTarget)}
                      className={`w-6 h-6 rounded-lg border-2 grid place-items-center shrink-0 transition cursor-pointer ${t.done ? "bg-sage border-sage text-white" : "border-line hover:border-sage"}`}
                      aria-label="Przełącz wykonanie"
                    >
                      {t.done && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                    </button>
                    <span className="w-1 h-9 rounded-full shrink-0" style={{ background: subjectColor(t.subject) }} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${t.done ? "line-through" : ""}`}>{t.title}</p>
                      <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                        <SubjectDot color={subjectColor(t.subject)} className="w-1.5 h-1.5" />
                        {t.subject}
                        <span className="opacity-50">·</span>
                        <span>
                          {k.emoji} {t.kind}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${!t.done && daysUntil(t.due) < 0 ? "text-clay" : ""}`}>{relDay(t.due)}</p>
                      <p className="text-[11px] text-muted">{new Date(t.due + "T00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" })}</p>
                    </div>
                    <button
                      onClick={() => remove(t.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted hover:text-clay p-1.5 rounded-lg transition cursor-pointer"
                      aria-label={`Usuń zadanie: ${t.title}`}
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
