import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function CardTitle({ icon, children, action, color = "var(--color-sage)" }: { icon?: ReactNode; children: ReactNode; action?: ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="flex items-center gap-2.5 font-semibold text-[15px]">
        {icon && (
          <span className="grid place-items-center w-8 h-8 rounded-xl" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
            {icon}
          </span>
        )}
        {children}
      </h3>
      {action}
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 10, color = "var(--color-sage)", children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Btn({ children, className, variant = "solid", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.97] disabled:opacity-40 cursor-pointer",
        variant === "solid" && "bg-ink text-paper hover:opacity-90",
        variant === "soft" && "bg-sage/15 text-sage hover:bg-sage/25",
        variant === "ghost" && "text-muted hover:text-ink hover:bg-line/60",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SubjectDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", className)} style={{ background: color }} />;
}

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <p className="text-xs uppercase tracking-[.2em] text-muted font-semibold mb-1">{kicker}</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}
