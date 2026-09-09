import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { Bar, Pill, Toolbar } from "@/components/dashboard/bits";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { ItemDialog } from "@/components/dashboard/item-dialog";
import { Flags, StatusMenu } from "@/components/dashboard/card-controls";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  formatDate,
  useDashboard,
  type Task,
  type TaskStatus,
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

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — ADIGRAMS 2.0 Readiness" },
      {
        name: "description",
        content:
          "Remediation tasks by workstream, owner, severity, schedule and completion progress ahead of go-live.",
      },
      { property: "og:title", content: "Tasks — ADIGRAMS 2.0 Readiness" },
      {
        property: "og:description",
        content: "Track remediation work items, planned dates and their progress to sign-off.",
      },
    ],
  }),
  component: Tasks,
});

const columns: { key: TaskStatus; label: string }[] = TASK_STATUSES.map((key) => ({
  key,
  label: STATUS_LABELS[key] ?? key,
}));

/* A colour per column so the board reads at a glance while scrolling sideways. */
const columnDot: Record<TaskStatus, string> = {
  scheduled: "bg-info",
  todo: "bg-muted-foreground",
  "in-progress": "bg-primary",
  review: "bg-warning",
  blocked: "bg-destructive",
  done: "bg-success",
};

const exportColumns: Column<Task>[] = [
  { key: "id", header: "ID", value: (t) => t.id, width: 1100 },
  { key: "title", header: "Task", value: (t) => t.title, width: 3000 },
  { key: "workstream", header: "Workstream", value: (t) => t.workstream, width: 1600 },
  { key: "assignee", header: "Assignee", value: (t) => t.assignee, width: 1400 },
  { key: "status", header: "Status", value: (t) => STATUS_LABELS[t.status] ?? t.status },
  { key: "severity", header: "Severity", value: (t) => t.severity },
  {
    key: "progress",
    header: "Progress",
    value: (t) => (t.progress === null ? "" : `${t.progress}%`),
  },
  { key: "startDate", header: "Start", value: (t) => t.startDate ?? "" },
  { key: "dueDate", header: "Due", value: (t) => t.dueDate ?? "" },
  { key: "updatedAt", header: "Last updated", value: (t) => formatDate(t.updatedAt) },
  {
    key: "flags",
    header: "Flags",
    value: (t) => [t.breached && "Overdue", t.escalated && "Escalated"].filter(Boolean).join(", "),
  },
  {
    key: "origin",
    header: "Source",
    value: (t) => (t.origin === "report" ? "Report" : "Dashboard"),
  },
];

function Tasks() {
  const { tasks, workstreams, developers, transitions, slaDays } = useDashboard();
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [dates, setDates] = useState<DateFilter>(NO_DATE_FILTER);
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const dated = useMemo(
    () => tasks.filter((t) => matchesRange(t, dates)).sort(bySortKey(dates.field, direction)),
    [tasks, dates, direction],
  );
  const visible = useMemo(
    () => (filter === "all" ? dated : dated.filter((t) => t.status === filter)),
    [filter, dated],
  );
  const undatedHidden = useMemo(
    () => (isActive(dates) ? tasks.filter((t) => !daysOf(t, dates.field).length).length : 0),
    [tasks, dates],
  );

  const statusSummary = columns.map((c) => ({
    status: c.label,
    count: dated.filter((t) => t.status === c.key).length,
  }));

  return (
    <Shell
      title="Tasks"
      subtitle={`Remediation board · ${visible.length} of ${tasks.length} items across ${workstreams.length} workstreams`}
      actions={
        <ExportMenu
          spec={{
            base: "tasks",
            title: "Remediation tasks",
            subtitle: `${visible.length} task(s) · exported from the ADIGRAMS 2.0 readiness dashboard`,
            columns: exportColumns,
            rows: visible,
            extraSections: [
              {
                heading: "Board summary",
                columns: [
                  { key: "status", header: "Column", value: (r: { status: string }) => r.status },
                  { key: "count", header: "Tasks", value: (r: { count: number }) => r.count },
                ],
                rows: statusSummary,
              },
            ],
          }}
        />
      }
    >
      <Toolbar>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...columns.map((c) => c.key)] as const).map((k) => {
            const count = k === "all" ? dated.length : dated.filter((t) => t.status === k).length;
            return (
              <button
                key={k}
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
                className={`press inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors duration-200 ${
                  filter === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40"
                }`}
              >
                {k === "all" ? "All" : (STATUS_LABELS[k] ?? k)}
                <span
                  className={`tabular-nums ${filter === k ? "opacity-80" : "text-muted-foreground/70"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DateRangeFilter
            filter={dates}
            onChange={setDates}
            direction={direction}
            onDirectionChange={setDirection}
            count={dated.length}
            hiddenUndated={undatedHidden}
          />
          <ItemDialog
            kind="task"
            workstreams={workstreams.map((w) => w.name)}
            assignees={developers.map((d) => d.name)}
            statuses={TASK_STATUSES}
            slaDays={slaDays}
            trigger={
              <button className="press inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
                <Plus className="size-3.5" />
                New task
              </button>
            }
          />
        </div>
      </Toolbar>

      {isActive(dates) && undatedHidden > 0 && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          {undatedHidden} task{undatedHidden === 1 ? "" : "s"} carry no date on this field and are
          hidden while the range is applied.
        </p>
      )}

      {/* A kanban that scrolls sideways rather than wrapping into a second row of
          panels: every column stays the same width and the reading order matches
          the workflow, which a 3-across grid of six statuses does not. */}
      <div
        className="kanban -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3"
        role="region"
        aria-label="Task board"
        tabIndex={0}
      >
        {columns.map((col, ci) => {
          const items = visible.filter((t) => t.status === col.key);
          return (
            <section
              key={col.key}
              style={{ animationDelay: `${ci * 55}ms` }}
              className="rise flex w-[290px] shrink-0 snap-start flex-col rounded-2xl border border-border bg-surface p-3 sm:w-[310px]"
            >
              <header className="mb-3 flex items-center justify-between gap-2 px-1">
                <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
                  <span className={`size-2 rounded-full ${columnDot[col.key]}`} />
                  {col.label}
                </h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </header>

              {/* Each column scrolls on its own so the longest one does not drag
                  the whole page to several thousand pixels, and the headers of
                  the other columns stay in view while you read one. */}
              <div className="kanban max-h-[calc(100vh-15rem)] min-h-[140px] space-y-2.5 overflow-y-auto pr-1">
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border py-9 text-center text-xs text-muted-foreground">
                    Nothing here
                  </p>
                )}
                {items.map((t, i) => {
                  /* "Unassigned" and "No due date" are the default on every row
                     the report supplied, so repeating them on forty cards says
                     nothing. Only facts that differ from the default appear. */
                  const meta = [
                    t.assignee !== "Unassigned" ? t.assignee : null,
                    t.status === "scheduled" && t.startDate
                      ? `Starts ${formatDate(t.startDate)}`
                      : t.dueDate
                        ? `Due ${formatDate(t.dueDate)}`
                        : null,
                    t.origin === "dashboard" ? "Added here" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <article
                      key={t.id}
                      id={t.id}
                      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                      className={`rise group rounded-xl border bg-surface-2 p-3 transition-colors duration-200 hover:border-primary/40 ${
                        t.breached ? "border-destructive/45" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-primary">
                          {t.id}
                        </span>
                        <Pill value={t.severity} />
                      </div>

                      <p className="mt-2 text-sm font-medium leading-snug">{t.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{t.workstream}</p>

                      {(t.breached || t.escalated) && (
                        <div className="mt-2">
                          <Flags row={t} />
                        </div>
                      )}

                      {t.progress !== null && (
                        <div className="mt-2.5">
                          <Bar
                            value={t.progress}
                            tone={t.progress === 100 ? "success" : "primary"}
                          />
                        </div>
                      )}

                      <div
                        className={`mt-3 flex items-center gap-2 ${meta ? "justify-between border-t border-border pt-2.5" : "justify-end"}`}
                      >
                        {meta && (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {meta}
                          </span>
                        )}
                        <StatusMenu row={t} kind="task" transitions={transitions} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
