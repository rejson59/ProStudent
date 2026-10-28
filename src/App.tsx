import { useCallback, useEffect, useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Timetable } from "./components/Timetable";
import { Tasks } from "./components/Tasks";
import { Grades } from "./components/Grades";
import { Focus } from "./components/Focus";
import { Flashcards } from "./components/Flashcards";
import { CommandPalette, type Action } from "./components/CommandPalette";
import { DataPanel } from "./components/DataPanel";
import { JournalImport } from "./components/JournalImport";
import { Icon } from "./components/Icon";
import { useToast } from "./components/Toast";
import { requestPersistence, useLocal, useNow } from "./lib/store";
import { addDays, dateISO, defaultTasks, uid, type Session, type Task } from "./lib/data";
import { decodeSessions, decodeTab, decodeTasks, decodeText, decodeTheme } from "./lib/schema";
import { fetchAgentSnapshot } from "./lib/journal/agent";
import { readSnapshotFromHash } from "./lib/journal/hash";
import type { JournalSnapshot } from "./lib/journal/types";
import { useJournal } from "./lib/journal/useJournal";
import { TAB_IDS, TABS, type TabId } from "./lib/nav";
import { fmt, MODE_LABEL, useFocusTimer, type Mode } from "./lib/useTimer";
import { ambient } from "./lib/audio";
import { confetti } from "./lib/confetti";
import { notify, requestNotifications } from "./lib/notify";
import { useMediaQuery } from "./lib/useMediaQuery";

type Theme = "auto" | "day" | "night";

export default function App() {
  const now = useNow(1000);
  const toast = useToast();
  const [tab, setTab] = useLocal<TabId>("tab", "home", decodeTab(TAB_IDS));
  const [theme, setTheme] = useLocal<Theme>("theme", "auto", decodeTheme);
  const [sessions, setSessions] = useLocal<Session[]>("sessions", [], decodeSessions);
  const [, setTasks] = useLocal<Task[]>("tasks", defaultTasks, decodeTasks);
  const [freshId, setFreshId] = useState<string>();
  const [palette, setPalette] = useState(false);
  const [dataPanel, setDataPanel] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [incoming, setIncoming] = useState<JournalSnapshot | null>(null);
  const [autoSync] = useLocal<boolean>("journalAutoSync", false);
  const [lastSync, setLastSync] = useLocal("journalLastSync", "", decodeText);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const journal = useJournal();

  // Poproś o trwałe przechowywanie danych (chroni przed automatycznym czyszczeniem).
  useEffect(() => {
    void requestPersistence();
  }, []);

  // Dane z zakładki działającej na stronie dziennika (`#dziennik=…`).
  // Adres czyścimy od razu, żeby odświeżenie strony nie powtarzało importu.
  useEffect(() => {
    const snapshot = readSnapshotFromHash(window.location.hash);
    if (!snapshot) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setIncoming(snapshot);
    setJournalOpen(true);
  }, []);

  /**
   * Automatyczna synchronizacja z lokalnym agentem.
   *
   * Aplikacja nie zna danych logowania — pyta wyłącznie o gotowy plik
   * `snapshot.json` wystawiony przez agenta na 127.0.0.1.
   */
  const syncFromAgent = useCallback(
    async (silent: boolean) => {
      const result = await fetchAgentSnapshot();
      if (!result.ok) {
        if (!silent) toast(`Nie udało się pobrać danych: ${result.error}`);
        return;
      }
      const exportedAt = result.snapshot.exportedAt;
      if (lastSync && exportedAt <= lastSync) return;

      const { result: imported } = journal.apply(result.snapshot, { grades: true, timetable: true, tasks: true });
      setLastSync(exportedAt);
      const parts = [
        imported.stats.gradesNew ? `+${imported.stats.gradesNew} ocen` : "",
        imported.stats.exams + imported.stats.homework ? `+${imported.stats.exams + imported.stats.homework} zadań` : "",
        imported.stats.lessons ? `${imported.stats.lessons} lekcji` : "",
      ].filter(Boolean);
      toast(parts.length ? `Zsynchronizowano: ${parts.join(", ")}` : "Dane z dziennika są aktualne");
    },
    [journal, lastSync, setLastSync, toast]
  );

  useEffect(() => {
    if (!autoSync) return;
    void syncFromAgent(true);
    const timer = window.setInterval(() => void syncFromAgent(true), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
    // Celowo tylko przy zmianie przełącznika — `syncFromAgent` zmienia się razem z danymi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

  const onFinish = useCallback(
    (mode: Mode, minutes: number) => {
      ambient.chime();
      if (mode === "focus") {
        const session: Session = { id: uid(), at: Date.now(), minutes, seed: Math.floor(Math.random() * 1e9) };
        setSessions((prev) => [...prev, session]);
        setFreshId(session.id);
        confetti(window.innerWidth / 2, window.innerHeight / 3, 50);
        toast(`🌸 Brawo! ${minutes} min skupienia – w ogrodzie wyrósł nowy kwiat.`);
        notify("Plecak", "Sesja skończona! Czas na przerwę.");
      } else {
        toast("⏰ Koniec przerwy – wracamy do działania!");
        notify("Plecak", "Przerwa minęła.");
      }
    },
    [setSessions, toast]
  );

  const timer = useFocusTimer(onFinish);

  // Motyw „auto” respektuje ustawienie systemowe, a gdy go brak — porę dnia.
  const isNight =
    theme === "night" ||
    (theme === "auto" && (prefersDark || now.getHours() >= 20 || now.getHours() < 6));

  useEffect(() => {
    document.documentElement.classList.toggle("night", isNight);
  }, [isNight]);

  useEffect(() => {
    document.title = timer.running
      ? `${fmt(timer.remaining)} · ${MODE_LABEL[timer.mode]} — Plecak`
      : "Plecak — szkolne centrum dowodzenia";
  }, [timer.running, timer.remaining, timer.mode]);

  const go = useCallback(
    (target: string) => {
      setTab(target as TabId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setTab]
  );

  const cycleTheme = useCallback(
    () => setTheme((prev) => (prev === "auto" ? "day" : prev === "day" ? "night" : "auto")),
    [setTheme]
  );

  const newId = useCallback(() => uid(), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((prev) => !prev);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (typeof target?.closest === "function" && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const index = Number(event.key);
      if (index >= 1 && index <= TABS.length && !palette && !dataPanel && !journalOpen) go(TABS[index - 1].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, palette, dataPanel, journalOpen]);

  const quickAdd = useCallback(
    (title: string) => {
      setTasks((tasks) => [
        ...tasks,
        { id: newId(), title, subject: "Inne", due: dateISO(addDays(new Date(), 1)), kind: "zadanie", done: false },
      ]);
      toast(`✅ Dodano: „${title}” na jutro`);
    },
    [setTasks, toast, newId]
  );

  const actions: Action[] = useMemo(
    () => [
      ...TABS.map((item, index) => ({
        id: "go-" + item.id,
        label: `Przejdź: ${item.label}`,
        icon: item.icon,
        hint: String(index + 1),
        run: () => go(item.id),
      })),
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
      {
        id: "theme",
        label: `Motyw: ${theme === "auto" ? "automatyczny" : theme === "day" ? "dzień" : "noc"} (zmień)`,
        icon: isNight ? "moon" : "sun",
        keywords: "ciemny jasny tryb",
        run: cycleTheme,
      },
      {
        id: "rain",
        label: "Włącz deszcz w tle",
        icon: "rain",
        keywords: "dźwięk muzyka",
        run: () => ambient.set("rain", 0.5),
      },
      {
        id: "journal",
        label: "Import z e-dziennika",
        icon: "reset",
        keywords: "dziennik vulcan eduvulcan librus oceny plan import sync",
        run: () => setJournalOpen(true),
      },
      {
        id: "data",
        label: "Kopia zapasowa i dane",
        icon: "leaf",
        keywords: "eksport import backup json reset kopia",
        run: () => setDataPanel(true),
      },
      {
        id: "notify",
        label: "Powiadomienia o końcu sesji",
        icon: "sparkle",
        keywords: "notifications uprawnienia",
        run: () => {
          void requestNotifications().then((permission) => {
            if (permission === "granted") toast("🔔 Powiadomienia włączone");
            else if (permission === "denied") toast("Powiadomienia zablokowane w przeglądarce");
            else if (permission === "unsupported") toast("Ta przeglądarka nie wspiera powiadomień");
          });
        },
      },
    ],
    [timer, theme, isNight, go, cycleTheme, toast]
  );

  return (
    <div className="min-h-screen md:pl-[92px] lg:pl-[240px]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-xl focus:bg-ink focus:text-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Przejdź do treści
      </a>

      {/* Sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[92px] lg:w-[240px] flex-col p-4 lg:p-5 border-r border-line bg-card/70 backdrop-blur-xl z-30">
        <div className="flex items-center gap-3 px-1 lg:px-2 py-2 mb-6">
          <div
            className="w-11 h-11 rounded-2xl grid place-items-center text-2xl shrink-0"
            style={{ background: "linear-gradient(135deg, var(--color-butter), var(--color-clay))" }}
          >
            🎒
          </div>
          <div className="hidden lg:block">
            <p className="font-display text-2xl font-semibold leading-none">Plecak</p>
            <p className="text-[11px] text-muted mt-1">centrum dowodzenia</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Nawigacja główna">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-semibold transition justify-center lg:justify-start cursor-pointer ${
                tab === item.id ? "bg-ink text-paper shadow-lg" : "text-muted hover:text-ink hover:bg-line/50"
              }`}
              title={item.label}
            >
              <Icon name={item.icon} />
              <span className="hidden lg:inline flex-1 text-left">{item.label}</span>
              <span
                className={`hidden lg:inline text-[10px] opacity-0 group-hover:opacity-60 ${
                  tab === item.id ? "opacity-60" : ""
                }`}
              >
                {index + 1}
              </span>
              {item.id === "focus" && timer.running && (
                <span className="absolute top-2 right-2 lg:static w-2 h-2 rounded-full bg-clay animate-pulse" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2">
          {timer.running && (
            <button
              onClick={() => go("focus")}
              className="w-full rounded-2xl p-3 text-left bg-clay/12 border border-clay/30 cursor-pointer hidden lg:block"
            >
              <p className="text-[11px] text-clay font-semibold">{MODE_LABEL[timer.mode]}</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{fmt(timer.remaining)}</p>
            </button>
          )}
          <button
            onClick={() => setPalette(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-line text-sm text-muted hover:text-ink transition justify-center lg:justify-start cursor-pointer"
          >
            <Icon name="search" className="w-4 h-4" />
            <span className="hidden lg:inline flex-1 text-left">Szukaj…</span>
            <kbd className="hidden lg:inline text-[10px] border border-line rounded-md px-1.5">⌘K</kbd>
          </button>
          <button
            onClick={() => setJournalOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-muted hover:text-ink hover:bg-line/50 transition justify-center lg:justify-start cursor-pointer"
            title="Połącz z e-dziennikiem (eduVULCAN)"
          >
            <Icon name="link" className="w-4 h-4" />
            <span className="hidden lg:inline">Dziennik</span>
          </button>
          <button
            onClick={() => setDataPanel(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-muted hover:text-ink hover:bg-line/50 transition justify-center lg:justify-start cursor-pointer"
            title="Kopia zapasowa i dane"
          >
            <Icon name="leaf" className="w-4 h-4" />
            <span className="hidden lg:inline">Twoje dane</span>
          </button>
          <button
            onClick={cycleTheme}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-muted hover:text-ink hover:bg-line/50 transition justify-center lg:justify-start cursor-pointer"
            title="Zmień motyw"
          >
            <Icon name={theme === "auto" ? "auto" : theme === "day" ? "sun" : "moon"} className="w-4 h-4" />
            <span className="hidden lg:inline">
              {theme === "auto" ? "Motyw: auto" : theme === "day" ? "Motyw: dzień" : "Motyw: noc"}
            </span>
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
            <button
              onClick={() => go("focus")}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-clay/15 text-clay tabular-nums cursor-pointer"
            >
              {fmt(timer.remaining)}
            </button>
          )}
          <button onClick={() => setPalette(true)} className="p-2 rounded-xl text-muted cursor-pointer" aria-label="Szukaj">
            <Icon name="search" />
          </button>
          <button
            onClick={() => setJournalOpen(true)}
            className="p-2 rounded-xl text-muted cursor-pointer"
            aria-label="Połącz z e-dziennikiem"
            title="Połącz z e-dziennikiem (eduVULCAN)"
          >
            <Icon name="link" />
          </button>
          <button
            onClick={() => setDataPanel(true)}
            className="p-2 rounded-xl text-muted cursor-pointer"
            aria-label="Kopia zapasowa i dane"
          >
            <Icon name="leaf" />
          </button>
          <button onClick={cycleTheme} className="p-2 rounded-xl text-muted cursor-pointer" aria-label="Zmień motyw">
            <Icon name={theme === "auto" ? "auto" : theme === "day" ? "sun" : "moon"} />
          </button>
        </div>
      </header>

      <main id="main" className="px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-10 max-w-[1400px] mx-auto">
        <div key={tab} className="rise">
          {tab === "home" && <Dashboard now={now} timer={timer} go={go} sessions={sessions} />}
          {tab === "plan" && <Timetable now={now} />}
          {tab === "tasks" && <Tasks />}
          {tab === "grades" && <Grades />}
          {tab === "focus" && <Focus timer={timer} sessions={sessions} freshId={freshId} />}
          {tab === "cards" && <Flashcards />}
        </div>
        <footer className="text-center text-xs text-muted mt-12 space-y-2">
          <p>
            Wszystko zapisuje się lokalnie w Twojej przeglądarce ·{" "}
            <kbd className="border border-line rounded px-1">Ctrl</kbd>+<kbd className="border border-line rounded px-1">K</kbd>{" "}
            otwiera szybkie akcje · klawisze 1–6 przełączają zakładki
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
            <button
              onClick={() => setJournalOpen(true)}
              className="text-muted hover:text-ink underline decoration-dotted cursor-pointer"
            >
              Połącz z e-dziennikiem
            </button>
            <button onClick={() => setDataPanel(true)} className="text-muted hover:text-ink underline decoration-dotted cursor-pointer">
              Zrób kopię zapasową danych
            </button>
          </div>
        </footer>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Nawigacja główna"
        className="md:hidden fixed bottom-3 inset-x-3 z-30 card !rounded-3xl px-2 py-2 flex justify-between backdrop-blur-xl"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => go(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl text-[10px] font-semibold transition cursor-pointer ${
              tab === item.id ? "bg-ink text-paper" : "text-muted"
            }`}
          >
            <Icon name={item.icon} className="w-5 h-5" />
            {item.label.split(" ")[0]}
          </button>
        ))}
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} actions={actions} onQuickAdd={quickAdd} />
      <DataPanel open={dataPanel} onClose={() => setDataPanel(false)} onOpenJournal={() => { setDataPanel(false); setJournalOpen(true); }} />
      <JournalImport
        open={journalOpen}
        incoming={incoming}
        onClose={() => {
          setJournalOpen(false);
          setIncoming(null);
        }}
      />
    </div>
  );
}
