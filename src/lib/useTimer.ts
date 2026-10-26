import { useCallback, useEffect, useRef } from "react";
import { useLocal } from "./store";
import { decodeFocusLen, decodeTimer, type PersistedTimer } from "./schema";

export type Mode = "focus" | "short" | "long";
export const MODE_LABEL: Record<Mode, string> = { focus: "Skupienie", short: "Krótka przerwa", long: "Długa przerwa" };

/** Po tym czasie „spóźnioną” sesję traktujemy jako nieaktualną (np. karta otwarta po tygodniu). */
const MAX_OVERDUE_MS = 6 * 60 * 60 * 1000;

/**
 * Timer Pomodoro.
 *
 * Stan (`mode`, `endAt`, `left`, `cycles`) jest zapisywany w `localStorage`,
 * więc odświeżenie strony nie kasuje trwającej sesji, a po powrocie do karty
 * czas jest liczony z `Date.now()` (nie z liczby tyknięć).
 */
export function useFocusTimer(onFinish: (mode: Mode, minutes: number) => void) {
  const [focusLen, setFocusLenRaw] = useLocal("focusLen", 25, decodeFocusLen);

  const lengthsRef = useRef<Record<Mode, number>>({ focus: focusLen, short: 5, long: 15 });
  lengthsRef.current = { focus: focusLen, short: 5, long: 15 };

  const [state, setState] = useLocal<PersistedTimer>(
    "timer",
    () => ({ mode: "focus", endAt: null, left: Math.round(focusLen * 60), cycles: 0 }),
    decodeTimer
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  /** Zabezpieczenie przed podwójnym zaliczeniem tej samej sesji. */
  const finishedEndAt = useRef<number | null>(null);

  const complete = useCallback(
    (snapshot: PersistedTimer) => {
      if (snapshot.endAt == null) return;
      if (finishedEndAt.current === snapshot.endAt) return;
      finishedEndAt.current = snapshot.endAt;

      const lengths = lengthsRef.current;
      onFinishRef.current(snapshot.mode, lengths[snapshot.mode]);

      if (snapshot.mode === "focus") {
        const cycles = snapshot.cycles + 1;
        const next: Mode = cycles % 4 === 0 ? "long" : "short";
        setState({ mode: next, endAt: null, left: Math.round(lengths[next] * 60), cycles });
      } else {
        setState({ mode: "focus", endAt: null, left: Math.round(lengths.focus * 60), cycles: snapshot.cycles });
      }
    },
    [setState]
  );

  useEffect(() => {
    const endAt = state.endAt;
    if (endAt == null) return;

    // Sesja „przeterminowana” (karta była zamknięta bardzo długo) — cicho resetujemy.
    if (Date.now() - endAt > MAX_OVERDUE_MS) {
      setState((prev) => ({ ...prev, endAt: null, left: Math.round(lengthsRef.current[prev.mode] * 60) }));
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      if (left > 0) {
        setState((prev) => (prev.left === left ? prev : { ...prev, left }));
      } else {
        complete(stateRef.current);
      }
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
    // Celowo zależymy tylko od `endAt` — zmiana `left` nie ma restartować interwału.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.endAt, complete, setState]);

  const start = useCallback(
    () =>
      setState((prev) =>
        prev.endAt != null ? prev : { ...prev, endAt: Date.now() + Math.max(1, prev.left) * 1000 }
      ),
    [setState]
  );

  const pause = useCallback(
    () =>
      setState((prev) => {
        if (prev.endAt == null) return prev;
        const left = Math.max(0, Math.round((prev.endAt - Date.now()) / 1000));
        return { ...prev, endAt: null, left };
      }),
    [setState]
  );

  const reset = useCallback(
    () =>
      setState((prev) => ({
        ...prev,
        endAt: null,
        left: Math.round(lengthsRef.current[prev.mode] * 60),
      })),
    [setState]
  );

  const setMode = useCallback(
    (mode: Mode) =>
      setState((prev) => ({
        mode,
        endAt: null,
        left: Math.round(lengthsRef.current[mode] * 60),
        cycles: prev.cycles,
      })),
    [setState]
  );

  const startFocus = useCallback(
    () =>
      setState((prev) => {
        const secs = Math.round(lengthsRef.current.focus * 60);
        return { mode: "focus", endAt: Date.now() + secs * 1000, left: secs, cycles: prev.cycles };
      }),
    [setState]
  );

  const setFocusLen = useCallback(
    (n: number) => {
      setFocusLenRaw(n);
      setState((prev) =>
        prev.mode === "focus" && prev.endAt == null ? { ...prev, left: Math.round(n * 60) } : prev
      );
    },
    [setFocusLenRaw, setState]
  );

  return {
    mode: state.mode,
    remaining: state.left,
    total: Math.round(lengthsRef.current[state.mode] * 60),
    running: state.endAt != null,
    focusLen,
    cycles: state.cycles,
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
