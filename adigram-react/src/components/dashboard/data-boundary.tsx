import { useDashboardQuery } from "@/lib/data";
import {
  BrandEllipsis,
  BrandLogo,
  BrandScreen,
  BrandWordmark,
  DotMatrix,
} from "@/components/dashboard/brand-screen";
import type { ReactNode } from "react";
export function DashboardDataBoundary({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch, isFetching } = useDashboardQuery();
  if (!data)
    return isPending ? (
      <BrandScreen busy>
        <div className="brand-card flex flex-col items-center gap-6 text-center">
          <BrandLogo />
          <div>
            <BrandWordmark className="text-xl sm:text-2xl" />
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              Loading the readiness report
              <BrandEllipsis />
            </p>
          </div>
          <DotMatrix />
        </div>
      </BrandScreen>
    ) : (
      <BrandScreen>
        <div className="brand-card flex flex-col items-center gap-5 text-center">
          <BrandLogo />
          <div>
            <BrandWordmark className="text-xl sm:text-2xl" />
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error?.message || "No report data is available."}
            </p>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="press w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isFetching ? "Retrying…" : "Retry loading data"}
          </button>
        </div>
      </BrandScreen>
    );
  return (
    <>
      {error && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 right-4 z-50 rounded-xl border border-warning bg-surface p-4 text-sm shadow-lg"
        >
          Refresh failed. Showing the last successful report.{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}
      {children}
    </>
  );
}
