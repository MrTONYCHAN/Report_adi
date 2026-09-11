import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpDown, Plus, SearchX } from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { EmptyState, Panel, Pill, Toolbar } from "@/components/dashboard/bits";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { ItemDialog } from "@/components/dashboard/item-dialog";
import { Flags, StatusMenu } from "@/components/dashboard/card-controls";
import {
  ALL_PROJECTS,
  BUG_STATUSES,
  SEVERITIES,
  STATUS_LABELS,
  formatDate,
  useDashboard,
  type BugRow,
  type Severity,
} from "@/lib/data";
import {
  NO_DATE_FILTER,
  bySortKey,
  daysOf,
  isActive,
  matchesRange,
  type DateFilter,
} from "@/lib/date-filter";
import type { Column } from "@/lib/export";

export const Route = createFileRoute("/bugs")({
  head: () => ({
    meta: [
      { title: "Bugs — Tribal Tasks Readiness" },
      {
        name: "description",
        content:
          "Defect register with severity, owning module, assignee, schedule and ageing for the Tribal Tasks go-live review.",
      },
      { property: "og:title", content: "Bugs — Tribal Tasks Readiness" },
      {
        property: "og:description",
        content: "Severity-ranked defect register with ageing, due dates and ownership.",
      },
    ],
  }),
  component: Bugs,
});

const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, unassessed: 4 };

const exportColumns: Column<BugRow>[] = [
  { key: "id", header: "ID", value: (b) => b.id, width: 1100 },
  { key: "title", header: "Defect", value: (b) => b.title, width: 3200 },
  { key: "module", header: "Module", value: (b) => b.module, width: 1600 },
  { key: "assignee", header: "Owner", value: (b) => b.assignee, width: 1400 },
  { key: "severity", header: "Severity", value: (b) => b.severity },
  { key: "status", header: "Status", value: (b) => STATUS_LABELS[b.status] ?? b.status },
  { key: "age", header: "Age (days)", value: (b) => (b.age === null ? "" : b.age) },
  { key: "startDate", header: "Start", value: (b) => b.startDate ?? "" },
  { key: "dueDate", header: "Due", value: (b) => b.dueDate ?? "" },
  { key: "updatedAt", header: "Last updated", value: (b) => formatDate(b.updatedAt) },
  {
    key: "flags",
    header: "Flags",
    value: (b) => [b.breached && "Overdue", b.escalated && "Escalated"].filter(Boolean).join(", "),
  },
  {
    key: "origin",
    header: "Source",
    value: (b) => (b.origin === "report" ? "Report" : "Dashboard"),
  },
];

function Bugs() {
  const { bugs, workstreams, developers, transitions, slaDays, projects, activeProjectId } =
    useDashboard();
  /* A defect raised before the register held projects carries no project of its
     own, so it reads as belonging to the first one — where the report lives. */
  const projectName = (id: string) =>
    projects.find((project) => project.id === id)?.name || projects[0]?.name || "Unassigned";
  const filingProject =
    activeProjectId === ALL_PROJECTS ? (projects[0]?.id ?? "") : activeProjectId;
  /* The export carries the owning project too, so a pack pulled with every
     project in view still says which one each defect belongs to. */
  const columns: Column<BugRow>[] = [
    ...exportColumns.slice(0, 2),
    {
      key: "project",
      header: "Project",
      value: (b: BugRow) => projectName(b.projectId),
      width: 1500,
    },
    ...exportColumns.slice(2),
  ];
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [status, setStatus] = useState<"all" | string>("all");
  const [byAge, setByAge] = useState(false);
  const [dates, setDates] = useState<DateFilter>(NO_DATE_FILTER);
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const inRange = useMemo(() => bugs.filter((b) => matchesRange(b, dates)), [bugs, dates]);

  const rows = useMemo(() => {
    let list = sev === "all" ? [...inRange] : inRange.filter((b) => b.severity === sev);
    if (status !== "all") list = list.filter((b) => b.status === status);
    // A picked date range means the register is being read as a schedule, so the
    // calendar's own ordering wins over the default severity ranking.
    if (isActive(dates)) return list.sort(bySortKey(dates.field, direction));
    return list.sort((a, b) =>
      byAge ? (b.age ?? -1) - (a.age ?? -1) : rank[a.severity] - rank[b.severity],
    );
  }, [sev, status, byAge, inRange, dates, direction]);

  const undatedHidden = useMemo(
    () => (isActive(dates) ? bugs.filter((b) => !daysOf(b, dates.field).length).length : 0),
    [bugs, dates],
  );

  const severitySummary = SEVERITIES.map((key) => ({
    severity: key,
    count: inRange.filter((b) => b.severity === key).length,
  })).filter((row) => row.count > 0);

  const statuses = ["all", ...BUG_STATUSES];

  return (
    <Shell
      title="Bugs"
      subtitle={`Defect register · ${rows.length} of ${bugs.length} shown · unremediated items block sign-off`}
      actions={
        <ExportMenu
          spec={{
            base: "defects",
            title: "Defect register",
            subtitle: `${rows.length} defect(s) · exported from the Tribal Tasks readiness dashboard`,
            columns,
            rows,
            extraSections: [
              {
                heading: "Severity summary",
                columns: [
                  {
                    key: "severity",
                    header: "Severity",
                    value: (r: { severity: string }) => r.severity,
                  },
                  { key: "count", header: "Defects", value: (r: { count: number }) => r.count },
                ],
                rows: severitySummary,
              },
            ],
          }}
        />
      }
    >
      <Toolbar>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...SEVERITIES] as const).map((s) => {
            const count =
              s === "all" ? inRange.length : inRange.filter((b) => b.severity === s).length;
            return (
              <button
                key={s}
                aria-pressed={sev === s}
                onClick={() => setSev(s)}
                className={`press inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold capitalize transition-colors duration-200 ${
                  sev === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}
                <span
                  className={`tabular-nums ${sev === s ? "opacity-80" : "text-muted-foreground/70"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="bug-status">
            Filter by status
          </label>
          <select
            id="bug-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 rounded-full border border-border bg-surface px-3.5 text-xs font-semibold"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : (STATUS_LABELS[s] ?? s)}
              </option>
            ))}
          </select>

          <DateRangeFilter
            filter={dates}
            onChange={setDates}
            direction={direction}
            onDirectionChange={setDirection}
            count={inRange.length}
            hiddenUndated={undatedHidden}
          />

          {!isActive(dates) && (
            <button
              onClick={() => setByAge((v) => !v)}
              className="press inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-xs font-semibold hover:border-primary/40"
            >
              <ArrowUpDown className="size-3.5" />
              {byAge ? "By age" : "By severity"}
            </button>
          )}

          <ItemDialog
            kind="bug"
            projects={projects}
            defaultProjectId={filingProject}
            workstreams={workstreams.map((w) => w.name)}
            assignees={developers.map((d) => d.name)}
            statuses={BUG_STATUSES}
            slaDays={slaDays}
            trigger={
              <button className="press inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
                <Plus className="size-3.5" />
                New defect
              </button>
            }
          />
        </div>
      </Toolbar>

      {isActive(dates) && undatedHidden > 0 && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          {undatedHidden} defect{undatedHidden === 1 ? "" : "s"} carry no date on this field and are
          hidden while the range is applied.
        </p>
      )}

      <Panel
        title={`${rows.length} defect${rows.length === 1 ? "" : "s"}`}
        subtitle={
          isActive(dates)
            ? "Ordered by the selected date"
            : byAge
              ? "Oldest first"
              : "Most severe first"
        }
        bodyClassName="-mx-1"
      >
        <div
          className="sticky-head max-h-[68vh] overflow-auto px-1"
          role="region"
          aria-label="Defect register"
          tabIndex={0}
        >
          <table className="w-full min-w-[1040px] border-separate border-spacing-y-2 text-sm">
            <caption className="sr-only">
              Defects by project, module, owner, severity, status, schedule and age
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  ID
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Defect
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Project
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Module
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Owner
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Severity
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                  Due
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                  Age
                </th>
                <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                  Move
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="pt-4">
                    <EmptyState
                      icon={SearchX}
                      title="No defects match these filters"
                      hint="Widen the severity, status or date range, or clear the filters to see the whole register."
                    />
                  </td>
                </tr>
              )}
              {rows.map((b, i) => (
                <tr
                  key={b.id}
                  id={b.id}
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  className="rise [&>td]:border-y [&>td]:border-border [&>td]:bg-surface-2 [&>td]:py-3 [&>td]:transition-colors [&>td]:duration-200 hover:[&>td]:bg-accent"
                >
                  <td className="rounded-l-2xl border-l px-3 font-mono text-xs font-semibold text-primary">
                    {b.id}
                  </td>
                  <td className="px-3 font-medium">
                    {b.title}
                    <span className="mt-1 block">
                      <Flags row={b} />
                    </span>
                  </td>
                  <td className="px-3 text-xs font-medium text-muted-foreground">
                    {projectName(b.projectId)}
                  </td>
                  <td className="px-3 text-muted-foreground">{b.module}</td>
                  <td className="px-3 text-muted-foreground">{b.assignee}</td>
                  <td className="px-3">
                    <Pill value={b.severity} />
                  </td>
                  <td className="px-3">
                    <Pill value={b.status} />
                  </td>
                  <td className="px-3 text-xs text-muted-foreground">
                    {b.dueDate ? formatDate(b.dueDate) : "—"}
                  </td>
                  <td className="px-3 text-right tabular-nums text-muted-foreground">
                    {b.age === null ? "—" : `${b.age}d`}
                  </td>
                  <td className="rounded-r-2xl border-r px-3 text-right">
                    <StatusMenu row={b} kind="bug" transitions={transitions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Shell>
  );
}
