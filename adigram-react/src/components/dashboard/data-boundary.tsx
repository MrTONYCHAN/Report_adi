import { useDashboardQuery } from "@/lib/data";
import type { ReactNode } from "react";
export function DashboardDataBoundary({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch, isFetching } = useDashboardQuery();
  if (!data)
    return (
      <main
        className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8"
        aria-busy={isPending}
      >
        <h1 className="text-xl font-semibold">ADIGRAMS readiness</h1>
        {isPending ? (
          <p role="status">Loading the readiness report…</p>
        ) : (
          <>
            <p role="alert">{error?.message || "No report data is available."}</p>
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-xl bg-primary px-4 py-3 text-primary-foreground"
            >
              {isFetching ? "Retrying…" : "Retry loading data"}
            </button>
          </>
        )}
      </main>
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
