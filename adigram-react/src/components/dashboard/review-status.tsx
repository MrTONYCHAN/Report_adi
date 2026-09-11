import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SearchX } from "lucide-react";
import type { TestStatus } from "@/lib/data";

/* The register's live position, read straight from the rows beside it rather
   than from the saved report, so editing an outcome moves the chart before the
   workspace is saved. The shapes are structural on purpose: the page owns the
   row type, this card only needs an outcome and a grouping. */
export type ReviewRow = { status: TestStatus };
export type ReviewGroup = { id: string; name: string; rows: ReviewRow[] };

const ORDER: TestStatus[] = ["pass", "partial", "not-run", "fail"];
const LABELS: Record<TestStatus, string> = {
  pass: "Pass",
  partial: "Partial",
  "not-run": "Not run",
  fail: "Fail",
};
/* The outcome palette the rest of the register already uses — the meter on each
   project card, the outcome pills in the table. Status colours, so they carry a
   fixed meaning rather than a series identity. */
const COLORS: Record<TestStatus, string> = {
  pass: "var(--chart-2)",
  partial: "var(--chart-3)",
  "not-run": "var(--chart-neutral)",
  fail: "var(--chart-4)",
};

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  boxShadow: "0 12px 28px -16px rgb(15 23 42 / 0.35)",
  fontSize: 12,
};

export function tallyOf(rows: ReviewRow[]) {
  return {
    pass: rows.filter((row) => row.status === "pass").length,
    partial: rows.filter((row) => row.status === "partial").length,
    "not-run": rows.filter((row) => row.status === "not-run").length,
    fail: rows.filter((row) => row.status === "fail").length,
  } as Record<TestStatus, number>;
}

/** The stacked outcome bar, with the 2px surface gaps that separate segments
 *  without drawing a border around each one. */
function OutcomeBar({ rows, label }: { rows: ReviewRow[]; label: string }) {
  const tally = tallyOf(rows);
  const total = rows.length || 1;
  return (
    <div
      className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-secondary"
      role="img"
      aria-label={label}
    >
      {ORDER.filter((status) => tally[status] > 0).map((status) => (
        <span
          key={status}
          className="first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(tally[status] / total) * 100}%`, backgroundColor: COLORS[status] }}
        />
      ))}
    </div>
  );
}

export function ReviewStatus({
  scope,
  note,
  groups,
  className = "",
}: {
  /** What the numbers cover — a project name, or every project at once. */
  scope: string;
  note?: string;
  groups: ReviewGroup[];
  className?: string;
}) {
  const rows = groups.flatMap((group) => group.rows);
  const tally = tallyOf(rows);
  const total = rows.length;
  const share = (value: number) => (total ? Math.round((value / total) * 100) : 0);
  const slices = ORDER.map((status) => ({
    key: status,
    name: LABELS[status],
    value: tally[status],
  })).filter((slice) => slice.value > 0);

  return (
    <aside
      className={`card-ios flex flex-col p-4 sm:p-5 ${className}`}
      aria-label={`Review status for ${scope}`}
    >
      <header className="min-w-0">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Review status
        </h2>
        <p className="mt-1 text-sm font-semibold">{scope}</p>
        {note && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{note}</p>}
      </header>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <SearchX className="size-6 text-muted-foreground" />
          <p className="text-sm font-semibold">No test cases yet</p>
          <p className="text-xs text-muted-foreground">
            Add a workstream and its rows to see the outcome mix.
          </p>
        </div>
      ) : (
        <>
          {/* Part-to-whole at a glance; every exact value is direct-labelled in
              the legend below, so the reading never rests on colour alone. */}
          <div className="mt-4 h-[176px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={3}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  /* The card recomputes on every edit in the table beside it, so
                     an entry animation would replay the sweep on each keystroke
                     rather than reading as a one-time reveal. */
                  isAnimationActive={false}
                >
                  <Label
                    value={String(tally.fail)}
                    position="center"
                    dy={-8}
                    fill="var(--foreground)"
                    fontSize={26}
                    fontWeight={700}
                  />
                  <Label
                    value="FAILING NOW"
                    position="center"
                    dy={14}
                    fill="var(--muted-foreground)"
                    fontSize={9}
                    fontWeight={700}
                    letterSpacing={1}
                  />
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={COLORS[slice.key]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [
                    `${value} of ${total} (${share(value)}%)`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <dl className="mt-3 space-y-1.5">
            {ORDER.map((status) => (
              <div key={status} className="flex items-center gap-2.5 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[status] }}
                />
                <dt className="flex-1 text-muted-foreground">{LABELS[status]}</dt>
                <dd className="flex items-baseline gap-2">
                  <span className="font-semibold tabular-nums">{tally[status]}</span>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">
                    {share(tally[status])}%
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {groups.length > 0 && (
            <section className="mt-5 border-t border-border pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                By workstream
              </h3>
              <ul className="mt-3 space-y-3">
                {groups.map((group) => {
                  const fail = tallyOf(group.rows).fail;
                  return (
                    <li key={group.id}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium">{group.name}</span>
                        <span
                          className={`shrink-0 tabular-nums ${fail ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {fail}/{group.rows.length} fail
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <OutcomeBar
                          rows={group.rows}
                          label={`${group.name}: ${fail} of ${group.rows.length} failing`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
