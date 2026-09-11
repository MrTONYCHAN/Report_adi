import type { CSSProperties, ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/** How the product introduces itself before the dashboard is open. */
export const BRAND_NAME = "Tribal";

/** Nine cells, each carrying the diagonal it sits on, which is what staggers
 *  the sweep across the matrix. */
const MATRIX = Array.from({ length: 9 }, (_, cell) => Math.floor(cell / 3) + (cell % 3));

/** The full-bleed ground both pre-dashboard screens sit on: one flat ink with
 *  the tiled tribal motif drifting over it. Nothing here waits on a network
 *  request, so the screens render the moment the stylesheet does. */
export function BrandScreen({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <main className="brand-screen" aria-busy={busy || undefined}>
      {children}
    </main>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return <p className={`brand-wordmark ${className}`}>{BRAND_NAME}</p>;
}

export function BrandLogo() {
  return (
    <span className="brand-logo">
      <ShieldCheck className="size-6" aria-hidden />
    </span>
  );
}

/** The wait itself: a three-by-three dot matrix with the lit cell travelling
 *  diagonally across it. Decorative — the status text beside it is what a
 *  screen reader announces. */
export function DotMatrix({ small, className = "" }: { small?: boolean; className?: string }) {
  return (
    <span className={`dot-matrix ${small ? "dot-matrix--sm" : ""} ${className}`.trim()} aria-hidden>
      {MATRIX.map((step, cell) => (
        <span key={cell} style={{ "--step": step } as CSSProperties} />
      ))}
    </span>
  );
}

/** Animated ellipsis, so a long wait still looks like it is moving. */
export function BrandEllipsis() {
  return (
    <span className="brand-ellipsis" aria-hidden>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
