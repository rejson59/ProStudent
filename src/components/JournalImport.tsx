import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Btn } from "./ui";
import { useToast } from "./Toast";
import { useJournal } from "../lib/journal/useJournal";
import { decodeSnapshot, type JournalSnapshot } from "../lib/journal/types";
import type { ImportSelection } from "../lib/journal/normalize";
import { AGENT_URL, agentStatus, fetchAgentSnapshot, type AgentStatus } from "../lib/journal/agent";
import { ConnectDesktop } from "./ConnectDesktop";
import { detectPlatform } from "../lib/mobile";
import { useLocal } from "../lib/store";
import { decodeText } from "../lib/schema";
import { copyText, readClipboard } from "../lib/clipboard";
import { recognizePaste } from "../lib/journal/smartPaste";
import { detectOs, JOURNAL_URL } from "../lib/journal/connect";

type Step = "source" | "preview";

const STEPS: { id: Step; label: string }[] = [
  { id: "source", label: "1. Połącz" },
  { id: "preview", label: "2. Podgląd" },
];

const REPO = "https://github.com/rejson59/ProStudent/tree/main/sync-agent";

function CopyButton({ value, label = "Kopiuj" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Btn
        variant="soft"
        onClick={async () => {
          const ok = await copyText(value);
          setCopied(ok);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Icon name="check" className="w-4 h-4" /> {copied ? "Skopiowano" : label}
      </Btn>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Skopiowano do schowka" : ""}
      </span>
    </>
  );
}

function Command({ value }: { value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper overflow-hidden flex items-stretch">
      <code className="flex-1 min-w-0 px-3 py-2 font-mono text-xs overflow-x-auto whitespace-nowrap scroll-thin">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

export function JournalImport({
  open,
  incoming,
  onClose,
}: {
  open: boolean;
  incoming?: JournalSnapshot | null;
  onClose: () => void;
}) {
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
  const [selection, setSelection] = useState<ImportSelection>({ grades: true, timetable: true, tasks: true });
  const [notes, setNotes] = useState<string[]>([]);
  const [agentOpen, setAgentOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [isDesktop] = useState(() => detectPlatform() === "desktop");
  const [os] = useState(() => detectOs());
  const [lastSync, setLastSync] = useLocal<string>("journalLastSync", "", decodeText);

  const accept = useCallback((raw: unknown, originLabel: string) => {
    const decoded = decodeSnapshot(raw);
    if (!decoded) {
      setError(
        'To nie jest dokument importu Plecaka. Oczekujemy danych z "format": "plecak-import" i "version": 1.'
      );
      return false;
    }
    const empty = !decoded.grades?.length && !decoded.timetable?.length && !decoded.exams?.length && !decoded.homework?.length;
    if (empty) {
      setError(`Dokument z ${originLabel} nie zawiera żadnych danych do zaimportowania.`);
      return false;
    }
    setError(null);
    setNotes([]);
    setSnapshot(decoded);
    setSelection({
      grades: Boolean(decoded.grades?.length),
      timetable: Boolean(decoded.timetable?.length),
      tasks: Boolean(decoded.exams?.length || decoded.homework?.length),
    });
    setStep("preview");
    return true;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPaste("");
    setNotes([]);
    setSelection({ grades: true, timetable: true, tasks: true });

    // Dane przyniesione przez zakładkę ze strony dziennika mają pierwszeństwo.
    if (incoming) {
      setSnapshot(incoming);
      setSelection({
        grades: Boolean(incoming.grades?.length),
        timetable: Boolean(incoming.timetable?.length),
        tasks: Boolean(incoming.exams?.length || incoming.homework?.length),
      });
      setStep("preview");
    } else {
      setStep("source");
      setSnapshot(null);
    }

    setStatus(null);
    void agentStatus().then(setStatus);
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, [open, incoming]);

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

  /**
   * Jedna droga dla każdego: wklejone dane (albo plik) trafiają do wspólnego
   * rozpoznawania — JSON, adres z `#dziennik=` czy skopiowana strona.
   */
  const recognizeNow = useCallback((value: string) => {
    const result = recognizePaste(value);
    if (!result) {
      setError(
        "Nie udało się rozpoznać danych. Spróbuj skopiować samą tabelę ocen albo plan lekcji — albo wybierz plik z danymi."
      );
      return;
    }
    setError(null);
    setNotes(result.notes);
    setSnapshot(result.snapshot);
    setSelection({
      grades: Boolean(result.snapshot.grades?.length),
      timetable: Boolean(result.snapshot.timetable?.length),
      tasks: Boolean(result.snapshot.exams?.length || result.snapshot.homework?.length),
    });
    setStep("preview");
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        recognizeNow(await file.text());
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [recognizeNow]
  );

  const fromAgent = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await fetchAgentSnapshot();
    setBusy(false);
    if (result.ok) accept(result.snapshot, "lokalnego agenta");
    else setError(`${result.error}.`);
  }, [accept]);

  const preview = useMemo(() => (snapshot ? journal.preview(snapshot, selection) : null), [snapshot, selection, journal]);

  const apply = useCallback(() => {
    if (!snapshot) return;
    const { result, undo } = journal.apply(snapshot, selection);
    // Data ostatniego udanego importu — pokazywana w panelu i na karcie połączenia.
    setLastSync(new Date().toISOString());
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
  }, [snapshot, selection, journal, toast, onClose, setLastSync]);

  if (!open) return null;

  const canImport = preview && (selection.grades || selection.timetable || selection.tasks);
  const online = status?.online === true;

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
              Import z eduVULCAN
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
            {/* Najprostsza droga: kopiuj i wklej. Działa na każdym urządzeniu. */}
            <div className="rounded-2xl border border-sage/40 bg-sage/8 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="clipboard" className="w-4 h-4 text-sage" />
                <p className="text-sm font-semibold">Skopiuj z dziennika i wklej tutaj</p>
              </div>
              <p className="text-xs text-muted mb-3">
                Jedna droga dla telefonu, tabletu i komputera — bez instalowania i bez zakładek.
              </p>

              <ol className="text-xs text-muted space-y-1.5 mb-3">
                <li>
                  <b className="text-ink">1.</b> Otwórz dziennik i zaloguj się.
                </li>
                <li>
                  <b className="text-ink">2.</b>{" "}
                  {isDesktop ? (
                    <>
                      Zaznacz całą stronę i skopiuj:{" "}
                      <kbd className="border border-line rounded px-1 bg-paper">{os === "mac" ? "⌘" : "Ctrl"}+A</kbd>,
                      potem{" "}
                      <kbd className="border border-line rounded px-1 bg-paper">{os === "mac" ? "⌘" : "Ctrl"}+C</kbd>.
                    </>
                  ) : (
                    <>Przytrzymaj tekst na stronie i wybierz „Zaznacz wszystko”, potem „Kopiuj”.</>
                  )}
                </li>
                <li>
                  <b className="text-ink">3.</b> Wróć tutaj i kliknij <b>„Wklej ze schowka”</b> (albo kliknij w pole
                  i wklej ręcznie). Plecak sam rozpozna oceny, plan i sprawdziany.
                </li>
              </ol>

              <label htmlFor="journal-paste" className="sr-only">
                Wklej dane skopiowane z dziennika
              </label>
              <textarea
                id="journal-paste"
                value={paste}
                rows={4}
                spellCheck={false}
                onChange={(event) => setPaste(event.target.value)}
                onPaste={(event) => {
                  const text = event.clipboardData?.getData("text/plain");
                  if (!text) return;
                  event.preventDefault();
                  setPaste(text);
                  recognizeNow(text);
                }}
                placeholder="Wklej tutaj — oceny, plan, sprawdziany, całą stronę dziennika albo plik JSON"
                className="input w-full text-xs font-mono"
              />

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Btn
                  onClick={async () => {
                    const text = await readClipboard();
                    if (!text) {
                      setError("Przeglądarka nie dała odczytać schowka — kliknij w pole i wklej ręcznie (Ctrl+V).");
                      return;
                    }
                    setPaste(text);
                    recognizeNow(text);
                  }}
                  disabled={busy}
                >
                  <Icon name="clipboard" className="w-4 h-4" /> Wklej ze schowka
                </Btn>
                <Btn variant="soft" onClick={() => recognizeNow(paste)} disabled={!paste.trim() || busy}>
                  <Icon name="check" className="w-4 h-4" /> Rozpoznaj dane
                </Btn>
                <Btn variant="soft" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Icon name="plus" className="w-4 h-4" /> Wybierz plik
                </Btn>
                <a
                  href={JOURNAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink underline decoration-dotted"
                >
                  <Icon name="external" className="w-3.5 h-3.5" /> Otwórz eduvulcan.pl
                </a>
              </div>

              {!paste.trim() && (
                <p className="text-[11px] text-muted mt-2">
                  Nic nie trzeba przepisywać — wystarczy wkleić to, co skopiujesz z dziennika. Rozpoznane dane
                  zobaczysz najpierw w podglądzie i możesz je odrzucić.
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-clay bg-clay/10 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <details className="rounded-2xl border border-line p-4">
              <summary className="text-sm font-semibold cursor-pointer select-none">
                Inne sposoby — jednorazowa zakładka, agent
              </summary>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-muted">
                  Wklejanie nic nie kosztuje i działa zawsze. Jeśli chcesz, żeby kolejne odświeżenia były szybsze,
                  możesz dodać jednorazową zakładkę w przeglądarce na komputerze.
                </p>

                {isDesktop ? (
                  <ConnectDesktop lastSync={lastSync} />
                ) : (
                  <p className="text-xs text-muted rounded-xl border border-line bg-paper p-3">
                    Na telefonie pasek zakładek nie istnieje — zostaje wklejanie (powyżej) albo plik z danymi.
                  </p>
                )}

                <div className="rounded-2xl border border-line p-4">
                  <button
                    type="button"
                    onClick={() => setAgentOpen((prev) => !prev)}
                    aria-expanded={agentOpen}
                    className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <span>
                      <span className="text-sm font-semibold block">Pełna automatyzacja (agent)</span>
                      <span className="text-xs text-muted">
                        {online
                          ? status?.ok
                            ? `agent online · ostatnia synchronizacja ${new Date(status.lastSync ?? "").toLocaleString("pl-PL")}`
                            : "agent online, brakuje logowania"
                          : "opcjonalnie: odświeżanie bez klikania, wymaga Node.js"}
                      </span>
                    </span>
                    <Icon name={agentOpen ? "x" : "plus"} className="w-4 h-4 shrink-0 text-muted" />
                  </button>

                  {agentOpen && (
                    <div className="mt-3 space-y-3">
                      {online && status?.ok ? (
                        <Btn onClick={fromAgent} disabled={busy}>
                          <Icon name="reset" className="w-4 h-4" /> Pobierz dane z agenta
                        </Btn>
                      ) : (
                        <>
                          <p className="text-xs text-muted">
                            Agent działa na Twoim komputerze i odświeża dane co 2 h — bez klikania. Wymaga Node.js 20+.
                          </p>
                          <Command value="git clone https://github.com/rejson59/ProStudent.git" />
                          <Command value="cd ProStudent/sync-agent && node src/cli.mjs login" />
                          <Command value="cd ProStudent/sync-agent && node src/cli.mjs serve" />
                          <div className="flex flex-wrap items-center gap-2">
                            <Btn variant="ghost" onClick={() => void agentStatus().then(setStatus)}>
                              <Icon name="reset" className="w-4 h-4" /> Sprawdź ponownie
                            </Btn>
                            <a
                              href={REPO}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted hover:text-ink underline decoration-dotted"
                            >
                              Instrukcja agenta
                            </a>
                          </div>
                          <p className="text-[11px] text-muted">
                            Sprawdzany adres: <code>{AGENT_URL}</code>
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </details>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,.txt,.html"
              className="sr-only"
              aria-label="Wybierz plik z danymi dziennika"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>
        )}

        {step === "preview" && snapshot && preview && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Źródło: <b className="text-ink">{snapshot.source}</b>
              {snapshot.student?.name ? ` · ${snapshot.student.name}` : ""} · wyeksportowano{" "}
              {new Date(snapshot.exportedAt).toLocaleString("pl-PL")}
            </p>

            {notes.length > 0 && (
              <ul className="text-xs text-muted space-y-1 bg-paper border border-line rounded-xl p-3">
                {notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            )}

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
