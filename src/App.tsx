import { useCallback, useEffect, useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Timetable } from "./components/Timetable";
import { Tasks } from "./components/Tasks";
import { Grades } from "./components/Grades";
import { Focus } from "./components/Focus";
import { Flashcards } from "./components/Flashcards";
import { CommandPalette, type Action } from "./components/CommandPalette";
import { Icon } from "./components/Icon";
import { useLocal, useNow } from "./lib/store";
import { addDays, dateISO, defaultTasks, uid, type Session, type Task } from "./lib/data";
import { fmt, MODE_LABEL, useFocusTimer, type Mode } from "./lib/useTimer";
import { ambient } from "./lib/audio";
import { confetti } from "./lib/confetti";

const TABS = [
  { id: "home", label: "Pulpit", icon: "home" },
  { id: "plan", label: "Plan lekcji", icon: "calendar" },
  { id: "tasks", label: "Zadania", icon: "check" },
  { id: "grades", label: "Oceny", icon: "chart" },
  { id: "focus", label: "Fokus", icon: "timer" },
  { id: "cards", label: "Fiszki", icon: "cards" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Theme = "auto" | "day" | "night";

export default function App() {
  const now = useNow(1000);
  const [tab, setTab] = useLocal<TabId>("tab", "home");
  const [theme, setTheme] = useLocal<Theme>("theme", "auto");
  const [sessions, setSessions] = useLocal<Session[]>("sessions", []);
  const [, setTasks] = useLocal<Task[]>("tasks", defaultTasks);
  const [freshId, setFreshId] = useState<string>();
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const onFinish = useCallback(
    (mode: Mode, minutes: number) => {
      ambient.chime();
      if (mode === "focus") {
        const s: Session = { id: uid(), at: Date.now(), minutes, seed: Math.floor(Math.random() * 1e9) };
        setSessions((p) => [...p, s]);
        setFreshId(s.id);
        confetti(window.innerWidth / 2, window.innerHeight / 3, 50);
        showToast(`🌸 Brawo! ${minutes} min skupienia – w ogrodzie wyrósł nowy kwiat.`);
      } else {
        showToast("⏰ Koniec przerwy – wracamy do działania!");
      }
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Plecak", { body: mode === "focus" ? "Sesja skończona! Czas na przerwę." : "Przerwa minęła." });
      }
    },
    [setSessions, showToast]
  );
  const timer = useFocusTimer(onFinish);

  const isNight = theme === "night" || (theme === "auto" && (now.getHours() >= 20 || now.getHours() < 6));
  useEffect(() => {
    document.documentElement.classList.toggle("night", isNight);
  }, [isNight]);

  useEffect(() => {
    document.title = timer.running ? `${fmt(timer.remaining)} · ${MODE_LABEL[timer.mode]} — Plecak` : "Plecak — szkolne centrum dowodzenia";
  }, [timer.running, timer.remaining, timer.mode]);

  const go = useCallback((t: string) => {
    setTab(t as TabId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setTab]);

  const cycleTheme = () => setTheme((t) => (t === "auto" ? "day" : t === "day" ? "night" : "auto"));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if ((e.target as HTMLElement).closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length && !palette) go(TABS[n - 1].id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go, palette]);

  const quickAdd = useCallback(
    (title: string) => {
      setTasks((ts) => [...ts, { id: uid(), title, subject: "Inne", due: dateISO(addDays(new Date(), 1)), kind: "zadanie", done: false }]);
      showToast(`✅ Dodano: „${title}” na jutro`);
    },
    [setTasks, showToast]
  );

  const actions: Action[] = useMemo(
    () => [
      ...TABS.map((t, i) => ({ id: "go-" + t.id, label: `Przejdź: ${t.label}`, icon: t.icon, hint: String(i + 1), run: () => go(t.id) })),
      {
        id: "timer",
        label: timer.running ? "Zatrzymaj timer" : "Rozpocznij sesję skupienia",
        icon: timer.running ? "pause" : "play",
        keywords: "pomodoro fokus start",
        run: () => {
          ambient.ensure();
          if (timer.running) timer.pause();
          else {
            timer.startFocus();
            go("focus");
          }
        },
      },
      { id: "theme", label: `Motyw: ${theme === "auto" ? "automatyczny" : theme === "day" ? "dzień" : "noc"} (zmień)`, icon: isNight ? "moon" : "sun", keywords: "ciemny jasny tryb", run: cycleTheme },
      { id: "rain", label: "Włącz deszcz w tle", icon: "rain", keywords: "dźwięk muzyka", run: () => ambient.set("rain", 0.5) },
      {
        id: "notify",
        label: "Włącz powiadomienia o końcu sesji",
        icon: "sparkle",
        run: () => {
          if ("Notification" in window) void Notification.requestPermission();
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timer.running, theme, isNight, go]
  );

  return (
    <div className="min-h-screen md:pl-[92px] lg:pl-[240px]">
      {/* Sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[92px] lg:w-[240px] flex-col p-4 lg:p-5 border-r border-line bg-card/70 backdrop-blur-xl z-30">
        <div className="flex items-center gap-3 px-1 lg:px-2 py-2 mb-6">
          <div className="w-11 h-11 rounded-2xl grid place-items-center text-2xl shrink-0" style={{ background: "linear-gradient(135deg, var(--color-butter), var(--color-clay))" }}>
            🎒
          </div>
          <div className="hidden lg:block">
            <p className="font-display text-2xl font-semibold leading-none">Plecak</p>
            <p className="text-[11px] text-muted mt-1">centrum dowodzenia</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-semibold transition justify-center lg:justify-start cursor-pointer ${tab === t.id ? "bg-ink text-paper shadow-lg" : "text-muted hover:text-ink hover:bg-line/50"}`}
              title={t.label}
            >
              <Icon name={t.icon} />
              <span className="hidden lg:inline flex-1 text-left">{t.label}</span>
              <span className={`hidden lg:inline text-[10px] opacity-0 group-hover:opacity-60 ${tab === t.id ? "opacity-60" : ""}`}>{i + 1}</span>
              {t.id === "focus" && timer.running && <span className="absolute top-2 right-2 lg:static w-2 h-2 rounded-full bg-clay animate-pulse" />}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2">
          {timer.running && (
            <button onClick={() => go("focus")} className="w-full rounded-2xl p-3 text-left bg-clay/12 border border-clay/30 cursor-pointer hidden lg:block">
              <p className="text-[11px] text-clay font-semibold">{MODE_LABEL[timer.mode]}</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{fmt(timer.remaining)}</p>
            </button>
          )}
          <button onClick={() => setPalette(true)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-line text-sm text-muted hover:text-ink transition justify-center lg:justify-start cursor-pointer">
            <Icon name="search" className="w-4 h-4" />
            <span className="hidden lg:inline flex-1 text-left">Szukaj…</span>
            <kbd className="hidden lg:inline text-[10px] border border-line rounded-md px-1.5">⌘K</kbd>
          </button>
          <button onClick={cycleTheme} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-muted hover:text-ink hover:bg-line/50 transition justify-center lg:justify-start cursor-pointer" title="Zmień motyw">
            <Icon name={theme === "auto" ? "auto" : theme === "day" ? "sun" : "moon"} className="w-4 h-4" />
            <span className="hidden lg:inline">{theme === "auto" ? "Motyw: auto" : theme === "day" ? "Motyw: dzień" : "Motyw: noc"}</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-paper/80 backdrop-blur-xl border-b border-line">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎒</span>
          <span className="font-display text-xl font-semibold">Plecak</span>
        </div>
        <div className="flex items-center gap-1">
          {timer.running && (
            <button onClick={() => go("focus")} className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-clay/15 text-clay tabular-nums cursor-pointer">
              {fmt(timer.remaining)}
            </button>
          )}
          <button onClick={() => setPalette(true)} className="p-2 rounded-xl text-muted cursor-pointer" aria-label="Szukaj">
            <Icon name="search" />
          </button>
          <button onClick={cycleTheme} className="p-2 rounded-xl text-muted cursor-pointer" aria-label="Motyw">
            <Icon name={theme === "auto" ? "auto" : theme === "day" ? "sun" : "moon"} />
          </button>
        </div>
      </header>

      <main key={tab} className="px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-10 max-w-[1400px] mx-auto rise">
        {tab === "home" && <Dashboard now={now} timer={timer} go={go} sessions={sessions} />}
        {tab === "plan" && <Timetable now={now} />}
        {tab === "tasks" && <Tasks />}
        {tab === "grades" && <Grades />}
        {tab === "focus" && <Focus timer={timer} sessions={sessions} freshId={freshId} />}
        {tab === "cards" && <Flashcards />}
        <footer className="text-center text-xs text-muted mt-12">
          Wszystko zapisuje się lokalnie w Twojej przeglądarce · <kbd className="border border-line rounded px-1">Ctrl</kbd>+<kbd className="border border-line rounded px-1">K</kbd> otwiera szybkie akcje · klawisze 1–6 przełączają zakładki
        </footer>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-3 inset-x-3 z-30 card !rounded-3xl px-2 py-2 flex justify-between backdrop-blur-xl">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl text-[10px] font-semibold transition cursor-pointer ${tab === t.id ? "bg-ink text-paper" : "text-muted"}`}>
            <Icon name={t.icon} className="w-5 h-5" />
            {t.label.split(" ")[0]}
          </button>
        ))}
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} actions={actions} onQuickAdd={quickAdd} />

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-ink text-paper text-sm font-medium shadow-2xl rise">{toast}</div>
      )}
    </div>
  );
}
