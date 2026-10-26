import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DATA_DECODERS } from "../lib/schema";
import {
  DATA_VERSION,
  exportData,
  importData,
  requestPersistence,
  resetData,
  storageUsage,
} from "../lib/store";
import { Btn } from "./ui";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "kB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Panel „Twoje dane”: kopia zapasowa, import i pełny reset.
 *
 * Do tej wersji nie było ŻADNEGO sposobu na przeniesienie lub odzyskanie danych —
 * wyczyszczenie witryny oznaczało utratę ocen, planu i fiszek.
 */
export function DataPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void storageUsage().then(setUsage);
    void requestPersistence().then(setPersisted);
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const download = useCallback(() => {
    const payload = {
      app: "plecak",
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: exportData(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plecak-kopia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Kopia zapasowa została pobrana 📥");
  }, [toast]);

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          toast("To nie jest poprawny plik JSON 🤔");
          return;
        }

        const payload =
          typeof parsed === "object" && parsed !== null && "data" in parsed
            ? (parsed as { data: unknown }).data
            : parsed;

        if (!window.confirm("Import zastąpi obecne dane Plecaka. Kontynuować?")) return;

        const result = importData(payload, DATA_DECODERS);
        if (result.ok) {
          toast(
            `${result.message}${result.skipped ? ` Pominięto ${result.skipped}.` : ""} Odświeżam…`,
            { duration: 2500 }
          );
          window.setTimeout(() => window.location.reload(), 900);
        } else {
          toast(result.message);
        }
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [toast]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 pt-[10vh] md:pt-4 bg-[#121420]/40 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card !rounded-3xl w-full max-w-lg p-6 max-h-[85vh] overflow-auto scroll-thin rise"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-xs uppercase tracking-[.2em] font-semibold text-muted">Plecak</p>
            <h2 id={titleId} className="font-display text-2xl font-semibold">
              Twoje dane
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Zamknij panel danych"
            className="p-2 rounded-xl text-muted hover:text-ink hover:bg-line/60 cursor-pointer"
          >
            <Icon name="x" />
          </button>
        </div>

        <p className="text-sm text-muted mb-5">
          Wszystko trzymamy wyłącznie w tej przeglądarce. Zrób kopię, zanim zmienisz urządzenie albo wyczyścisz dane.
        </p>

        <div className="space-y-3">
          <div className="rounded-2xl border border-line p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-sage/15 text-sage shrink-0">
              <Icon name="check" className="w-4 h-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Kopia zapasowa</p>
              <p className="text-xs text-muted">Pobierz plik JSON ze wszystkim: planem, zadaniami, ocenami, fiszkami.</p>
            </div>
            <Btn variant="soft" onClick={download} className="!px-3 shrink-0">
              Eksportuj
            </Btn>
          </div>

          <div className="rounded-2xl border border-line p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-sky/15 text-sky shrink-0">
              <Icon name="reset" className="w-4 h-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Przywróć z pliku</p>
              <p className="text-xs text-muted">Import zastąpi obecne dane. Nieznane sekcje zostaną pominięte.</p>
            </div>
            <Btn variant="soft" onClick={() => fileRef.current?.click()} disabled={busy} className="!px-3 shrink-0">
              Importuj
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Wybierz plik kopii zapasowej"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>

          <div className="rounded-2xl border border-line p-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl grid place-items-center bg-lav/15 text-lav shrink-0">
                <Icon name="sparkle" className="w-4 h-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Ochrona danych</p>
                <p className="text-xs text-muted">
                  {persisted
                    ? "Przeglądarka nie usunie danych przy braku miejsca. ✅"
                    : "Poproś przeglądarkę o trwałe przechowywanie (mniej ochotnie czyści dane)."}
                </p>
              </div>
              {!persisted && (
                <Btn variant="soft" className="!px-3 shrink-0" onClick={() => void requestPersistence().then(setPersisted)}>
                  Włącz
                </Btn>
              )}
            </div>
            {usage && usage.quota > 0 && (
              <p className="text-[11px] text-muted mt-3">
                Zajęte: {formatBytes(usage.usage)} z {formatBytes(usage.quota)} dostępnych dla tej witryny.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-clay/40 bg-clay/5 p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-clay/15 text-clay shrink-0">
              <Icon name="trash" className="w-4 h-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Usuń wszystko</p>
              <p className="text-xs text-muted">Kasuje plan, zadania, oceny, fiszki i historię fokusu. Bezpowrotnie.</p>
            </div>
            <Btn
              variant="ghost"
              className="!px-3 shrink-0 !text-clay"
              onClick={() => {
                if (!window.confirm("Na pewno usunąć wszystkie dane Plecaka? Tej operacji nie da się cofnąć.")) return;
                resetData();
                window.location.reload();
              }}
            >
              Wyczyść
            </Btn>
          </div>
        </div>

        <p className="text-[11px] text-muted mt-5">
          Format kopii: wersja {DATA_VERSION} · {Object.keys(DATA_DECODERS).length} obsługiwanych sekcji danych.
        </p>
      </div>
    </div>
  );
}
