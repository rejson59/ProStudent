import { useId, useMemo, type ReactNode } from "react";
import { clamp, mix, mulberry } from "../lib/color";

const KEYS: [number, string, string][] = [
  [0, "#0b1030", "#262a55"],
  [4.5, "#141a45", "#3b3768"],
  [6, "#6c6fb5", "#f5ae92"],
  [7.5, "#8cc0ec", "#f8dcc0"],
  [12, "#73b2ec", "#d6ecfb"],
  [16.5, "#86b4e4", "#f6dcc0"],
  [18.8, "#57579e", "#f39b78"],
  [20.3, "#262a5c", "#8a5a85"],
  [21.8, "#0b1030", "#262a55"],
  [24, "#0b1030", "#262a55"],
];

function skyAt(h: number) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, t0, b0] = KEYS[i];
    const [h1, t1, b1] = KEYS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return { top: mix(t0, t1, t), bottom: mix(b0, b1, t) };
    }
  }
  return { top: KEYS[0][1], bottom: KEYS[0][2] };
}

export function skyInfo(now: Date) {
  const h = now.getHours() + now.getMinutes() / 60;
  const elev = h >= 6 && h <= 20 ? Math.sin((Math.PI * (h - 6)) / 14) : -0.3;
  const day = clamp((elev + 0.12) / 0.45);
  return { h, day };
}

export function Sky({ now, children, className = "" }: { now: Date; children?: ReactNode; className?: string }) {
  // ID gradientów muszą być unikalne — inaczej druga instancja `Sky` na stronie
  // przejęłaby definicje pierwszej.
  const uid = useId().replace(/:/g, "");
  const sunGlow = `sunglow-${uid}`;
  const moonGlow = `moonglow-${uid}`;

  const { h, day } = skyInfo(now);
  const { top, bottom } = skyAt(h);

  const stars = useMemo(() => {
    const r = mulberry(42);
    return Array.from({ length: 60 }, () => ({ x: r() * 1000, y: r() * 200, s: 0.6 + r() * 1.6, d: 2 + r() * 4, delay: r() * 4 }));
  }, []);

  const sunT = (h - 6) / 14;
  const sun = sunT >= -0.05 && sunT <= 1.05 ? { x: 80 + sunT * 840, y: 250 - Math.sin(Math.PI * clamp(sunT)) * 200 } : null;
  const moonT = ((h - 19 + 24) % 24) / 12;
  const moon = moonT <= 1 ? { x: 80 + moonT * 840, y: 240 - Math.sin(Math.PI * moonT) * 180 } : null;

  const hillBack = mix("#252a4a", "#a8c9a6", day);
  const hillMid = mix("#1d2240", "#86b08e", day);
  const hillFront = mix("#151933", "#6a9a77", day);
  const cloudColor = mix("#4a4f7a", "#ffffff", day);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(180deg, ${top}, ${bottom})`, transition: "background 2s" }}>
      <svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id={sunGlow}>
            <stop offset="0%" stopColor="#fff6d5" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#ffd98a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={moonGlow}>
            <stop offset="0%" stopColor="#e9ecff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#e9ecff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g opacity={1 - day}>
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" className="twinkle" style={{ animationDuration: `${s.d}s`, animationDelay: `${s.delay}s` }} />
          ))}
        </g>
        {moon && day < 0.7 && (
          <g opacity={1 - day} transform={`translate(${moon.x} ${moon.y})`}>
            <circle r="60" fill={`url(#${moonGlow})`} />
            <circle r="18" fill="#f3f1ff" />
            <circle r="16" cx="9" cy="-5" fill={top} opacity="0.92" />
          </g>
        )}
        {sun && day > 0.02 && (
          <g transform={`translate(${sun.x} ${sun.y})`} opacity={Math.min(1, day * 1.4)}>
            <circle r="110" fill={`url(#${sunGlow})`} />
            <circle r="26" fill="#fff3c4" />
          </g>
        )}
        <path d="M0 220 C 120 170, 230 190, 340 205 S 560 160, 700 190 S 900 170, 1000 185 V300 H0Z" fill={hillBack} style={{ transition: "fill 2s" }} />
        <path d="M0 250 C 150 210, 260 230, 420 240 S 650 205, 800 230 S 950 225, 1000 232 V300 H0Z" fill={hillMid} style={{ transition: "fill 2s" }} />
        <path d="M0 275 C 180 250, 330 265, 520 268 S 800 250, 1000 262 V300 H0Z" fill={hillFront} style={{ transition: "fill 2s" }} />
        {/* small trees */}
        {[120, 160, 610, 650, 880].map((x, i) => (
          <g key={x} transform={`translate(${x} ${i < 2 ? 238 : i < 4 ? 222 : 228})`} fill={hillFront}>
            <rect x="-1.5" y="-4" width="3" height="10" />
            <path d={`M0 -${26 + (i % 2) * 8} L10 -2 L-10 -2Z`} />
          </g>
        ))}
        {day < 0.35 &&
          [140, 640, 655].map((x, i) => <rect key={i} x={x} y={i === 0 ? 236 : 224} width="3" height="3" fill="#ffd27a" opacity={0.9 - day * 2} />)}
      </svg>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="drift absolute pointer-events-none"
          style={{ top: `${8 + i * 16}%`, animationDuration: `${70 + i * 35}s`, animationDelay: `-${i * 25}s`, opacity: 0.35 + day * 0.5 }}
        >
          <svg width={110 - i * 18} viewBox="0 0 120 50">
            <path d="M20 45 a18 18 0 0 1 4-35 a24 24 0 0 1 44-4 a20 20 0 0 1 34 12 a15 15 0 0 1-2 27z" fill={cloudColor} />
          </svg>
        </div>
      ))}
      <div className="relative">{children}</div>
    </div>
  );
}
