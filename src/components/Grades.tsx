import { useMemo, useState } from "react";
import { useLocal } from "../lib/store";
import { GRADE_NAMES, defaultSubjects, parseGrade, predicted, subjectColor, uid, weightedAvg, type Subject } from "../lib/data";
import { Btn, CardTitle, PageHeader, Ring } from "./ui";
import { Icon } from "./Icon";
import { confetti } from "../lib/confetti";

const gradeColor = (v: number | null) => {
  if (v == null) return "var(--color-muted)";
  if (v >= 5) return "var(--color-sage)";
  if (v >= 4) return "var(--color-sky)";
  if (v >= 3) return "var(--color-butter)";
  if (v >= 2) return "var(--color-clay)";
  return "#c4475a";
};

function SubjectCard({ s, onChange, onDelete, delay }: { s: Subject; onChange: (s: Subject) => void; onDelete: () => void; delay: number }) {
  const [val, setVal] = useState("");
  const [weight, setWeight] = useState(1);
  const [note, setNote] = useState("");
  const { avg } = weightedAvg(s.grades);
  const pred = predicted(avg);
  const valid = parseGrade(val) != null;
  const color = subjectColor(s.name);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onChange({ ...s, grades: [...s.grades, { id: uid(), value: val.trim(), weight, note: note.trim() }] });
    const v = parseGrade(val)!;
    if (v >= 5.5) {
      const r = (e.target as HTMLElement).getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top);
    }
    setVal("");
    setNote("");
  };

  return (
    <section className="card p-5 rise flex flex-col" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl grid place-items-center font-display font-bold text-white text-lg" style={{ background: color }}>
            {s.name[0]}
          </span>
          <div>
            <h3 className="font-semibold">{s.name}</h3>
            <p className="text-xs text-muted">{s.grades.length} ocen</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold tabular-nums" style={{ color: gradeColor(avg) }}>
            {avg ? avg.toFixed(2) : "—"}
          </p>
          {pred && <p className="text-[11px] text-muted">→ {GRADE_NAMES[pred]}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-4 min-h-[36px]">
        {s.grades.map((g) => {
          const v = parseGrade(g.value);
          return (
            <button
              key={g.id}
              title={`${g.note || "ocena"} · waga ${g.weight} · kliknij, aby usunąć`}
              onClick={() => onChange({ ...s, grades: s.grades.filter((x) => x.id !== g.id) })}
              className="relative h-9 min-w-9 px-2 rounded-xl font-bold text-sm grid place-items-center transition hover:scale-110 hover:line-through cursor-pointer"
              style={{ background: `color-mix(in oklab, ${gradeColor(v)} 18%, transparent)`, color: `color-mix(in oklab, ${gradeColor(v)} 80%, var(--color-ink))` }}
            >
              {g.value}
              {g.weight > 1 && (
                <span className="absolute -top-1.5 -right-1.5 text-[9px] w-4 h-4 rounded-full grid place-items-center bg-ink text-paper font-bold">{g.weight}</span>
              )}
            </button>
          );
        })}
        {!s.grades.length && <p className="text-xs text-muted self-center">Brak ocen – dodaj pierwszą poniżej.</p>}
      </div>

      <form onSubmit={add} className="flex gap-2 mt-4 pt-4 border-t border-line">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="5+" className="input !py-2 w-16 text-center font-bold" maxLength={2} />
        <select value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="input !py-2 !px-2 text-sm" title="Waga">
          {[1, 2, 3, 4, 5].map((w) => (
            <option key={w} value={w}>
              waga {w}
            </option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="za co?" className="input !py-2 flex-1 min-w-0 text-sm" />
        <button disabled={!valid} className="w-10 shrink-0 rounded-xl bg-ink text-paper grid place-items-center disabled:opacity-30 cursor-pointer" aria-label="Dodaj ocenę">
          <Icon name="plus" className="w-4 h-4" />
        </button>
      </form>
      <button onClick={() => confirm(`Usunąć przedmiot ${s.name}?`) && onDelete()} className="text-[11px] text-muted hover:text-clay mt-3 self-end cursor-pointer">
        usuń przedmiot
      </button>
    </section>
  );
}

export function Grades() {
  const [subjects, setSubjects] = useLocal<Subject[]>("subjects", defaultSubjects);
  const [newName, setNewName] = useState("");
  const [calcId, setCalcId] = useState<string>("");
  const [target, setTarget] = useState(4.75);
  const [nextW, setNextW] = useState(3);

  const stats = useMemo(() => {
    const avgs = subjects.map((s) => weightedAvg(s.grades).avg).filter((a): a is number => a != null);
    const preds = subjects.map((s) => predicted(weightedAvg(s.grades).avg)).filter((a): a is number => a != null);
    return {
      avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null,
      final: preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : null,
      count: subjects.reduce((a, s) => a + s.grades.length, 0),
    };
  }, [subjects]);

  const calcSubject = subjects.find((s) => s.id === calcId) ?? subjects[0];
  const need = useMemo(() => {
    if (!calcSubject) return null;
    const { sum, w } = weightedAvg(calcSubject.grades);
    return (target * (w + nextW) - sum) / nextW;
  }, [calcSubject, target, nextW]);

  const needText = () => {
    if (need == null) return "";
    if (need <= 1) return "Już masz tę średnią – nawet jedynka nie zaszkodzi 😎";
    if (need > 6) return "Jedną oceną się nie da – potrzeba kilku dobrych ocen 💪";
    const options = ["1", "2-", "2", "2+", "3-", "3", "3+", "4-", "4", "4+", "5-", "5", "5+", "6-", "6"];
    const found = options.find((o) => (parseGrade(o) ?? 0) >= need - 1e-9);
    return found ? `Potrzebujesz co najmniej ${found}` : "";
  };

  return (
    <div>
      <PageHeader kicker="Liczby bez stresu" title="Oceny i średnie" />

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        <section className="card p-6 flex items-center gap-6 rise">
          <Ring value={stats.avg ? (stats.avg - 1) / 5 : 0} size={120} color={gradeColor(stats.avg)}>
            <div>
              <div className="font-display text-3xl font-semibold">{stats.avg?.toFixed(2) ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted">średnia</div>
            </div>
          </Ring>
          <div>
            <p className="text-sm text-muted">Średnia z ocen końcowych</p>
            <p className="font-display text-3xl font-semibold">{stats.final?.toFixed(2) ?? "—"}</p>
            <p className={`text-sm font-semibold mt-1 ${stats.final && stats.final >= 4.75 ? "text-sage" : "text-muted"}`}>
              {stats.final == null ? "" : stats.final >= 4.75 ? "🎗️ Świadectwo z paskiem!" : `Do paska brakuje ${(4.75 - stats.final).toFixed(2)}`}
            </p>
            <p className="text-xs text-muted mt-1">{stats.count} ocen łącznie</p>
          </div>
        </section>

        <section className="card p-6 md:col-span-2 rise" style={{ animationDelay: ".05s" }}>
          <CardTitle icon={<Icon name="target" className="w-4 h-4" />} color="var(--color-clay)">
            Ile muszę dostać?
          </CardTitle>
          {calcSubject ? (
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <span>Z</span>
                <select value={calcSubject.id} onChange={(e) => setCalcId(e.target.value)} className="input !py-2 font-semibold">
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span>chcę średnią</span>
                <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="input !py-2 font-semibold">
                  {[1.75, 2.75, 3.75, 4.75, 5.5].map((t) => (
                    <option key={t} value={t}>
                      {t.toFixed(2)} ({GRADE_NAMES[predicted(t)!]})
                    </option>
                  ))}
                </select>
                <span>a następna ocena ma wagę</span>
                <select value={nextW} onChange={(e) => setNextW(Number(e.target.value))} className="input !py-2 font-semibold">
                  {[1, 2, 3, 4, 5].map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div className="lg:ml-auto rounded-2xl px-5 py-4 bg-paper border border-line min-w-[220px]">
                <p className="text-xs text-muted">Wynik</p>
                <p className="font-semibold leading-snug">{needText()}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Dodaj przedmiot, aby skorzystać z kalkulatora.</p>
          )}
          <p className="text-xs text-muted mt-4">Progi: 1,75 → 2 · 2,75 → 3 · 3,75 → 4 · 4,75 → 5 · 5,50 → 6. Plus = +0,5, minus = −0,25.</p>
        </section>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {subjects.map((s, i) => (
          <SubjectCard
            key={s.id}
            s={s}
            delay={0.05 * i}
            onChange={(ns) => setSubjects((p) => p.map((x) => (x.id === ns.id ? ns : x)))}
            onDelete={() => setSubjects((p) => p.filter((x) => x.id !== s.id))}
          />
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            setSubjects((p) => [...p, { id: uid(), name: newName.trim(), grades: [] }]);
            setNewName("");
          }}
          className="rounded-[1.5rem] border-2 border-dashed border-line p-5 flex flex-col justify-center gap-3 min-h-[200px]"
        >
          <p className="font-semibold text-muted text-center">Nowy przedmiot</p>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="np. Chemia" className="input text-center" />
          <Btn variant="soft" type="submit" disabled={!newName.trim()}>
            <Icon name="plus" className="w-4 h-4" /> Dodaj przedmiot
          </Btn>
        </form>
      </div>
    </div>
  );
}
