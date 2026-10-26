const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h2M14 12h2M8 16h2M14 16h2",
  check: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  timer: "M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  cards: "M8 4h11a1 1 0 0 1 1 1v12M4 8h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  auto: "M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  play: "M7 4v16l13-8z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  reset: "M4 4v6h6M20 12a8 8 0 1 1-2.3-5.7L20 9",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  rain: "M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a3.5 3.5 0 0 1 0 7zM8 18l-1 3M12 18l-1 3M16 18l-1 3",
  wave: "M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0M2 6c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0",
  fire: "M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8a7 7 0 0 0 7 7z",
  noise: "M3 12h2l2-6 3 12 3-15 3 12 2-6 3 3h1",
  flip: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5",
  x: "M6 6l12 12M18 6 6 18",
  leaf: "M5 19c0-9 6-14 15-15-1 9-6 15-15 15zM5 19l7-7",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
};

export function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8 }: { name: keyof typeof PATHS | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
