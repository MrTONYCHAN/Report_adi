import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  return value;
}

export function Counter({ value, suffix = "" }: { value: number; suffix?: string | undefined }) {
  const v = useCountUp(value);
  return (
    <span className="tabular-nums">
      {Math.round(v)}
      {suffix}
    </span>
  );
}

export function StatCard({
  label,
  value,
  suffix,
  delta,
  hint,
  icon: Icon,
  tone = "primary",
  delay = 0,
}: {
  label: string;
  value: number;
  suffix?: string | undefined;
  delta?: number;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "danger";
  delay?: number;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary ring-primary/15",
    success: "bg-success/12 text-success ring-success/15",
    warning: "bg-warning/15 text-warning ring-warning/15",
    danger: "bg-destructive/10 text-destructive ring-destructive/15",
  }[tone];
  const accentClass = {
    primary: "before:bg-primary",
    success: "before:bg-success",
    warning: "before:bg-warning",
    danger: "before:bg-destructive",
  }[tone];
  const up = (delta ?? 0) >= 0;

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`rise card-ios relative overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-0.5 sm:p-5 ${accentClass}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-md ring-1 ${toneClass}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-[30px] font-bold leading-none sm:text-[32px]">
        <Counter value={value} suffix={suffix} />
      </p>
      {delta !== undefined && (
        <p
          className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
            (tone === "warning" || tone === "danger" ? !up : up)
              ? "text-success"
              : "text-destructive"
          }`}
        >
          {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(delta)}% vs last week
        </p>
      )}
      {delta === undefined && hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={`rise card-ios flex flex-col p-4 sm:p-5 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** One shape for every "there is nothing to show" state. Panels used to size
 *  themselves around a 240–280px void when a chart had no data; this keeps the
 *  message compact and says why rather than just that. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center ${className}`}
    >
      {Icon && (
        <span className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-[36ch] text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The filter bar every register shares, so the boards do not each invent their
 *  own spacing and wrapping rules. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-2 gap-y-2.5 rounded-2xl border border-border bg-surface p-2.5 ${className}`}
    >
      {children}
    </div>
  );
}

const pillTones: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/25",
  high: "bg-warning/15 text-warning border-warning/30",
  medium: "bg-info/12 text-info border-info/25",
  low: "bg-secondary text-muted-foreground border-border",
  fail: "bg-destructive/10 text-destructive border-destructive/25",
  pass: "bg-success/12 text-success border-success/25",
  partial: "bg-warning/15 text-warning border-warning/30",
  "not-run": "bg-secondary text-muted-foreground border-border",
  open: "bg-destructive/10 text-destructive border-destructive/25",
  "in-progress": "bg-primary/10 text-primary border-primary/25",
  review: "bg-info/12 text-info border-info/25",
  fixed: "bg-success/12 text-success border-success/25",
  verified: "bg-success/12 text-success border-success/25",
  done: "bg-success/12 text-success border-success/25",
  todo: "bg-secondary text-muted-foreground border-border",
};

export function Pill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize transition-transform duration-200 hover:scale-105 ${
        pillTones[value] ?? pillTones["low"]
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {value.replace("-", " ")}
    </span>
  );
}

export function Bar({ value, tone = "primary" }: { value: number | null; tone?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value ?? 0), 80);
    return () => clearTimeout(t);
  }, [value]);
  if (value === null)
    return <span className="text-xs text-muted-foreground">Progress not recorded</span>;
  const bg = {
    primary: "bg-[var(--chart-1)]",
    success: "bg-[var(--chart-2)]",
    warning: "bg-[var(--chart-3)]",
    danger: "bg-[var(--chart-4)]",
  }[tone as "primary"];
  return (
    <div
      role="progressbar"
      aria-label="Completion"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-secondary"
    >
      <div
        className={`h-full rounded-full ${bg} transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 132 }: { value: number; size?: number }) {
  const v = useCountUp(value, 1100);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={
            value >= 75 ? "var(--chart-2)" : value >= 55 ? "var(--chart-1)" : "var(--chart-3)"
          }
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold tabular-nums">{Math.round(v)}%</p>
        <p className="text-xs text-muted-foreground">passed</p>
      </div>
    </div>
  );
}
