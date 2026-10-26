import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

export type Action = { id: string; label: string; hint?: string; icon: string; run: () => void; keywords?: string };

export function CommandPalette({
  open,
  onClose,
  actions,
  onQuickAdd,
}: {
  open: boolean;
  onClose: () => void;
  actions: Action[];
  onQuickAdd: (title: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open]);

  // Escape działa niezależnie od tego, gdzie jest focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // Prosta pułapka focusa: Tab nie wychodzi poza dialog.
      if (e.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.startsWith("+")) {
      const title = q.trim().slice(1).trim();
      return [
        {
          id: "quick",
          label: title ? `Dodaj zadanie na jutro: „${title}”` : "Wpisz nazwę zadania po „+”",
          icon: "plus",
          run: () => {
            if (title) onQuickAdd(title);
          },
        } as Action,
      ];
    }
    return actions.filter(
      (action) => !query || (action.label + " " + (action.keywords ?? "")).toLowerCase().includes(query)
    );
  }, [q, actions, onQuickAdd]);

  if (!open) return null;

  const exec = (action?: Action) => {
    if (!action) return;
    action.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-[#121420]/40 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg card !rounded-3xl overflow-hidden rise"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          Szybkie akcje
        </h2>
        <div className="flex items-center gap-3 px-5 border-b border-line">
          <Icon name="search" className="w-5 h-5 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(list.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                exec(list[sel]);
              }
            }}
            placeholder="Szukaj akcji… lub „+ nazwa” aby dodać zadanie"
            aria-label="Szukaj akcji lub dodaj zadanie"
            className="flex-1 py-4 bg-transparent outline-none"
          />
          <kbd className="text-[10px] text-muted border border-line rounded-md px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-auto p-2 scroll-thin" aria-label="Dostępne akcje">
          {list.map((action, index) => (
            <li key={action.id}>
              <button
                type="button"
                onMouseEnter={() => setSel(index)}
                onClick={() => exec(action)}
                aria-current={index === sel ? "true" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition cursor-pointer ${
                  index === sel ? "bg-sage/15" : ""
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-lg grid place-items-center ${
                    index === sel ? "bg-sage text-[var(--color-ink)]" : "bg-paper text-muted"
                  }`}
                >
                  <Icon name={action.icon} className="w-4 h-4" />
                </span>
                <span className="flex-1 font-medium">{action.label}</span>
                {action.hint && (
                  <kbd className="text-[10px] text-muted border border-line rounded-md px-1.5 py-0.5">{action.hint}</kbd>
                )}
              </button>
            </li>
          ))}
          {!list.length && <li className="text-center text-sm text-muted py-6">Nic nie znaleziono 🤔</li>}
        </ul>
        <div className="px-5 py-2.5 border-t border-line text-[11px] text-muted flex gap-4">
          <span>↑↓ wybierz</span>
          <span>↵ wykonaj</span>
          <span>+ szybkie zadanie</span>
        </div>
      </div>
    </div>
  );
}
