import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, Bug, CheckCircle2, ListChecks, TrendingUp } from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { Bar, EmptyState, Panel, Pill, ProgressRing, StatCard } from "@/components/dashboard/bits";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { STATUS_LABELS, useDashboard } from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tribal Tasks — Go-Live Readiness Dashboard" },
      {
        name: "description",
        content:
          "Live readiness dashboard for Tribal Tasks: workstream health, test-case pass rates, open bugs, tasks and developer workload.",
      },
      { property: "og:title", content: "Tribal Tasks — Go-Live Readiness Dashboard" },
      {
        property: "og:description",
        content: "Workstream health, test coverage, bugs and developer workload in one view.",
      },
    ],
  }),
  component: Overview,
});

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  boxShadow: "0 12px 28px -16px rgb(15 23 42 / 0.35)",
  fontSize: 12,
};

function Overview() {
  const { totals, workstreams, tasks, bugs, readinessTrend, severityMix } = useDashboard();
  const readiness = totals.testCases ? Math.round((totals.passed / totals.testCases) * 100) : 0;

  /* The overview export is the one people hand to a steering meeting, so it is a
     pack: the headline numbers, the workstream table, then whatever is still open. */
  const summaryRows = [
    { metric: "Test cases", value: totals.testCases },
    { metric: "Passed", value: totals.passed },
    { metric: "Failing", value: totals.failed },
    { metric: "Open defects", value: totals.openBugs },
    { metric: "Open tasks", value: totals.openTasks },
    { metric: "Scheduled ahead", value: totals.scheduled },
    { metric: "Past due", value: totals.breached },
    { metric: "Readiness", value: `${readiness}%` },
  ];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const openBugs = bugs.filter(
    (b) => !["fixed", "verified", "closed", "wont-fix"].includes(b.status),
  );

  return (
    <Shell
      title="Go-Live Readiness"
      subtitle="Readiness report · recorded assessment outcomes"
      actions={
        <ExportMenu
          label="Status pack"
          spec={{
            base: "readiness-pack",
            title: "Tribal Tasks go-live readiness",
            subtitle: `${readiness}% of ${totals.testCases} assessed cases passed · ${totals.openBugs} defects open`,
            columns: [
              {
                key: "metric",
                header: "Metric",
                value: (r: { metric: string }) => r.metric,
                width: 3000,
              },
              {
                key: "value",
                header: "Value",
                value: (r: { value: string | number }) => r.value,
                width: 2000,
              },
            ],
            rows: summaryRows,
            extraSections: [
              {
                heading: "Workstream outcomes",
                columns: [
                  {
                    key: "name",
                    header: "Workstream",
                    value: (w: { name: string }) => w.name,
                    width: 2600,
                  },
                  {
                    key: "owner",
                    header: "Owner",
                    value: (w: { owner: string }) => w.owner,
                    width: 1800,
                  },
                  { key: "pass", header: "Pass", value: (w: { pass: number }) => w.pass },
                  {
                    key: "partial",
                    header: "Partial",
                    value: (w: { partial: number }) => w.partial,
                  },
                  { key: "notRun", header: "Not run", value: (w: { notRun: number }) => w.notRun },
                  { key: "fail", header: "Fail", value: (w: { fail: number }) => w.fail },
                ],
                rows: workstreams,
              },
              {
                heading: `Open remediation tasks (${openTasks.length})`,
                columns: [
                  { key: "id", header: "ID", value: (t: { id: string }) => t.id, width: 1100 },
                  {
                    key: "title",
                    header: "Task",
                    value: (t: { title: string }) => t.title,
                    width: 3600,
                  },
                  {
                    key: "status",
                    header: "Status",
                    value: (t: { status: string }) => STATUS_LABELS[t.status] ?? t.status,
                  },
                  {
                    key: "severity",
                    header: "Severity",
                    value: (t: { severity: string }) => t.severity,
                  },
                  {
                    key: "due",
                    header: "Due",
                    value: (t: { dueDate: string | null }) => t.dueDate ?? "",
                  },
                ],
                rows: openTasks,
              },
              {
                heading: `Open defects (${openBugs.length})`,
                columns: [
                  { key: "id", header: "ID", value: (b: { id: string }) => b.id, width: 1100 },
                  {
                    key: "title",
                    header: "Defect",
                    value: (b: { title: string }) => b.title,
                    width: 3600,
                  },
                  {
                    key: "module",
                    header: "Module",
                    value: (b: { module: string }) => b.module,
                    width: 1800,
                  },
                  {
                    key: "severity",
                    header: "Severity",
                    value: (b: { severity: string }) => b.severity,
                  },
                  {
                    key: "status",
                    header: "Status",
                    value: (b: { status: string }) => STATUS_LABELS[b.status] ?? b.status,
                  },
                ],
                rows: openBugs,
              },
            ],
          }}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Test cases"
          value={totals.testCases}
          icon={ListChecks}
          hint={`${workstreams.length} workstreams`}
          delay={0}
        />
        <StatCard
          label="Passed"
          value={totals.passed}
          icon={CheckCircle2}
          tone="success"
          hint={`${readiness}% of assessed cases`}
          delay={60}
        />
        <StatCard
          label="Failing"
          value={totals.failed}
          icon={AlertTriangle}
          tone="warning"
          hint={`${totals.openTasks} remediation tasks open`}
          delay={120}
        />
        <StatCard
          label="Open bugs"
          value={totals.openBugs}
          icon={Bug}
          tone="danger"
          hint={totals.breached > 0 ? `${totals.breached} past due` : "None past due"}
          delay={180}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Workstream results"
          subtitle="Case verdicts stacked per workstream"
          className="xl:col-span-2"
          delay={220}
        >
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={workstreams}
                margin={{ left: -18, right: 8, top: 8 }}
                barCategoryGap="28%"
              >
                <defs>
                  <linearGradient id="barPass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.72} />
                  </linearGradient>
                  <linearGradient id="barPartial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.72} />
                  </linearGradient>
                  <linearGradient id="barFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.72} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="id"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--secondary)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <RBar
                  dataKey="pass"
                  name="Pass"
                  stackId="a"
                  fill="url(#barPass)"
                  radius={[0, 0, 5, 5]}
                  maxBarSize={72}
                  animationDuration={900}
                />
                <RBar
                  dataKey="partial"
                  name="Partial"
                  stackId="a"
                  fill="url(#barPartial)"
                  maxBarSize={72}
                  animationDuration={1000}
                />
                <RBar
                  dataKey="notRun"
                  name="Not run"
                  stackId="a"
                  fill="var(--chart-neutral)"
                  maxBarSize={72}
                  animationDuration={1100}
                />
                <RBar
                  dataKey="fail"
                  name="Fail"
                  stackId="a"
                  fill="url(#barFail)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={72}
                  animationDuration={1200}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Assessment pass rate"
          subtitle="Per workstream, from recorded verdicts"
          delay={260}
        >
          <div className="flex flex-col items-center gap-5">
            <ProgressRing value={readiness} />
            <div className="w-full space-y-3">
              {workstreams.map((w) => {
                const total = w.pass + w.partial + w.notRun + w.fail;
                const pct = total ? Math.round((w.pass / total) * 100) : 0;
                return (
                  <div key={w.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold">{w.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                    <Bar
                      value={pct}
                      tone={w.fail > 4 ? "danger" : w.fail > 2 ? "warning" : "success"}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>

      {/* The trend only earns a row when there is a series to draw. With a single
          recorded assessment it would otherwise be a full-width empty box. */}
      {readinessTrend.length > 0 && (
        <Panel
          title="Readiness trend"
          subtitle="Pass rate and coverage over time"
          className="mt-4"
          delay={280}
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={readinessTrend} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gPass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCov" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="coverage"
                  name="Coverage %"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#gCov)"
                  animationDuration={1100}
                />
                <Area
                  type="monotone"
                  dataKey="pass"
                  name="Pass %"
                  stroke="var(--chart-2)"
                  strokeWidth={2.5}
                  fill="url(#gPass)"
                  animationDuration={1400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* The Tasks section is commented out of the app. Restoring it means
            uncommenting this panel and dropping the col-span-3 added to the
            severity panel below, which widened to fill the row it vacated. */}
        {/*
        <Panel
          title="Open remediation"
          subtitle={`${openTasks.length} task${openTasks.length === 1 ? "" : "s"} still to close`}
          className="xl:col-span-2"
          delay={300}
          action={
            <Link
              to="/tasks"
              className="press inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40"
            >
              Open board
              <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {openTasks.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing outstanding"
              hint="Every remediation task on the board has been closed."
            />
          ) : (
            <ul className="space-y-2">
              {openTasks.slice(0, 7).map((t) => (
                <li
                  key={t.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-surface-2 px-3.5 py-2.5 transition-colors duration-200 hover:border-primary/30 ${
                    t.breached ? "border-destructive/40" : "border-border"
                  }`}
                >
                  <span className="w-14 shrink-0 font-mono text-xs font-semibold text-primary">
                    {t.id}
                  </span>
                  <span className="min-w-[180px] flex-1 text-sm font-medium">{t.title}</span>
                  <Pill value={t.status} />
                  {t.progress !== null && (
                    <div className="w-20 shrink-0">
                      <Bar value={t.progress} tone={t.progress === 100 ? "success" : "primary"} />
                    </div>
                  )}
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {t.dueDate ? t.due : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        */}

        <Panel
          title="Defect severity mix"
          subtitle={`${bugs.length} defects on the register`}
          className="xl:col-span-3"
          delay={340}
        >
          {severityMix.length === 0 ? (
            <EmptyState icon={Bug} title="No defects recorded" />
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                    stroke="var(--surface)"
                    strokeWidth={3}
                    animationDuration={1000}
                  >
                    <Label
                      value={`${bugs.length} defects`}
                      position="center"
                      fill="var(--foreground)"
                      fontSize={13}
                      fontWeight={700}
                    />
                    {severityMix.map((s) => (
                      <Cell
                        key={s.key}
                        fill={`var(--chart-${{ critical: 4, high: 3, medium: 1, low: 5, unassessed: 1 }[s.key]})`}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
