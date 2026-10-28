import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Btn } from "./ui";
import { useToast } from "./Toast";
import { useJournal } from "../lib/journal/useJournal";
import { decodeSnapshot, type JournalSnapshot } from "../lib/journal/types";
import type { ImportSelection } from "../lib/journal/normalize";
import { agentStatus, fetchAgentSnapshot, type AgentStatus } from "../lib/journal/agent";

type Step = "source" | "preview";

const STEPS: { id: Step; label: string }[] = [
  { id: "source", label: "1. Źródło" },
  { id: "preview", label: "2. Podgląd" },
];

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
  const [selection, setSelection] = useState<ImportSelection>({ grades: true, timetable: true, tasks: true });
  const [paste, setPaste] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("source");
    setSnapshot(null);
    setError(null);
    setPaste("");
    setSelection({ grades: true, timetable: true, tasks: true });
    void agentStatus().then(setStatus);
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

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
      setError(
        `${result.error}. Uruchom agenta na tym komputerze: wejdź do katalogu sync-agent i wpisz \`node src/cli.mjs serve\` (jednorazowo: \`node src/cli.mjs login\`).`
      );
    }
  }, [accept]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 pt-[8vh] md:pt-4 bg-[#121420]/40 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card !rounded-3xl w-full max-w-xl p-6 max-h-[85vh] overflow-auto scroll-thin rise"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-xs uppercase tracking-[.2em] font-semibold text-muted">Dziennik szkolny</p>
            <h2 id={titleId} className="font-display text-2xl font-semibold">
              Import z e-dziennika
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
              className={`px-3 py-1.5 rounded-xl ${
                step === item.id ? "bg-ink text-paper" : "bg-line/60 text-muted"
              }`}
            >
              {item.label}
            </li>
          ))}
        </ol>

        {step === "source" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm font-semibold mb-1">Lokalny agent (automatyczna synchronizacja)</p>
              <p className="text-xs text-muted mb-3">
                Jeśli masz uruchomiony agent na komputerze, pobierz dane jednym kliknięciem. Agent odświeża je sam
                co kilka godzin.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Btn variant="soft" onClick={fromAgent} disabled={busy}>
                  <Icon name="reset" className="w-4 h-4" /> Pobierz z agenta
                </Btn>
                <span className={`text-xs ${status?.online ? "text-sage" : "text-muted"}`}>
                  {status === null
                    ? "sprawdzam…"
                    : status.online
                    ? `agent online${status.lastSync ? ` · ostatnia synchronizacja ${new Date(status.lastSync).toLocaleString("pl-PL")}` : ""}`
                    : "agent nie wykryty"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm font-semibold mb-1">Plik z danymi</p>
              <p className="text-xs text-muted mb-3">Dokument <code>plecak-import-v1.json</code> z konwertera lub od agenta.</p>
              <Btn variant="soft" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Icon name="plus" className="w-4 h-4" /> Wybierz plik
              </Btn>
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
            </div>

            <div className="rounded-2xl border border-line p-4">
              <label htmlFor="journal-paste" className="text-sm font-semibold mb-1 block">
                Wklej dane
              </label>
              <p className="text-xs text-muted mb-2">
                Wklej zawartość pliku, jeśli dostałeś go np. w wiadomości.
              </p>
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
                    onChange={(event) =>
                      setSelection((prev) => ({ ...prev, [row.key]: event.target.checked }))
                    }
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

        {error && step === "preview" && (
          <p role="alert" className="text-sm text-clay mt-3">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
