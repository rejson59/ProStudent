import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ToastAction = { label: string; run: () => void };
export type ToastOptions = { action?: ToastAction; duration?: number };
type ShowToast = (message: string, options?: ToastOptions) => void;

type ToastItem = { id: number; message: string; action?: ToastAction };

const ToastContext = createContext<ShowToast>(() => {});

/** Powiadomienie z opcjonalnym przyciskiem akcji (np. „Cofnij”). */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback<ShowToast>(
    (message, options) => {
      // Poprzedni timer MUSI zostać wyczyszczony, inaczej starsze powiadomienie
      // gasi nowsze przed czasem.
      clearTimer();
      seq.current += 1;
      const item: ToastItem = { id: seq.current, message, action: options?.action };
      setToast(item);
      timer.current = window.setTimeout(() => {
        setToast((current) => (current?.id === item.id ? null : current));
        timer.current = null;
      }, options?.duration ?? 4200);
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,28rem)] pointer-events-none">
        <div role="status" aria-live="polite" aria-atomic="true" className="grid gap-2">
          {toast && (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink text-paper px-4 py-3 shadow-2xl rise"
            >
              <p className="text-sm font-medium flex-1">{toast.message}</p>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.run();
                    dismiss();
                  }}
                  className="shrink-0 text-sm font-bold text-butter hover:opacity-80 cursor-pointer"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={dismiss}
                aria-label="Zamknij powiadomienie"
                className="shrink-0 p-1 rounded-lg text-paper/60 hover:text-paper cursor-pointer"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
