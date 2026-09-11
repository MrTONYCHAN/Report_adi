import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { EmptyState, Panel } from "@/components/dashboard/bits";
import { ExportMenu } from "@/components/dashboard/export-menu";
import {
  useCreateTeamMember,
  useDashboard,
  useDeleteTeamMember,
  useResetTeamMember,
  useUpdateTeamMember,
} from "@/lib/data";
import type { Column } from "@/lib/export";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "Developers - Tribal Tasks Readiness" },
      { name: "description", content: "Editable engineering roster and workload overview." },
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
];

const field =
  "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10";
const blank = { name: "", role: "Developer", workstream: "" };

function Developers() {
  const { developers } = useDashboard();
  const create = useCreateTeamMember();
  const save = useUpdateTeamMember();
  const reset = useResetTeamMember();
  const remove = useDeleteTeamMember();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || save.isPending || reset.isPending || remove.isPending;

  function startEdit(row: (typeof developers)[number]) {
    setAdding(false);
    setEditing(row.id);
    setDraft({ name: row.name, role: row.role, workstream: row.workstream });
    setError(null);
  }

  async function commit(id: string) {
    if (!draft.name.trim()) return setError("A developer needs a name.");
    try {
      await save.mutateAsync({
        id,
        name: draft.name.trim(),
        role: draft.role.trim(),
        workstream: draft.workstream.trim(),
      });
      setEditing(null);
      setDraft(blank);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
    }
  }

  async function addDeveloper() {
    if (!draft.name.trim()) return setError("Enter a name for the new developer.");
    try {
      await create.mutateAsync({
        name: draft.name.trim(),
        role: draft.role.trim() || "Developer",
        workstream: draft.workstream.trim() || "Unassigned",
      });
      setAdding(false);
      setDraft(blank);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The developer could not be added.");
    }
  }

  async function deleteDeveloper(row: (typeof developers)[number]) {
    if (!window.confirm(`Remove ${row.name} from the active roster?`)) return;
    try {
      await remove.mutateAsync(row.id);
      if (editing === row.id) setEditing(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The developer could not be removed.");
    }
  }

  return (
    <Shell
      title="Developers"
      subtitle={`${developers.length} active team members and their recorded workload`}
      actions={
        <ExportMenu
          spec={{
            base: "developers",
            title: "Engineering roster",
            subtitle: `${developers.length} active member(s) exported from the readiness dashboard`,
            columns: exportColumns,
            rows: developers,
          }}
        />
      }
    >
      <div>
        <Panel
          title="Team roster"
          subtitle="Manage names, roles and workstream ownership"
          delay={140}
          bodyClassName="-mx-1"
          action={
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setEditing(null);
                setDraft(blank);
                setError(null);
              }}
              className="press inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              <UserRoundPlus className="size-4" />
              Add developer
            </button>
          }
        >
          {error && (
            <p
              role="alert"
              className="mx-1 mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {adding && (
            <div className="mx-1 mb-3 grid gap-2 rounded-md border border-primary/35 bg-primary/5 p-3 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
              <input
                aria-label="New developer name"
                placeholder="Developer name"
                autoFocus
                className={field}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <input
                aria-label="New developer role"
                placeholder="Role"
                className={field}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
              <input
                aria-label="New developer workstream"
                placeholder="Workstream"
                className={field}
                value={draft.workstream}
                onChange={(e) => setDraft({ ...draft, workstream: e.target.value })}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void addDeveloper()}
                  disabled={pending}
                  className="press inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {create.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraft(blank);
                    setError(null);
                  }}
                  title="Cancel"
                  className="grid size-9 place-items-center rounded-md border border-border bg-surface text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          <div
            className="mx-1 overflow-x-auto rounded-md border border-border"
            role="region"
            aria-label="Team roster"
            tabIndex={0}
          >
            <table className="report-table w-full min-w-[860px] border-collapse bg-surface text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                  <th className="px-3 py-2.5">Member</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Workstream</th>
                  <th className="px-3 py-2.5 text-right">Updated</th>
                  <th className="px-3 py-2.5 text-right">Open</th>
                  <th className="px-3 py-2.5 text-right">Resolved</th>
                  <th className="px-3 py-2.5 text-right">Share</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {developers.map((developer) => {
                  const isEditing = editing === developer.id;
                  return (
                    <tr
                      key={developer.id}
                      id={developer.id}
                      className="border-t border-border hover:bg-surface-2"
                    >
                      <td className="px-3 py-2.5">
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
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                              {developer.initials}
                            </span>
                            <span>
                              <span className="block font-medium">{developer.name}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {developer.source === "dashboard"
                                  ? "Added here"
                                  : developer.edited
                                    ? "Edited here"
                                    : "Report roster"}
                              </span>
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {isEditing ? (
                          <input
                            aria-label="Role"
                            className={field}
                            value={draft.role}
                            maxLength={120}
                            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                          />
                        ) : (
                          developer.role
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {isEditing ? (
                          <input
                            aria-label="Workstream"
                            className={field}
                            value={draft.workstream}
                            maxLength={160}
                            onChange={(e) => setDraft({ ...draft, workstream: e.target.value })}
                          />
                        ) : (
                          developer.workstream
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{developer.openTasks}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{developer.openBugs}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{developer.resolved}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {developer.load}%
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void commit(developer.id)}
                                disabled={pending}
                                title="Save developer"
                                className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                              >
                                {save.isPending ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Check className="size-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(null);
                                  setError(null);
                                }}
                                title="Cancel"
                                className="grid size-8 place-items-center rounded-md border border-border bg-surface text-muted-foreground"
                              >
                                <X className="size-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(developer)}
                                title="Edit developer"
                                className="grid size-8 place-items-center rounded-md border border-border bg-surface text-muted-foreground hover:text-primary"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              {developer.source === "report" && developer.edited && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void reset
                                      .mutateAsync(developer.id)
                                      .catch(() =>
                                        setError("The report values could not be restored."),
                                      )
                                  }
                                  disabled={pending}
                                  title="Restore report values"
                                  className="grid size-8 place-items-center rounded-md border border-border bg-surface text-muted-foreground"
                                >
                                  <RotateCcw className="size-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void deleteDeveloper(developer)}
                                disabled={pending}
                                title="Remove developer"
                                className="grid size-8 place-items-center rounded-md border border-border bg-surface text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
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
            {developers.length === 0 && (
              <EmptyState
                icon={Users}
                title="No active developers"
                hint="Add a developer to start the roster."
                className="m-3"
              />
            )}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
