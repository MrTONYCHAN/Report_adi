import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Check, Loader2, Pencil, RotateCcw, Users, X } from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { EmptyState, Panel } from "@/components/dashboard/bits";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { useDashboard, useResetTeamMember, useUpdateTeamMember } from "@/lib/data";
import type { Column } from "@/lib/export";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "Developers — ADIGRAMS 2.0 Readiness" },
      {
        name: "description",
        content: "Editable team roster with recorded remediation contributions.",
      },
      { property: "og:title", content: "Developers — ADIGRAMS 2.0 Readiness" },
      {
        property: "og:description",
        content: "Workload and ownership across the ADIGRAMS 2.0 engineering team.",
      },
    ],
  }),
  component: Developers,
});

type DeveloperRow = {
  name: string;
  role: string;
  workstream: string;
  openTasks: number;
  openBugs: number;
  resolved: number;
  load: number;
  edited: boolean;
};

const exportColumns: Column<DeveloperRow>[] = [
  { key: "name", header: "Name", value: (d) => d.name, width: 2200 },
  { key: "role", header: "Role", value: (d) => d.role, width: 1800 },
  { key: "workstream", header: "Workstream", value: (d) => d.workstream, width: 2600 },
  { key: "openTasks", header: "Updated", value: (d) => d.openTasks },
  { key: "openBugs", header: "Open", value: (d) => d.openBugs },
  { key: "resolved", header: "Resolved", value: (d) => d.resolved },
  { key: "load", header: "Share of updates", value: (d) => `${d.load}%` },
  { key: "edited", header: "Edited here", value: (d) => (d.edited ? "Yes" : "") },
];

const field =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-primary";

function Developers() {
  const { developers } = useDashboard();
  const radar = developers.map((d) => ({ name: d.initials, load: d.load, resolved: d.resolved }));

  const save = useUpdateTeamMember();
  const reset = useResetTeamMember();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", role: "", workstream: "" });
  const [error, setError] = useState<string | null>(null);

  function startEdit(row: (typeof developers)[number]) {
    setEditing(row.id);
    setDraft({ name: row.name, role: row.role, workstream: row.workstream });
    setError(null);
  }

  async function commit(id: string) {
    if (!draft.name.trim()) {
      setError("A member needs a name.");
      return;
    }
    try {
      await save.mutateAsync({
        id,
        name: draft.name.trim(),
        role: draft.role.trim(),
        workstream: draft.workstream.trim(),
      });
      setEditing(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
    }
  }

  const pending = save.isPending || reset.isPending;

  return (
    <Shell
      title="Developers"
      subtitle={`Roster · ${developers.length} active member${developers.length === 1 ? "" : "s"} · edit a row to correct a name`}
      actions={
        <ExportMenu
          spec={{
            base: "developers",
            title: "Engineering roster",
            subtitle: `${developers.length} active member(s) · exported from the ADIGRAMS 2.0 readiness dashboard`,
            columns: exportColumns,
            rows: developers,
          }}
        />
      }
    >
      <div className="grid items-start gap-4 xl:grid-cols-4">
        <Panel
          title="Share of recorded updates"
          subtitle="Each member's portion of the remediation log"
          className="xl:col-span-1"
          delay={0}
        >
          {radar.length === 0 ? (
            <EmptyState icon={Users} title="No roster to chart" />
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="name" fontSize={12} stroke="var(--muted-foreground)" />
                  <Radar
                    dataKey="load"
                    name="Updates %"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.25}
                    animationDuration={1100}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontSize: 12,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Team roster"
          subtitle="Names and areas can be corrected; the counts are recorded facts"
          className="xl:col-span-3"
          bodyClassName="-mx-1"
          delay={80}
        >
          {error && (
            <p role="alert" className="mx-1 mb-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div
            className="sticky-head overflow-x-auto px-1"
            role="region"
            aria-label="Team roster"
            tabIndex={0}
          >
            <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-sm">
              <caption className="sr-only">
                Team members with their role, workstream and recorded remediation contributions
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                    Member
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                    Role
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 font-semibold">
                    Workstream
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                    Updated
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                    Open
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                    Resolved
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                    Share
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-1 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {developers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="pt-4">
                      <EmptyState
                        icon={Users}
                        title="No active team members"
                        hint="The roster comes from the readiness report; nobody on it is marked active."
                      />
                    </td>
                  </tr>
                )}

                {developers.map((d, i) => {
                  const isEditing = editing === d.id;
                  return (
                    <tr
                      key={d.id}
                      id={d.id}
                      style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                      className="rise [&>td]:border-y [&>td]:border-border [&>td]:bg-surface-2 [&>td]:py-2.5 [&>td]:transition-colors [&>td]:duration-200"
                    >
                      <td className="rounded-l-2xl border-l px-3">
                        {isEditing ? (
                          <input
                            aria-label="Name"
                            className={field}
                            value={draft.name}
                            autoFocus
                            maxLength={120}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                        ) : (
                          <span className="flex items-center gap-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                              {d.initials}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{d.name}</span>
                              {d.edited && (
                                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Edited here
                                </span>
                              )}
                            </span>
                          </span>
                        )}
                      </td>

                      <td className="px-3 text-muted-foreground">
                        {isEditing ? (
                          <input
                            aria-label="Role"
                            className={field}
                            value={draft.role}
                            maxLength={120}
                            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                          />
                        ) : (
                          d.role
                        )}
                      </td>

                      <td className="px-3 text-muted-foreground">
                        {isEditing ? (
                          <input
                            aria-label="Workstream"
                            className={field}
                            value={draft.workstream}
                            maxLength={160}
                            onChange={(e) => setDraft({ ...draft, workstream: e.target.value })}
                          />
                        ) : (
                          d.workstream
                        )}
                      </td>

                      <td className="px-3 text-right tabular-nums">{d.openTasks}</td>
                      <td className="px-3 text-right tabular-nums">{d.openBugs}</td>
                      <td className="px-3 text-right tabular-nums">{d.resolved}</td>

                      <td className="px-3 text-right tabular-nums text-muted-foreground">
                        {d.load}%
                      </td>

                      <td className="rounded-r-2xl border-r px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => void commit(d.id)}
                                disabled={pending}
                                className="press inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                {save.isPending ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Check className="size-3.5" />
                                )}
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditing(null);
                                  setError(null);
                                }}
                                aria-label="Cancel editing"
                                title="Cancel"
                                className="press grid size-8 place-items-center rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground"
                              >
                                <X className="size-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              {d.edited && (
                                <button
                                  onClick={() =>
                                    void reset.mutateAsync(d.id).catch(() => undefined)
                                  }
                                  disabled={pending}
                                  aria-label="Reset to the value the report supplied"
                                  title="Reset to the report value"
                                  className="press grid size-8 place-items-center rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground disabled:opacity-60"
                                >
                                  <RotateCcw className="size-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => startEdit(d)}
                                className="press inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40"
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mx-1 mt-3 text-xs leading-relaxed text-muted-foreground">
            Edits are saved to the dashboard&apos;s own register — the readiness report file is
            never rewritten. Updated, Open, Resolved and Share are computed from the recorded
            remediation log and cannot be typed over.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}
