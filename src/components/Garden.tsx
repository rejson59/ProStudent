import { useId } from "react";
import { mulberry } from "../lib/color";
import type { Session } from "../lib/data";

const PETALS = ["#e3879a", "#eebc55", "#8f8ad4", "#e07a5f", "#f2f0ff", "#5f9fd6", "#f4a3c0", "#ffd166"];

function Flower({ seed, x, y, fresh }: { seed: number; x: number; y: number; fresh: boolean }) {
  const r = mulberry(seed);
  const type = Math.floor(r() * 4);
  const h = 32 + r() * 34;
  const color = PETALS[Math.floor(r() * PETALS.length)];
  const lean = (r() - 0.5) * 10;
  const topX = lean;
  const topY = -h;
  const dur = 3 + r() * 3;
  const leafSide = r() > 0.5 ? 1 : -1;

  let head;
  if (type === 0) {
    const n = 6 + Math.floor(r() * 4);
    head = (
      <g transform={`translate(${topX} ${topY})`}>
        {Array.from({ length: n }, (_, i) => (
          <ellipse key={i} rx="3.4" ry="8" cy="-7" fill={color} transform={`rotate(${(360 / n) * i})`} />
        ))}
        <circle r="4.2" fill="#f6c453" />
      </g>
    );
  } else if (type === 1) {
    head = (
      <g transform={`translate(${topX} ${topY})`}>
        <path d="M-8 0 C-9 -10, -6 -16, -4 -16 L-2 -10 L0 -17 L2 -10 L4 -16 C6 -16, 9 -10, 8 0 C 5 5, -5 5, -8 0Z" fill={color} />
      </g>
    );
  } else if (type === 2) {
    head = (
      <g transform={`translate(${topX} ${topY})`}>
        {Array.from({ length: 14 }, (_, i) => (
          <ellipse key={i} rx="2.6" ry="7" cy="-8" fill="#f2b632" transform={`rotate(${(360 / 14) * i})`} />
        ))}
        <circle r="6" fill="#7a4b2a" />
        <circle r="3" fill="#5c3720" />
      </g>
    );
  } else {
    head = (
      <g transform={`translate(${topX} ${topY})`}>
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx={(i % 2 ? 2.5 : -2.5) + 0} cy={-i * 4} r={3.2 - i * 0.25} fill={i % 2 ? "#a49ee0" : "#8f8ad4"} />
        ))}
      </g>
    );
  }

  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={fresh ? "sprout" : ""}>
        <g className="sway" style={{ animationDuration: `${dur}s` }}>
          <path d={`M0 0 Q ${lean / 2 + 3} ${-h / 2}, ${topX} ${topY}`} stroke="#4f8a5b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d={`M${lean / 4} ${-h * 0.35} q ${leafSide * 10} -6 ${leafSide * 14} 2 q ${-leafSide * 8} 4 ${-leafSide * 14} -2z`} fill="#5d9a68" />
          {head}
        </g>
      </g>
    </g>
  );
}

export function Garden({ sessions, height = 170, max = 28, freshId }: { sessions: Session[]; height?: number; max?: number; freshId?: string }) {
  // Unikalne ID gradientu — `Garden` występuje na stronie więcej niż raz.
  const uid = useId().replace(/:/g, "");
  const soil = `soil-${uid}`;
  const list = sessions.slice(-max);
  const W = 400;
  return (
    <svg viewBox={`0 0 ${W} 170`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id={soil} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8fbf8f" />
          <stop offset="1" stopColor="#6a9a6f" />
        </linearGradient>
      </defs>
      <path d="M0 150 Q 100 136 200 142 T 400 140 V170 H0Z" fill={`url(#${soil})`} />
      {Array.from({ length: 26 }, (_, i) => {
        const x = 8 + i * 15.5;
        return <path key={i} d={`M${x} 152 l2 -7 l1 7 l2 -5 l1 5`} stroke="#5d9a68" strokeWidth="1.4" fill="none" />;
      })}
      {list.length === 0 && (
        <g transform="translate(200 146)">
          <path d="M0 0 V-14" stroke="#4f8a5b" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M0 -10 q -10 -8 -14 -2 q 8 6 14 2z M0 -12 q 10 -9 15 -3 q -8 7 -15 3z" fill="#5d9a68" />
        </g>
      )}
      {list.map((s, i) => {
        const r = mulberry(s.seed + 7);
        const row = i % 2;
        const x = 20 + ((i * 53 + Math.floor(r() * 18)) % (W - 40));
        const y = 146 + row * 6 + r() * 3;
        return <Flower key={s.id} seed={s.seed} x={x} y={y} fresh={s.id === freshId} />;
      })}
    </svg>
  );
}
