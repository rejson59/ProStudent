import { useEffect, useState } from "react";

/** Reaktywny `matchMedia` z bezpiecznym fallbackiem (SSR, stare przeglądarki). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try {
      return window.matchMedia?.(query).matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mql: MediaQueryList | undefined;
    try {
      mql = window.matchMedia?.(query);
    } catch {
      return;
    }
    if (!mql) return;

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}
