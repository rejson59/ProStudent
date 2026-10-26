import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

export type Action = { id: string; label: string; hint?: string; icon: string; run: () => void; keywords?: string };

export function CommandPalette({ open, onClose, actions, onQuickAdd }: { open: boolean; onClose: () => void; actions: Action[]; onQuickAdd: (title: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.startsWith("+")) {
      const title = q.trim().slice(1).trim();
      return [{ id: "quick", label: title ? `Dodaj zadanie na jutro: „${title}”` : "Wpisz nazwę zadania po „+”", icon: "plus", run: () => title && onQuickAdd(title) } as Action];
    }
    return actions.filter((a) => !query || (a.label + " " + (a.keywords ?? "")).toLowerCase().includes(query));
  }, [q, actions, onQuickAdd]);

  if (!open) return null;

  const exec = (a?: Action) => {
    if (!a) return;
    a.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-[#121420]/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg card !rounded-3xl overflow-hidden rise" onMouseDown={(e) => e.stopPropagation()}>
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
              } else if (e.key === "Enter") exec(list[sel]);
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Szukaj akcji… lub „+ nazwa” aby dodać zadanie"
            className="flex-1 py-4 bg-transparent outline-none"
          />
          <kbd className="text-[10px] text-muted border border-line rounded-md px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-auto p-2 scroll-thin">
          {list.map((a, i) => (
            <li key={a.id}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={() => exec(a)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition cursor-pointer ${i === sel ? "bg-sage/15" : ""}`}
              >
                <span className={`w-8 h-8 rounded-lg grid place-items-center ${i === sel ? "bg-sage text-white" : "bg-paper text-muted"}`}>
                  <Icon name={a.icon} className="w-4 h-4" />
                </span>
                <span className="flex-1 font-medium">{a.label}</span>
                {a.hint && <kbd className="text-[10px] text-muted border border-line rounded-md px-1.5 py-0.5">{a.hint}</kbd>}
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
