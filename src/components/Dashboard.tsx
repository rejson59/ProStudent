import { useMemo, useState } from "react";
import { Sky, skyInfo } from "./Sky";
import { Garden } from "./Garden";
import { Icon } from "./Icon";
import { Btn, CardTitle, Ring, SubjectDot } from "./ui";
import { useLocal } from "../lib/store";
import { decodeBells, decodeSubjects, decodeTasks, decodeText, decodeTimetable } from "../lib/schema";
import { InstallCard } from "./InstallCard";
import {
  BELLS,
  QUOTES,
  dateISO,
  daysUntil,
  defaultSubjects,
  defaultTasks,
  defaultTimetable,
  plural,
  predicted,
  relDay,
  schoolYearBounds,
  subjectColor,
  weightedAvg,
  type Bells,
  type Session,
  type Subject,
  type Task,
} from "../lib/data";
import { lessonStatus } from "../lib/schedule";
import { fmt, MODE_LABEL, type Timer } from "../lib/useTimer";
import { confettiFrom } from "../lib/confetti";

type Props = { now: Date; timer: Timer; go: (t: string) => void; sessions: Session[] };

function greeting(h: number) {
  if (h < 5) return "Hej, nocny marku";
  if (h < 11) return "Dzień dobry";
  if (h < 17) return "Cześć";
  if (h < 22) return "Dobry wieczór";
  return "Czas na sen?";
}

export function Dashboard({ now, timer, go, sessions }: Props) {
  const [name, setName] = useLocal("name", "", decodeText);
  const [editingName, setEditingName] = useState(false);
  const [timetable] = useLocal<string[][]>("timetable", defaultTimetable, decodeTimetable);
  const [tasks, setTasks] = useLocal<Task[]>("tasks", defaultTasks, decodeTasks);
  const [subjects] = useLocal<Subject[]>("subjects", defaultSubjects, decodeSubjects);
  const [note, setNote] = useLocal("quicknote", "", decodeText);
  const [bells] = useLocal<Bells>("bells", BELLS, decodeBells);

  const { day } = skyInfo(now);
  const darkText = day > 0.55;
  const status = lessonStatus(now, timetable, bells);
  const dow = now.getDay();
  const todayRow = dow >= 1 && dow <= 5 ? timetable[dow - 1] : [];

  const upcoming = useMemo(() => tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5), [tasks]);

  const overall = useMemo(() => {
    const avgs = subjects.map((s) => weightedAvg(s.grades).avg).filter((a): a is number => a != null);
    return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  }, [subjects]);
  const finalAvg = useMemo(() => {
    const p = subjects.map((s) => predicted(weightedAvg(s.grades).avg)).filter((a): a is number => a != null);
    return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null;
  }, [subjects]);

  const todayISO = dateISO(now);
  const todaySessions = sessions.filter((s) => dateISO(new Date(s.at)) === todayISO);
  const todayMin = todaySessions.reduce((a, s) => a + s.minutes, 0);

  const sy = schoolYearBounds(now);
  const daysLeft = Math.max(0, Math.ceil((sy.end.getTime() - now.getTime()) / 86400000));
  const yearProgress = Math.min(1, Math.max(0, (now.getTime() - sy.start.getTime()) / (sy.end.getTime() - sy.start.getTime())));

  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const quote = QUOTES[dayOfYear % QUOTES.length];

  const dateStr = now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  const time = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  const toggle = (id: string, el: HTMLElement) => {
    const t = tasks.find((x) => x.id === id);
    if (t && !t.done) confettiFrom(el);
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  };

  return (
    <div className="space-y-5">
      {/* Na telefonie/tablecie: propozycja instalacji (znika po „Nie teraz”). */}
      <div className="md:hidden">
        <InstallCard compact dismissible />
      </div>
      <div className="grid gap-5 grid-cols-1 md:grid-cols-6 xl:grid-cols-12">
      {/* HERO */}
      <section className="md:col-span-6 xl:col-span-12 rounded-[1.75rem] overflow-hidden card !p-0 rise">
        <Sky now={now} className="min-h-[300px] md:min-h-[330px]">
          <div className={`p-6 md:p-9 flex flex-col md:flex-row md:items-end justify-between gap-6 min-h-[300px] md:min-h-[330px] ${darkText ? "text-[#1d2740]" : "text-white"}`}>
            <div className="max-w-xl">
              <p className="capitalize text-sm font-semibold opacity-80">{dateStr}</p>
              <h1 className="font-display text-4xl md:text-6xl font-semibold tracking-tight mt-1 leading-[1.05]">
                {greeting(now.getHours())}
                {editingName ? (
                  <>
                    ,{" "}
                    <input
                      autoFocus
                      defaultValue={name}
                      onBlur={(e) => {
                        setName(e.target.value.trim());
                        setEditingName(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      placeholder="imię"
                      className="bg-transparent border-b-2 border-current outline-none w-44 placeholder:opacity-50"
                    />
                  </>
                ) : (
                  <button onClick={() => setEditingName(true)} className="cursor-pointer hover:opacity-80" title="Kliknij, by zmienić imię">
                    {name ? `, ${name}` : ""}
                    {!name && <span className="text-xl md:text-2xl align-middle ml-3 opacity-70 underline decoration-dotted">jak masz na imię?</span>}
                  </button>
                )}
              </h1>
              <p className="mt-3 text-sm md:text-base opacity-85 max-w-md">
                {status.state === "weekend" && "Weekend! Odpocznij, a w niedzielę wieczorem zerknij na plan. ☕"}
                {status.state === "free" && "Dziś wolne od lekcji. Idealny dzień na nadrobienie czegoś małego."}
                {status.state === "before" && `Pierwsza lekcja za ${status.minsTo} min: ${todayRow[status.next]}.`}
                {status.state === "lesson" && `Trwa ${todayRow[status.index]} – jeszcze ${status.minsLeft} min.`}
                {status.state === "break" && `Przerwa! Następnie ${todayRow[status.next]} za ${status.minsLeft} min.`}
                {status.state === "after" && (upcoming.length ? `Lekcje za Tobą. Na liście czeka ${upcoming.length} ${plural(upcoming.length, "zadanie", "zadania", "zadań")}.` : "Lekcje za Tobą i nic nie wisi. Brawo! 🌿")}
              </p>
            </div>
            <div className={`rounded-2xl px-5 py-4 backdrop-blur-md ${darkText ? "bg-white/40" : "bg-black/20"} min-w-[220px]`}>
              <div className="font-display text-5xl font-semibold tabular-nums tracking-tight">{time}</div>
              {timer.running ? (
                <button onClick={() => go("focus")} className="mt-2 text-sm font-semibold flex items-center gap-2 cursor-pointer">
                  <span className="w-2 h-2 rounded-full bg-clay animate-pulse" /> {MODE_LABEL[timer.mode]} · {fmt(timer.remaining)}
                </button>
              ) : (
                <p className="mt-1 text-sm opacity-80">{sy.onVacation ? "Wakacje! ☀️" : `${daysLeft} ${plural(daysLeft, "dzień", "dni", "dni")} do wakacji`}</p>
              )}
            </div>
          </div>
        </Sky>
      </section>

      {/* NOW */}
      <section className="card p-6 md:col-span-3 xl:col-span-4 rise" style={{ animationDelay: ".05s" }}>
        <CardTitle icon={<Icon name="timer" className="w-4 h-4" />} color="var(--color-clay)">
          Teraz i za chwilę
        </CardTitle>
        {status.state === "lesson" || status.state === "break" ? (
          <div>
            <div className="flex items-center gap-3">
              <SubjectDot color={status.state === "lesson" ? subjectColor(todayRow[status.index]) : "var(--color-butter)"} className="w-3.5 h-3.5" />
              <div className="flex-1">
                <p className="text-xs text-muted">{status.state === "lesson" ? `Lekcja ${status.index + 1} · ${(bells[status.index] ?? []).join("–")}` : "Przerwa"}</p>
                <p className="font-display text-2xl font-semibold">{status.state === "lesson" ? todayRow[status.index] : "Odetchnij 🍎"}</p>
              </div>
              <p className="text-right">
                <span className="font-display text-3xl font-semibold tabular-nums">{status.minsLeft}</span>
                <span className="text-xs text-muted block">min</span>
              </p>
            </div>
            <div className="h-2.5 rounded-full bg-line mt-4 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${status.progress * 100}%`, background: status.state === "lesson" ? subjectColor(todayRow[status.index]) : "var(--color-butter)" }} />
            </div>
            {(status.state === "break" || status.next != null) && (
              <p className="text-sm text-muted mt-4">
                Następnie: <b className="text-ink">{todayRow[status.state === "break" ? status.next : status.next!]}</b> o {bells[status.state === "break" ? status.next : status.next!]?.[0] ?? "—"}
              </p>
            )}
            {status.state === "lesson" && status.next == null && <p className="text-sm text-muted mt-4">To ostatnia lekcja dzisiaj! 🎉</p>}
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">{status.state === "weekend" ? "🛋️" : status.state === "before" ? "🌅" : status.state === "free" ? "🎈" : "🌙"}</div>
            <p className="font-semibold">
              {status.state === "weekend" && "Weekend – brak lekcji"}
              {status.state === "free" && "Dziś bez lekcji"}
              {status.state === "before" && `Start o ${bells[status.next]?.[0] ?? "—"}`}
              {status.state === "after" && "Koniec lekcji na dziś"}
            </p>
            <p className="text-sm text-muted mt-1">Plan na jutro znajdziesz w zakładce „Plan lekcji”.</p>
          </div>
        )}
      </section>

      {/* TODAY PLAN */}
      <section className="card p-6 md:col-span-3 xl:col-span-4 rise" style={{ animationDelay: ".1s" }}>
        <CardTitle icon={<Icon name="calendar" className="w-4 h-4" />} color="var(--color-sky)" action={<button onClick={() => go("plan")} className="text-xs text-muted hover:text-ink cursor-pointer">cały plan →</button>}>
          Dzisiejszy plan
        </CardTitle>
        {todayRow.filter(Boolean).length ? (
          <ol className="space-y-1.5">
            {todayRow.map((s, i) =>
              s ? (
                <li
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${status.state === "lesson" && status.index === i ? "bg-sky/15 font-semibold" : ""} ${(status.state === "after" || (status.state === "lesson" && i < status.index) || (status.state === "break" && i <= status.prev)) ? "opacity-45" : ""}`}
                >
                  <span className="text-muted tabular-nums w-11 text-xs">{bells[i]?.[0] ?? "—"}</span>
                  <SubjectDot color={subjectColor(s)} />
                  <span className="flex-1">{s}</span>
                  <span className="text-xs text-muted">{i + 1}</span>
                </li>
              ) : null
            )}
          </ol>
        ) : (
          <p className="text-sm text-muted py-6 text-center">Brak lekcji dzisiaj 🎈</p>
        )}
      </section>

      {/* UPCOMING */}
      <section className="card p-6 md:col-span-6 xl:col-span-4 rise" style={{ animationDelay: ".15s" }}>
        <CardTitle icon={<Icon name="check" className="w-4 h-4" />} color="var(--color-lav)" action={<button onClick={() => go("tasks")} className="text-xs text-muted hover:text-ink cursor-pointer">wszystkie →</button>}>
          Na horyzoncie
        </CardTitle>
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((t) => {
              const d = daysUntil(t.due);
              return (
                <li key={t.id} className="flex items-center gap-3 group">
                  <button onClick={(e) => toggle(t.id, e.currentTarget)} className="w-5 h-5 rounded-md border-2 border-line hover:border-sage grid place-items-center shrink-0 cursor-pointer" aria-label="Oznacz jako zrobione" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted flex items-center gap-1.5">
                      <SubjectDot color={subjectColor(t.subject)} className="w-1.5 h-1.5" /> {t.subject} · {t.kind}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap ${d < 0 ? "bg-clay/15 text-clay" : d <= 1 ? "bg-butter/25 text-[#7a5510]" : "bg-line/70 text-muted"}`}>{relDay(t.due)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted py-6 text-center">Czysto! Nic nie wisi nad głową ✨</p>
        )}
      </section>

      {/* AVERAGE */}
      <section className="card p-6 md:col-span-3 xl:col-span-3 rise" style={{ animationDelay: ".2s" }}>
        <CardTitle icon={<Icon name="chart" className="w-4 h-4" />} color="var(--color-butter)">
          Średnia
        </CardTitle>
        <div className="flex items-center gap-5">
          <Ring value={overall ? (overall - 1) / 5 : 0} size={110} color={finalAvg != null && finalAvg >= 4.75 ? "var(--color-sage)" : "var(--color-butter)"}>
            <div>
              <div className="font-display text-3xl font-semibold">{overall ? overall.toFixed(2) : "—"}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider">ważona</div>
            </div>
          </Ring>
          <div className="text-sm space-y-1">
            <p className="text-muted">Prognoza końcowa</p>
            <p className="font-display text-2xl font-semibold">{finalAvg ? finalAvg.toFixed(2) : "—"}</p>
            {finalAvg != null && (
              <p className={`text-xs font-semibold ${finalAvg >= 4.75 ? "text-sage" : "text-muted"}`}>
                {finalAvg >= 4.75 ? "🎗️ Pasek w zasięgu!" : `Do paska: ${(4.75 - finalAvg).toFixed(2)}`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* GARDEN */}
      <section className="card p-6 md:col-span-3 xl:col-span-5 rise overflow-hidden" style={{ animationDelay: ".25s" }}>
        <CardTitle
          icon={<Icon name="leaf" className="w-4 h-4" />}
          action={
            <Btn variant="soft" className="!py-1.5 !px-3 text-xs" onClick={() => go("focus")}>
              <Icon name="play" className="w-3 h-3" /> Fokus
            </Btn>
          }
        >
          Ogród skupienia
        </CardTitle>
        <p className="text-xs text-muted -mt-2">
          Dziś: <b className="text-ink">{todayMin} min</b> · {todaySessions.length} {plural(todaySessions.length, "nowy kwiat", "nowe kwiaty", "nowych kwiatów")} · łącznie {sessions.length}
        </p>
        <div className="-mx-6 -mb-6">
          <Garden sessions={sessions} height={130} />
        </div>
      </section>

      {/* COUNTDOWN */}
      <section className="card p-6 md:col-span-3 xl:col-span-4 rise" style={{ animationDelay: ".3s" }}>
        <CardTitle icon={<Icon name="sun" className="w-4 h-4" />} color="var(--color-clay)">
          Do wakacji
        </CardTitle>
        {sy.onVacation ? (
          <p className="font-display text-3xl">Wakacje trwają ☀️</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold tabular-nums">{daysLeft}</span>
              <span className="text-muted">{plural(daysLeft, "dzień", "dni", "dni")}</span>
            </div>
            <div className="mt-4 h-3 rounded-full bg-line overflow-hidden relative">
              <div className="h-full rounded-full bg-gradient-to-r from-sage via-butter to-clay" style={{ width: `${yearProgress * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted mt-1.5">
              <span>1 września</span>
              <span>{Math.round(yearProgress * 100)}% roku za Tobą</span>
              <span>{sy.end.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
            </div>
          </>
        )}
      </section>

      {/* NOTE */}
      <section className="card p-6 md:col-span-3 xl:col-span-4 rise" style={{ animationDelay: ".35s" }}>
        <CardTitle icon={<Icon name="edit" className="w-4 h-4" />} color="var(--color-rose)">
          Szybka notatka
        </CardTitle>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Zapisz cokolwiek: numer strony, pomysł, kod do szafki…"
          className="w-full h-28 resize-none bg-transparent outline-none text-sm leading-7"
          style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, var(--color-line) 27px, var(--color-line) 28px)" }}
        />
      </section>

      {/* QUOTE */}
      <section
        className="md:col-span-6 xl:col-span-4 rise rounded-[1.5rem] p-6 relative overflow-hidden text-white"
        style={{ animationDelay: ".4s", background: "linear-gradient(135deg, #4b4680, #7c3f5c 65%, #8a5a34)" }}
      >
        <Icon name="sparkle" className="w-24 h-24 absolute -right-4 -top-4 opacity-20" />
        <p className="text-xs uppercase tracking-[.2em] font-semibold opacity-80">Myśl dnia</p>
        <p className="font-display text-xl md:text-2xl mt-3 leading-snug">„{quote[0]}”</p>
        <p className="text-sm mt-3 opacity-80">— {quote[1]}</p>
      </section>
      </div>
    </div>
  );
}
