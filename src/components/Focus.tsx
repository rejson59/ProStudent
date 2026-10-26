import { useState } from "react";
import { ambient, type SoundId } from "../lib/audio";
import { addDays, dateISO, plural, type Session } from "../lib/data";
import { fmt, MODE_LABEL, type Mode, type Timer } from "../lib/useTimer";
import { Garden } from "./Garden";
import { Icon } from "./Icon";
import { CardTitle, PageHeader } from "./ui";

const SOUNDS: { id: SoundId; label: string; icon: string; color: string }[] = [
  { id: "rain", label: "Deszcz", icon: "rain", color: "var(--color-sky)" },
  { id: "waves", label: "Fale", icon: "wave", color: "#4fb3a9" },
  { id: "fire", label: "Kominek", icon: "fire", color: "var(--color-clay)" },
  { id: "brown", label: "Szum", icon: "noise", color: "var(--color-lav)" },
];

let savedVols: Record<SoundId, number> = { rain: 0, waves: 0, fire: 0, brown: 0 };

const MODE_COLOR: Record<Mode, string> = { focus: "var(--color-clay)", short: "var(--color-sage)", long: "var(--color-sky)" };

export function Focus({ timer, sessions, freshId }: { timer: Timer; sessions: Session[]; freshId?: string }) {
  const [vols, setVols] = useState(savedVols);
  const setVol = (id: SoundId, v: number) => {
    const next = { ...vols, [id]: v };
    savedVols = next;
    setVols(next);
    ambient.set(id, v);
  };
  const mute = () => SOUNDS.forEach((s) => setVol(s.id, 0));
  const preset = (p: Partial<Record<SoundId, number>>) => {
    const next = { rain: 0, waves: 0, fire: 0, brown: 0, ...p };
    savedVols = next;
    setVols(next);
    (Object.keys(next) as SoundId[]).forEach((k) => ambient.set(k, next[k]));
  };

  const today = dateISO(new Date());
  const todays = sessions.filter((s) => dateISO(new Date(s.at)) === today);
  const todayMin = todays.reduce((a, s) => a + s.minutes, 0);
  const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
  const daysSet = new Set(sessions.map((s) => dateISO(new Date(s.at))));
  let streak = 0;
  let d = new Date();
  if (!daysSet.has(dateISO(d))) d = addDays(d, -1);
  while (daysSet.has(dateISO(d))) {
    streak++;
    d = addDays(d, -1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(new Date(), i - 6);
    const iso = dateISO(day);
    return { label: day.toLocaleDateString("pl-PL", { weekday: "narrow" }), min: sessions.filter((s) => dateISO(new Date(s.at)) === iso).reduce((a, s) => a + s.minutes, 0), today: i === 6 };
  });
  const maxWeek = Math.max(30, ...week.map((w) => w.min));

  const progress = 1 - timer.remaining / timer.total;
  const color = MODE_COLOR[timer.mode];
  const R = 130;
  const C = 2 * Math.PI * R;

  return (
    <div>
      <PageHeader kicker="Głęboka praca" title="Fokus i ogród" />
      <div className="grid lg:grid-cols-5 gap-5">
        <section className="card p-6 md:p-8 lg:col-span-3 flex flex-col items-center rise relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none transition-opacity duration-1000" style={{ opacity: timer.running ? 1 : 0, background: `radial-gradient(circle at 50% 45%, color-mix(in oklab, ${color} 14%, transparent), transparent 60%)` }} />
          <div className="flex gap-1 p-1 rounded-2xl bg-line/60 relative">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button key={m} onClick={() => timer.setMode(m)} className={`px-3 md:px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${timer.mode === m ? "bg-card shadow-sm" : "text-muted hover:text-ink"}`}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="relative my-8 w-[min(300px,75vw)] aspect-square">
            <svg viewBox="0 0 300 300" className="w-full h-full -rotate-90">
              <circle cx="150" cy="150" r={R} stroke="var(--color-line)" strokeWidth="10" fill="none" />
              {Array.from({ length: 60 }, (_, i) => (
                <line key={i} x1="150" y1="8" x2="150" y2={i % 5 ? 13 : 17} stroke="var(--color-line)" strokeWidth="2" transform={`rotate(${i * 6} 150 150)`} />
              ))}
              <circle cx="150" cy="150" r={R} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: "stroke-dashoffset .3s linear, stroke .5s" }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-display text-6xl md:text-7xl font-semibold tabular-nums tracking-tight">{fmt(timer.remaining)}</div>
                <div className="text-sm text-muted mt-1">{timer.running ? (timer.mode === "focus" ? "Skup się, kwiatek rośnie 🌱" : "Rozprostuj nogi 🚶") : "Gotowy?"}</div>
                <div className="flex justify-center gap-1.5 mt-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="w-2 h-2 rounded-full transition" style={{ background: i < timer.cycles % 4 ? "var(--color-clay)" : "var(--color-line)" }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            <button onClick={timer.reset} className="w-12 h-12 rounded-2xl grid place-items-center text-muted hover:text-ink hover:bg-line/60 transition cursor-pointer" aria-label="Reset">
              <Icon name="reset" />
            </button>
            <button
              onClick={() => {
                ambient.ensure();
                if (timer.running) timer.pause();
                else timer.start();
              }}
              className="h-14 px-10 rounded-2xl text-white font-semibold flex items-center gap-2 shadow-lg transition hover:scale-105 active:scale-95 cursor-pointer"
              style={{ background: color, boxShadow: `0 12px 30px -10px ${color}` }}
            >
              <Icon name={timer.running ? "pause" : "play"} className="w-5 h-5" /> {timer.running ? "Pauza" : "Start"}
            </button>
            <div className="w-12" />
          </div>

          <div className="flex items-center gap-2 mt-6 text-sm text-muted relative">
            <span>Długość skupienia:</span>
            {[15, 25, 45, 50].map((n) => (
              <button key={n} onClick={() => timer.setFocusLen(n)} className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${timer.focusLen === n ? "bg-ink text-paper" : "hover:bg-line/60"}`}>
                {n}
              </button>
            ))}
          </div>
        </section>

        <div className="lg:col-span-2 flex flex-col gap-5">
          <section className="card p-6 rise" style={{ animationDelay: ".05s" }}>
            <CardTitle
              icon={<Icon name="wave" className="w-4 h-4" />}
              color="#4fb3a9"
              action={
                <button onClick={mute} className="text-xs text-muted hover:text-ink cursor-pointer">
                  wycisz
                </button>
              }
            >
              Dźwięki tła
            </CardTitle>
            <div className="space-y-4">
              {SOUNDS.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <button
                    onClick={() => setVol(s.id, vols[s.id] > 0 ? 0 : 0.5)}
                    className="w-10 h-10 rounded-xl grid place-items-center transition cursor-pointer"
                    style={{ background: vols[s.id] > 0 ? s.color : "var(--color-paper)", color: vols[s.id] > 0 ? "white" : s.color }}
                    aria-label={s.label}
                  >
                    <Icon name={s.icon} className="w-5 h-5" />
                  </button>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted text-xs tabular-nums">{Math.round(vols[s.id] * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={vols[s.id]} onChange={(e) => setVol(s.id, Number(e.target.value))} className="w-full" style={{ accentColor: s.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { l: "🌧️ Burzowa biblioteka", p: { rain: 0.6, brown: 0.25 } },
                { l: "🏕️ Chatka w górach", p: { fire: 0.6, rain: 0.2 } },
                { l: "🌊 Nad morzem", p: { waves: 0.65 } },
              ].map((x) => (
                <button key={x.l} onClick={() => preset(x.p)} className="text-xs px-3 py-1.5 rounded-xl bg-paper border border-line hover:border-sage transition cursor-pointer">
                  {x.l}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-3">Dźwięki są generowane na żywo w przeglądarce – zero plików, zero reklam.</p>
          </section>

          <section className="card p-6 rise" style={{ animationDelay: ".1s" }}>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { n: todayMin, l: "min dziś" },
                { n: streak, l: plural(streak, "dzień z rzędu", "dni z rzędu", "dni z rzędu") },
                { n: Math.round((totalMin / 60) * 10) / 10, l: "godz. łącznie" },
              ].map((s, i) => (
                <div key={i}>
                  <div className="font-display text-3xl font-semibold">{s.n}</div>
                  <div className="text-[11px] text-muted">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="flex items-end justify-between gap-2 h-24 mt-5">
              {week.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="w-full rounded-lg transition-all" style={{ height: `${Math.max(4, (w.min / maxWeek) * 100)}%`, background: w.today ? "var(--color-clay)" : w.min ? "var(--color-sage)" : "var(--color-line)" }} title={`${w.min} min`} />
                  <span className={`text-[10px] uppercase ${w.today ? "font-bold" : "text-muted"}`}>{w.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card lg:col-span-5 overflow-hidden rise" style={{ animationDelay: ".15s" }}>
          <div className="p-6 pb-0 flex flex-wrap items-center justify-between gap-2">
            <CardTitle icon={<Icon name="leaf" className="w-4 h-4" />}>Twój ogród · {sessions.length} {plural(sessions.length, "kwiat", "kwiaty", "kwiatów")}</CardTitle>
            <p className="text-xs text-muted -mt-4">Każda ukończona sesja skupienia sadzi nowy, unikalny kwiat.</p>
          </div>
          <div className="bg-gradient-to-b from-transparent to-sage/10">
            <Garden sessions={sessions} height={240} max={40} freshId={freshId} />
          </div>
        </section>
      </div>
    </div>
  );
}
