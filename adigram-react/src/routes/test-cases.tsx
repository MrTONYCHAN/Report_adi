import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { EmptyState, Panel, Pill, Toolbar } from "@/components/dashboard/bits";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { useDashboard, useMoveCard } from "@/lib/data";
import type { BugStatus } from "@/lib/data";
import type { Column } from "@/lib/export";

type TestRow = {
  id: string;
  name: string;
  workstream: string;
  status: string;
  defectStatus: string;
  owner: string;
  updated: string;
};

const exportColumns: Column<TestRow>[] = [
  { key: "id", header: "ID", value: (t) => t.id, width: 1100 },
  { key: "name", header: "Test case", value: (t) => t.name, width: 3600 },
  { key: "workstream", header: "Workstream", value: (t) => t.workstream, width: 1800 },
  { key: "status", header: "Outcome", value: (t) => t.status, width: 1200 },
  { key: "defectStatus", header: "Defect Status", value: (t) => t.defectStatus, width: 1200 },
  { key: "owner", header: "Owner", value: (t) => t.owner, width: 1500 },
  { key: "updated", header: "Last updated", value: (t) => t.updated, width: 1600 },
];

export const Route = createFileRoute("/test-cases")({
  head: () => ({
    meta: [
      { title: "Test Cases — ADIGRAMS 2.0 Readiness" },
      {
        name: "description",
        content:
          "Test-case register by workstream with pass, partial, not-run and fail outcomes and last update.",
      },
      { property: "og:title", content: "Test Cases — ADIGRAMS 2.0 Readiness" },
      {
        property: "og:description",
        content: "Outcome register across all four ADIGRAMS 2.0 workstreams.",
      },
    ],
  }),
  component: TestCases,
});

const DEFECT_CYCLE: BugStatus[] = [
  "untracked",
  "open",
  "in-progress",
  "fixed",
  "verified",
  "closed",
  "wont-fix",
];

const DEFECT_LABELS: Record<BugStatus, string> = {
  scheduled: "Scheduled",
  untracked: "Untracked",
  open: "Open",
  "in-progress": "In Progress",
  blocked: "Blocked",
  fixed: "Fixed",
  verified: "Verified",
  closed: "Closed",
  "wont-fix": "Won't Fix",
};

function defectColorClass(status: string) {
  if (["fixed", "closed", "verified"].includes(status))
    return "text-[var(--ok)] border-[var(--ok)] bg-[var(--ok-bg)]";
  if (status === "in-progress")
    return "text-[var(--accent)] border-[var(--accent)] bg-[var(--accent-soft)]";
  if (status === "open")
    return "text-[var(--high)] border-[var(--high)] bg-[var(--high-bg)]";
  if (status === "blocked")
    return "text-[var(--crit)] border-[var(--crit)] bg-[var(--crit-bg)]";
  return "text-muted-foreground border-border bg-surface";
}

function DefectStatusToggle({ t }: { t: TestRow }) {
  const { move, isPending } = useMoveCard();

  function handleClick() {
    if (isPending) return;
    const idx = DEFECT_CYCLE.indexOf(t.defectStatus as BugStatus);
    const next = DEFECT_CYCLE[(idx + 1) % DEFECT_CYCLE.length]!;
    move({ id: t.id, origin: "report" }, "bug", next);
  }

  const label = DEFECT_LABELS[t.defectStatus as BugStatus] ?? t.defectStatus.toUpperCase();

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Click to cycle defect status"
      className={`press rounded-full border px-3 py-1 text-xs font-semibold uppercase outline-none transition-all duration-150 select-none cursor-pointer min-w-[104px] text-center focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 hover:brightness-105 ${defectColorClass(t.defectStatus)}`}
    >
      {label}
    </button>
  );
}

function TestCases() {
  const { testCases, workstreams } = useDashboard();
  const [q, setQ] = useState("");
  const [ws, setWs] = useState("all");

  const rows = useMemo(
    () =>
      testCases.filter(
        (t) =>
          (ws === "all" || t.workstream === ws) &&
          (t.name.toLowerCase().includes(q.toLowerCase()) ||
            t.id.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, ws, testCases],
  );

  return (
    <Shell
      title="Test Cases"
      subtitle="Outcome register · pass, partial, not run and fail"
      actions={
        <ExportMenu
          spec={{
            base: "test-cases",
            title: "Test-case register",
            subtitle: `${rows.length} case(s) · exported from the ADIGRAMS 2.0 readiness dashboard`,
            columns: exportColumns,
            rows,
          }}
        />
      }
    >
      <Toolbar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search test cases"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search test cases…"
            className="w-64 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none transition-all duration-300 focus:border-primary focus:ring-4 focus:ring-primary/12"
          />
        </div>
        <select
          aria-label="Filter by workstream"
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          className="press rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All workstreams</option>
          {workstreams.map((w) => (
            <option key={w.id} value={w.name}>
              {w.name}
            </option>
          ))}
        </select>
        <span className="ml-auto pr-1 text-xs text-muted-foreground">
          {rows.length} of {testCases.length} cases
        </span>
      </Toolbar>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workstreams.map((w, i) => (
          <div key={w.id} style={{ animationDelay: `${i * 60}ms` }} className="rise card-ios p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {w.id}
            </p>
            <p className="mt-1 text-sm font-bold">{w.name}</p>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full">
              <span
                className="bg-[var(--chart-2)]"
                style={{ width: `${(w.pass / (w.pass + w.partial + w.notRun + w.fail)) * 100}%` }}
              />
              <span
                className="bg-[var(--chart-3)]"
                style={{
                  width: `${(w.partial / (w.pass + w.partial + w.notRun + w.fail)) * 100}%`,
                }}
              />
              <span
                className="bg-[var(--chart-neutral)]"
                style={{ width: `${(w.notRun / (w.pass + w.partial + w.notRun + w.fail)) * 100}%` }}
              />
              <span
                className="bg-[var(--chart-4)]"
                style={{ width: `${(w.fail / (w.pass + w.partial + w.notRun + w.fail)) * 100}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {w.pass} pass · {w.partial} partial · {w.notRun} not run · {w.fail} fail
            </p>
          </div>
        ))}
      </div>

      <Panel
        title={`${rows.length} result${rows.length === 1 ? "" : "s"}`}
        subtitle="Recorded assessment outcome per case"
        className="mt-4"
        delay={220}
      >
        <ul className="record-list kanban max-h-[68vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((t, i) => (
            <li
              key={t.id}
              id={t.id}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              className="rise press flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 transition-colors duration-200 hover:border-primary/35"
            >
              <span className="font-mono text-xs font-semibold text-primary">{t.id}</span>
              <span className="min-w-[200px] flex-1 text-sm font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.workstream}</span>
              <Pill value={t.status} />
              <DefectStatusToggle t={t} />
              <span className="w-24 text-right text-xs text-muted-foreground">{t.owner}</span>
              <span className="w-14 text-right text-xs text-muted-foreground">{t.updated}</span>
            </li>
          ))}
          {rows.length === 0 && (
            <li>
              <EmptyState
                icon={SearchX}
                title="No test cases match that filter"
                hint="Clear the search box or pick a different workstream."
              />
            </li>
          )}
        </ul>
      </Panel>
    </Shell>
  );
}
