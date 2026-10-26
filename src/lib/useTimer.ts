import { useCallback, useEffect, useRef, useState } from "react";
import { useLocal } from "./store";

export type Mode = "focus" | "short" | "long";
export const MODE_LABEL: Record<Mode, string> = { focus: "Skupienie", short: "Krótka przerwa", long: "Długa przerwa" };

export function useFocusTimer(onFinish: (mode: Mode, minutes: number) => void) {
  const [focusLen, setFocusLenRaw] = useLocal("focusLen", 25);
  const lengths: Record<Mode, number> = { focus: focusLen, short: 5, long: 15 };
  const [mode, setModeRaw] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(focusLen * 60);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [cycles, setCycles] = useState(0);
  const cb = useRef(onFinish);
  useEffect(() => {
    cb.current = onFinish;
  });

  const lenRef = useRef(lengths);
  lenRef.current = lengths;

  useEffect(() => {
    if (endAt == null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setEndAt(null);
        const L = lenRef.current;
        cb.current(mode, L[mode]);
        if (mode === "focus") {
          const c = cycles + 1;
          setCycles(c);
          const next: Mode = c % 4 === 0 ? "long" : "short";
          setModeRaw(next);
          setRemaining(L[next] * 60);
        } else {
          setModeRaw("focus");
          setRemaining(L.focus * 60);
        }
      }
    };
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [endAt, mode, cycles]);

  const start = useCallback(() => setEndAt(Date.now() + remaining * 1000), [remaining]);
  const pause = useCallback(() => setEndAt(null), []);
  const reset = useCallback(() => {
    setEndAt(null);
    setRemaining(lenRef.current[mode] * 60);
  }, [mode]);
  const setMode = useCallback((m: Mode) => {
    setEndAt(null);
    setModeRaw(m);
    setRemaining(lenRef.current[m] * 60);
  }, []);
  const startFocus = useCallback(() => {
    const secs = lenRef.current.focus * 60;
    setModeRaw("focus");
    setRemaining(secs);
    setEndAt(Date.now() + secs * 1000);
  }, []);
  const setFocusLen = useCallback(
    (n: number) => {
      setFocusLenRaw(n);
      if (mode === "focus" && endAt == null) setRemaining(n * 60);
    },
    [mode, endAt, setFocusLenRaw]
  );

  return {
    mode,
    remaining,
    total: lengths[mode] * 60,
    running: endAt != null,
    focusLen,
    cycles,
    start,
    startFocus,
    pause,
    reset,
    setMode,
    setFocusLen,
  };
}

export type Timer = ReturnType<typeof useFocusTimer>;

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
