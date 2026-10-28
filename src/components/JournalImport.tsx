import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Btn } from "./ui";
import { useToast } from "./Toast";
import { useJournal } from "../lib/journal/useJournal";
import { decodeSnapshot, type JournalSnapshot } from "../lib/journal/types";
import type { ImportSelection } from "../lib/journal/normalize";
import { AGENT_URL, agentStatus, fetchAgentSnapshot, type AgentStatus } from "../lib/journal/agent";
import { copyText } from "../lib/clipboard";

type Step = "source" | "preview";

const STEPS: { id: Step; label: string }[] = [
  { id: "source", label: "1. Połącz" },
  { id: "preview", label: "2. Podgląd" },
];

const REPO = "https://github.com/rejson59/ProStudent/tree/main/sync-agent";

const COMMANDS = {
  login: "node src/cli.mjs login",
  serve: "node src/cli.mjs serve",
  enter: "cd sync-agent",
};

/** Wiersz z komendą do wklejenia w terminalu — z kopiowaniem jednym kliknięciem. */
function Command({ value, hint }: { value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const ok = await copyText(value);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="rounded-xl border border-line bg-paper overflow-hidden">
      <div className="flex items-stretch">
        <code className="flex-1 min-w-0 px-3 py-2 font-mono text-xs text-ink overflow-x-auto whitespace-nowrap scroll-thin">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Kopiuj polecenie: ${value}`}
          className="shrink-0 px-3 text-xs font-semibold text-sage hover:bg-sage/10 cursor-pointer border-l border-line"
        >
          {copied ? "Skopiowano" : "Kopiuj"}
        </button>
      </div>
      {hint && <p className="px-3 py-2 text-xs text-muted border-t border-line/70">{hint}</p>}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Skopiowano do schowka" : ""}
      </span>
    </div>
  );
}

function StepNumber({ children }: { children: number | string }) {
  return (
    <span className="shrink-0 w-5 h-5 rounded-full bg-ink text-paper text-[11px] font-bold grid place-items-center">
      {children}
    </span>
  );
}

export function JournalImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const titleId = useId();
  const journal = useJournal();
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [step, setStep] = useState<Step>("source");
  const [snapshot, setSnapshot] = useState<JournalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [selection, setSelection] = useState<ImportSelection>({ grades: true, timetable: true, tasks: true });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");

  const refresh = useCallback(async () => {
    setChecking(true);
    const next = await agentStatus();
    setStatus(next);
    setChecking(false);
    return next;
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep("source");
    setSnapshot(null);
    setError(null);
    setPaste("");
    setPasteOpen(false);
    setSelection({ grades: true, timetable: true, tasks: true });
    setStatus(null);
    void refresh();
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const accept = useCallback((raw: unknown, originLabel: string) => {
    const decoded = decodeSnapshot(raw);
    if (!decoded) {
      setError(
        "To nie jest plik importu Plecaka. Oczekujemy dokumentu z \"format\": \"plecak-import\" i \"version\": 1."
      );
      return;
    }
    const empty = !decoded.grades?.length && !decoded.timetable?.length && !decoded.exams?.length && !decoded.homework?.length;
    if (empty) {
      setError(`Dokument z ${originLabel} nie zawiera żadnych danych do zaimportowania.`);
      return;
    }
    setError(null);
    setSnapshot(decoded);
    setSelection({
      grades: Boolean(decoded.grades?.length),
      timetable: Boolean(decoded.timetable?.length),
      tasks: Boolean(decoded.exams?.length || decoded.homework?.length),
    });
    setStep("preview");
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const text = await file.text();
        try {
          accept(JSON.parse(text), file.name);
        } catch {
          setError("Plik nie jest poprawnym JSON-em.");
        }
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [accept]
  );

  const fromAgent = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await fetchAgentSnapshot();
    setBusy(false);
    if (result.ok) {
      accept(result.snapshot, "lokalnego agenta");
    } else {
      setError(`${result.error}. Sprawdź stan agenta powyżej.`);
      void refresh();
    }
  }, [accept, refresh]);

  const preview = useMemo(
    () => (snapshot ? journal.preview(snapshot, selection) : null),
    [snapshot, selection, journal]
  );

  const apply = useCallback(() => {
    if (!snapshot) return;
    const { result, undo } = journal.apply(snapshot, selection);
    const parts = [
      result.stats.gradesNew ? `+${result.stats.gradesNew} ocen` : "",
      result.stats.gradesUpdated ? `${result.stats.gradesUpdated} zaktualizowanych` : "",
      result.stats.lessons ? `${result.stats.lessons} lekcji` : "",
      result.stats.exams ? `${result.stats.exams} sprawdzianów` : "",
      result.stats.homework ? `${result.stats.homework} zadań` : "",
    ].filter(Boolean);

    toast(parts.length ? `Zaimportowano: ${parts.join(", ")}` : "Import zakończony", {
      duration: 7000,
      action: { label: "Cofnij", run: undo },
    });
    onClose();
  }, [snapshot, selection, journal, toast, onClose]);

  if (!open) return null;

  const canImport = preview && (selection.grades || selection.timetable || selection.tasks);
  const online = status?.online === true;
  const ready = online && status?.ok === true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 pt-[6vh] md:pt-4 bg-[#121420]/40 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card !rounded-3xl w-full max-w-xl p-6 max-h-[88vh] overflow-auto scroll-thin rise"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-xs uppercase tracking-[.2em] font-semibold text-muted">Dziennik szkolny</p>
            <h2 id={titleId} className="font-display text-2xl font-semibold">
              Połącz z eduVULCAN
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Zamknij import"
            className="p-2 rounded-xl text-muted hover:text-ink hover:bg-line/60 cursor-pointer"
          >
            <Icon name="x" />
          </button>
        </div>

        <ol className="flex gap-2 my-4 text-xs font-semibold" aria-label="Kroki importu">
          {STEPS.map((item) => (
            <li
              key={item.id}
              className={`px-3 py-1.5 rounded-xl ${step === item.id ? "bg-ink text-paper" : "bg-line/60 text-muted"}`}
            >
              {item.label}
            </li>
          ))}
        </ol>

        {step === "source" && (
          <div className="space-y-4">
            {status === null && (
              <p className="text-sm text-muted rounded-2xl border border-line p-4">Sprawdzam, czy agent działa…</p>
            )}

            {/* --- Agent działa i ma dane: najkrótsza ścieżka --- */}
            {ready && (
              <div className="rounded-2xl border border-sage/40 bg-sage/8 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sage" />
                  <p className="text-sm font-semibold">Agent połączony</p>
                </div>
                <p className="text-xs text-muted mb-3">
                  {status?.student ? `${status.student} · ` : ""}
                  ostatnia synchronizacja:{" "}
                  {status?.lastSync ? new Date(status.lastSync).toLocaleString("pl-PL") : "—"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={fromAgent} disabled={busy}>
                    <Icon name="reset" className="w-4 h-4" /> Pobierz dane z dziennika
                  </Btn>
                  <Btn variant="ghost" onClick={() => void refresh()} disabled={checking}>
                    Odśwież status
                  </Btn>
                </div>
              </div>
            )}

            {/* --- Agent działa, ale nie ma jeszcze danych --- */}
            {online && !ready && (
              <div className="rounded-2xl border border-butter/60 bg-butter/10 p-4">
                <p className="text-sm font-semibold mb-1">Agent działa, brakuje jednorazowego logowania</p>
                <p className="text-xs text-muted mb-3">
                  W katalogu <code>sync-agent</code> uruchom poniższe polecenie. Otworzy się eduVULCAN — zaloguj się,
                  wejdź na <code>https://eduvulcan.pl/api/ap</code> i wklej zawartość strony w terminalu.
                </p>
                <Command value={COMMANDS.login} hint="Hasło zostaje tylko u Ciebie — agent nie zapisuje go nigdzie." />
                <div className="flex flex-wrap gap-2 mt-3">
                  <Btn variant="soft" onClick={() => void refresh()} disabled={checking}>
                    <Icon name="reset" className="w-4 h-4" /> Sprawdź ponownie
                  </Btn>
                </div>
              </div>
            )}

            {/* --- Agent nie działa: instrukcja uruchomienia --- */}
            {status !== null && !online && (
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm font-semibold mb-1">Agent nie działa</p>
                <p className="text-xs text-muted mb-3">
                  Ta strona nie może zalogować się do dziennika bezpośrednio — GitHub Pages nie ma serwera, a Vulcan nie
                  pozwala na zapytania z przeglądarki (CORS). Logowanie robi mały program na Twoim komputerze, dzięki
                  czemu hasło nigdy nie trafia do sieci.
                </p>

                <div className="space-y-3">
                  <div className="flex gap-2.5">
                    <StepNumber>1</StepNumber>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold mb-1">
                        Pobierz agenta (Node.js 20+) —{" "}
                        <a
                          href={REPO}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sage underline decoration-dotted"
                        >
                          katalog sync-agent na GitHubie
                        </a>
                      </p>
                      <Command value="git clone https://github.com/rejson59/ProStudent.git" />
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <StepNumber>2</StepNumber>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold mb-1">Zaloguj się jednorazowo do dziennika</p>
                      <Command
                        value={`${COMMANDS.enter} && ${COMMANDS.login}`}
                        hint="Agent otworzy eduVULCAN; po zalogowaniu wklejasz w terminalu zawartość https://eduvulcan.pl/api/ap."
                      />
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <StepNumber>3</StepNumber>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold mb-1">Uruchom synchronizację w tle</p>
                      <Command
                        value={`${COMMANDS.enter} && ${COMMANDS.serve}`}
                        hint="Zostaw okno otwarte. Dane odświeżają się co 2 h i są widoczne tylko na tym komputerze."
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <Btn variant="soft" onClick={() => void refresh()} disabled={checking}>
                    <Icon name="reset" className="w-4 h-4" /> {checking ? "Sprawdzam…" : "Sprawdź ponownie"}
                  </Btn>
                  <a href={REPO} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-ink underline decoration-dotted">
                    Instrukcja krok po kroku
                  </a>
                </div>
                <p className="text-[11px] text-muted mt-2">
                  Sprawdzany adres: <code>{AGENT_URL}</code> — połączenie idzie tylko przez ten komputer.
                </p>
              </div>
            )}

            {/* --- Ścieżka zapasowa: plik lub wklejenie --- */}
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm font-semibold mb-1">Nie chcesz agenta? Wczytaj dane z pliku</p>
              <p className="text-xs text-muted mb-3">
                Plik <code>snapshot.json</code> od agenta albo dowolny dokument <code>plecak-import-v1</code>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Btn variant="soft" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Icon name="plus" className="w-4 h-4" /> Wybierz plik
                </Btn>
                <Btn variant="ghost" onClick={() => setPasteOpen((prev) => !prev)} aria-expanded={pasteOpen}>
                  {pasteOpen ? "Ukryj wklejanie" : "Wklej dane"}
                </Btn>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Wybierz plik importu z dziennika"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />

              {pasteOpen && (
                <div className="mt-3">
                  <label htmlFor="journal-paste" className="sr-only">
                    Wklej dane importu
                  </label>
                  <textarea
                    id="journal-paste"
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                    rows={4}
                    spellCheck={false}
                    placeholder='{"format":"plecak-import","version":1,…}'
                    className="input w-full font-mono text-xs"
                  />
                  <Btn
                    variant="soft"
                    className="mt-2"
                    disabled={!paste.trim()}
                    onClick={() => {
                      try {
                        accept(JSON.parse(paste), "wklejonych danych");
                      } catch {
                        setError("Wklejony tekst nie jest poprawnym JSON-em.");
                      }
                    }}
                  >
                    Sprawdź dane
                  </Btn>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-clay bg-clay/10 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        {step === "preview" && snapshot && preview && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Źródło: <b className="text-ink">{snapshot.source}</b>
              {snapshot.student?.name ? ` · ${snapshot.student.name}` : ""} · wyeksportowano{" "}
              {new Date(snapshot.exportedAt).toLocaleString("pl-PL")}
            </p>

            <div className="space-y-2">
              {[
                { key: "grades" as const, label: "Oceny", count: preview.stats.gradesNew, extra: preview.stats.gradesUpdated },
                { key: "timetable" as const, label: "Plan lekcji", count: preview.stats.lessons, extra: preview.stats.bells },
                { key: "tasks" as const, label: "Sprawdziany i zadania", count: preview.stats.exams + preview.stats.homework, extra: 0 },
              ].map((row) => (
                <label
                  key={row.key}
                  className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${
                    row.count ? "border-line" : "border-line/50 opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selection[row.key]}
                    disabled={!row.count}
                    onChange={(event) => setSelection((prev) => ({ ...prev, [row.key]: event.target.checked }))}
                    className="w-4 h-4 accent-[var(--color-sage)]"
                  />
                  <span className="flex-1 text-sm font-medium">{row.label}</span>
                  <span className="text-xs text-muted text-right">
                    {row.count ? `${row.count} nowych` : "brak danych"}
                    {row.extra ? ` · ${row.extra} ${row.key === "timetable" ? "dzwonków" : "aktualizacji"}` : ""}
                  </span>
                </label>
              ))}
            </div>

            {preview.warnings.length > 0 && (
              <ul className="text-xs text-muted space-y-1 bg-paper border border-line rounded-xl p-3">
                {preview.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            )}

            <div className="rounded-xl bg-sage/10 text-sage text-xs px-3 py-2">
              Oceny i zadania dodane ręcznie pozostaną nietknięte. Import możesz cofnąć jednym kliknięciem.
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Btn variant="ghost" onClick={() => setStep("source")}>
                Wróć
              </Btn>
              <Btn onClick={apply} disabled={!canImport}>
                <Icon name="check" className="w-4 h-4" /> Zaimportuj
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
