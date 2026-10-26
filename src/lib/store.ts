import { useCallback, useEffect, useState } from "react";

const EVT = "plecak-sync";

export function useLocal<T>(key: string, initial: T | (() => T)) {
  const k = "plecak:" + key;
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { key: string; value: T };
      if (d.key === k) setVal(d.value);
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [k]);

  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setVal((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(k, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        queueMicrotask(() => window.dispatchEvent(new CustomEvent(EVT, { detail: { key: k, value: next } })));
        return next;
      });
    },
    [k]
  );

  return [val, set] as const;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
