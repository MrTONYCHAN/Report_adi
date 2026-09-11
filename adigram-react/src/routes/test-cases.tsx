import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  FolderKanban,
  Plus,
  RotateCcw,
  Save,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import { Shell } from "@/components/dashboard/shell";
import { EmptyState, Toolbar } from "@/components/dashboard/bits";
import { ExportMenu } from "@/components/dashboard/export-menu";
import {
  BUG_STATUSES,
  STATUS_LABELS,
  useDashboard,
  useSaveTestCaseWorkspace,
  type BugStatus,
  type TestCaseWorkspace,
  type TestStatus,
} from "@/lib/data";
import { ALL_PROJECTS, useProject } from "@/lib/project";
import type { Column } from "@/lib/export";

type TestRow = {
  id: string;
  name: string;
  status: TestStatus;
  defectStatus: BugStatus;
  owner: string;
  updated: string;
};
type TestGroup = { id: string; name: string; date: string; rows: TestRow[] };
type TestProject = { id: string; name: string; date: string; groups: TestGroup[] };
type ExportRow = TestRow & { project: string; workstream: string };

const OUTCOMES: TestStatus[] = ["pass", "partial", "not-run", "fail"];
const OUTCOME_LABELS: Record<TestStatus, string> = {
  pass: "Pass",
  partial: "Partial",
  "not-run": "Not Run",
  fail: "Fail",
};
const exportColumns: Column<ExportRow>[] = [
  { key: "id", header: "ID", value: (row) => row.id, width: 1100 },
  { key: "name", header: "Test case", value: (row) => row.name, width: 3600 },
  { key: "project", header: "Project", value: (row) => row.project, width: 1500 },
  { key: "workstream", header: "Workstream", value: (row) => row.workstream, width: 1800 },
  { key: "status", header: "Outcome", value: (row) => row.status, width: 1200 },
  { key: "defectStatus", header: "Defect Status", value: (row) => row.defectStatus, width: 1400 },
  { key: "owner", header: "Owner", value: (row) => row.owner, width: 1500 },
  { key: "updated", header: "Last updated", value: (row) => row.updated, width: 1600 },
];

export const Route = createFileRoute("/test-cases")({
  head: () => ({
    meta: [
      { title: "Test Cases - ADIGRAMS 2.0 Readiness" },
      { name: "description", content: "Editable test-case register grouped by workstream." },
    ],
  }),
  component: TestCases,
});

function outcomeColor(status: TestStatus) {
  if (status === "pass") return "var(--chart-2)";
  if (status === "partial") return "var(--chart-3)";
  if (status === "fail") return "var(--chart-4)";
  return "var(--chart-neutral)";
}

function outcomeSelectClass(status: TestStatus) {
  if (status === "pass") return "border-success/70 bg-success/10 text-success";
  if (status === "partial") return "border-warning/75 bg-warning/10 text-warning";
  if (status === "fail") return "border-destructive/75 bg-destructive/10 text-destructive";
  return "border-yellow-500/75 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
}

function defectSelectClass(status: BugStatus) {
  if (["fixed", "closed"].includes(status)) return "border-success/70 bg-success/10 text-success";
  if (status === "verified")
    return "border-blue-500/70 bg-blue-500/10 text-blue-600 dark:text-blue-400";
  if (status === "in-progress") return "border-warning/75 bg-warning/10 text-warning";
  if (status === "blocked") return "border-destructive/75 bg-destructive/10 text-destructive";
  if (status === "wont-fix")
    return "border-violet-500/70 bg-violet-500/10 text-violet-600 dark:text-violet-400";
  return "border-border bg-surface-2 text-muted-foreground";
}

function counts(rows: TestRow[]) {
  return {
    pass: rows.filter((row) => row.status === "pass").length,
    partial: rows.filter((row) => row.status === "partial").length,
    notRun: rows.filter((row) => row.status === "not-run").length,
    fail: rows.filter((row) => row.status === "fail").length,
  };
}

function ProgressMeter({ rows }: { rows: TestRow[] }) {
  const tally = counts(rows);
  const total = rows.length || 1;
  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full bg-secondary"
      role="img"
      aria-label={`${tally.pass} pass, ${tally.partial} partial, ${tally.notRun} not run, ${tally.fail} fail`}
    >
      {OUTCOMES.map((status) => {
        const value = status === "not-run" ? tally.notRun : tally[status];
        return (
          <span
            key={status}
            style={{ width: `${(value / total) * 100}%`, backgroundColor: outcomeColor(status) }}
          />
        );
      })}
    </div>
  );
}

function nextGroupId(groups: TestGroup[]) {
  let number = groups.length + 1;
  while (groups.some((group) => group.id === `D${number}`)) number += 1;
  return `D${number}`;
}

function nextProjectId(projects: TestProject[]) {
  let number = projects.length + 1;
  while (projects.some((project) => project.id === `PROJECT-${number}`)) number += 1;
  return `PROJECT-${number}`;
}

function nextRowId(group: TestGroup) {
  let number = group.rows.length + 1;
  while (group.rows.some((row) => row.id === `${group.id}-${String(number).padStart(2, "0")}`))
    number += 1;
  return `${group.id}-${String(number).padStart(2, "0")}`;
}

function TestCases() {
  const dashboard = useDashboard();
  const { setProjectId } = useProject();
  const scopedProjectId = dashboard.activeProjectId;
  const saveWorkspace = useSaveTestCaseWorkspace();
  const initialProjects = useMemo<TestProject[]>(
    () =>
      dashboard.testCaseProjects.map((project) => ({
        id: project.id,
        name: project.name,
        date: project.date || "",
        groups: project.groups.map((group) => ({
          id: group.id,
          name: group.name,
          date: group.date || "",
          rows: group.rows.map((row) => ({ ...row, updated: row.updated || "" })),
        })),
      })),
    [dashboard.testCaseProjects],
  );
  const [projects, setProjects] = useState<TestProject[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState(() =>
    scopedProjectId === ALL_PROJECTS ? "" : scopedProjectId,
  );
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (dirty) return;
    setProjects(initialProjects);
    setActiveProjectId((current) =>
      !current || initialProjects.some((project) => project.id === current) ? current : "",
    );
  }, [dirty, initialProjects]);

  /* The header switcher is the one place the project is chosen, so opening this
     page — or changing the scope from anywhere else — lands on that project. */
  useEffect(() => {
    setActiveProjectId(scopedProjectId === ALL_PROJECTS ? "" : scopedProjectId);
    setActiveId("");
  }, [scopedProjectId]);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const groups = activeProject?.groups || [];
  const activeGroup = groups.find((group) => group.id === activeId);
  const visibleRows = useMemo(() => {
    if (!activeGroup) return [];
    const search = query.trim().toLowerCase();
    return search
      ? activeGroup.rows.filter((row) =>
          `${row.id} ${row.name} ${row.owner} ${row.status} ${row.defectStatus}`
            .toLowerCase()
            .includes(search),
        )
      : activeGroup.rows;
  }, [activeGroup, query]);
  const exportRows = projects.flatMap((project) =>
    project.groups.flatMap((group) =>
      group.rows.map((row) => ({ ...row, project: project.name, workstream: group.name })),
    ),
  );

  function changeProjects(update: (current: TestProject[]) => TestProject[]) {
    setProjects(update);
    setDirty(true);
    setMessage("");
  }
  function changeGroups(update: (current: TestGroup[]) => TestGroup[]) {
    if (!activeProject) return;
    changeProjects((current) =>
      current.map((project) =>
        project.id === activeProject.id ? { ...project, groups: update(project.groups) } : project,
      ),
    );
  }
  function updateProject(projectId: string, patch: Partial<Omit<TestProject, "groups">>) {
    changeProjects((current) =>
      current.map((project) => (project.id === projectId ? { ...project, ...patch } : project)),
    );
  }
  function addProject() {
    const id = nextProjectId(projects);
    changeProjects((current) => [
      ...current,
      { id, name: "New project", date: new Date().toISOString().slice(0, 10), groups: [] },
    ]);
    setActiveProjectId(id);
    setActiveId("");
  }
  function removeProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    const total = project?.groups.reduce((sum, group) => sum + group.rows.length, 0) || 0;
    if (!project || !window.confirm(`Remove ${project.name} and all ${total} test cases?`)) return;
    changeProjects((current) => current.filter((item) => item.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId("");
      setActiveId("");
    }
  }
  function updateGroup(groupId: string, patch: Partial<Omit<TestGroup, "rows">>) {
    changeGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  }
  function updateRow(groupId: string, rowId: string, patch: Partial<TestRow>) {
    changeGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rows: group.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : group,
      ),
    );
  }
  function addGroup() {
    const id = nextGroupId(projects.flatMap((project) => project.groups));
    changeGroups((current) => [
      ...current,
      { id, name: "New workstream", date: new Date().toISOString().slice(0, 10), rows: [] },
    ]);
    setActiveId(id);
  }
  function duplicateGroup(group: TestGroup) {
    const id = nextGroupId(projects.flatMap((project) => project.groups));
    const rows = group.rows.map((row, index) => ({
      ...row,
      id: `${id}-${String(index + 1).padStart(2, "0")}`,
    }));
    changeGroups((current) => [...current, { ...group, id, name: `${group.name} copy`, rows }]);
    setActiveId(id);
  }
  function removeGroup(groupId: string) {
    const group = groups.find((item) => item.id === groupId);
    if (!group || !window.confirm(`Remove ${group.name} and all ${group.rows.length} test cases?`))
      return;
    changeGroups((current) => current.filter((item) => item.id !== groupId));
    if (activeId === groupId) setActiveId("");
  }
  function addRow() {
    if (!activeGroup) return;
    const id = nextRowId(activeGroup);
    changeGroups((current) =>
      current.map((group) =>
        group.id === activeGroup.id
          ? {
              ...group,
              rows: [
                ...group.rows,
                {
                  id,
                  name: "New test case",
                  status: "not-run",
                  defectStatus: "untracked",
                  owner: "",
                  updated: new Date().toISOString().slice(0, 10),
                },
              ],
            }
          : group,
      ),
    );
  }
  function removeRow(rowId: string) {
    if (!activeGroup) return;
    changeGroups((current) =>
      current.map((group) =>
        group.id === activeGroup.id
          ? { ...group, rows: group.rows.filter((row) => row.id !== rowId) }
          : group,
      ),
    );
  }
  function resetChanges() {
    setProjects(initialProjects);
    setActiveProjectId("");
    setActiveId("");
    setDirty(false);
    setMessage("Changes reset");
  }
  async function saveAll() {
    const duplicate = exportRows.find(
      (row, index) => exportRows.findIndex((candidate) => candidate.id === row.id) !== index,
    );
    if (duplicate) {
      setMessage(`Test case ID ${duplicate.id} is used more than once`);
      return;
    }
    const payload: TestCaseWorkspace = {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        date: project.date || null,
        groups: project.groups.map((group) => ({
          id: group.id,
          name: group.name,
          date: group.date || null,
          rows: group.rows.map((row) => ({ ...row, updated: row.updated || null })),
        })),
      })),
    };
    try {
      await saveWorkspace.mutateAsync(payload);
      setDirty(false);
      setMessage("All test-case changes saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The changes could not be saved");
    }
  }

  return (
    <Shell
      title="Test Cases"
      subtitle="Outcome register: pass, partial, not run and fail"
      actions={
        <ExportMenu
          spec={{
            base: "test-cases",
            title: "Test-case register",
            subtitle: `${exportRows.length} case(s) exported from the ADIGRAMS 2.0 readiness dashboard`,
            columns: exportColumns,
            rows: exportRows,
          }}
        />
      }
    >
      <Toolbar className="mb-3 rounded-md px-2.5 py-2">
        <span className="text-xs text-muted-foreground">
          {projects.length} {projects.length === 1 ? "project" : "projects"} - {exportRows.length} total
          tasks
        </span>
        {dirty && <span className="text-xs font-semibold text-warning">Unsaved changes</span>}
        {message && (
          <span
            role="status"
            className={`text-xs font-medium ${message.includes("saved") ? "text-success" : "text-muted-foreground"}`}
          >
            {message}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={addProject}
            className="press inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:border-primary/50"
          >
            <Plus className="size-4" />
            Add project
          </button>
          <button
            type="button"
            onClick={resetChanges}
            disabled={!dirty || saveWorkspace.isPending}
            title="Discard unsaved changes"
            className="press grid size-9 place-items-center rounded-md border border-border bg-surface text-muted-foreground disabled:opacity-40"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={!dirty || saveWorkspace.isPending}
            className="press inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saveWorkspace.isPending ? (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />
            ) : message.includes("saved") && !dirty ? (
              <Check className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {saveWorkspace.isPending ? "Saving..." : "Save all"}
          </button>
        </div>
      </Toolbar>

      <div className="grid gap-2.5">
        {projects.map((project) => {
          const rows = project.groups.flatMap((group) => group.rows);
          const tally = counts(rows);
          const total = rows.length;
          const progress = total ? Math.round((tally.pass / total) * 100) : 0;
          const active = project.id === activeProjectId;
          return (
            <section
              key={project.id}
              className={`relative rounded-md border bg-surface px-4 py-3.5 transition-colors ${active ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/40"}`}
            >
              <button
                type="button"
                className="absolute inset-0 z-0"
                aria-label={`${active ? "Close" : "Open"} ${project.name}`}
                aria-expanded={active}
                onClick={() => {
                  setQuery("");
                  setActiveId("");
                  const next = activeProjectId === project.id ? "" : project.id;
                  setActiveProjectId(next);
                  /* Keep the rest of the dashboard on whatever is open here. */
                  setProjectId(next || ALL_PROJECTS);
                }}
              />
              <div className="pointer-events-none relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <FolderKanban className="size-5" />
                  </span>
                  <div className="pointer-events-auto min-w-0">
                    <input
                      aria-label={`${project.id} project name`}
                      value={project.name}
                      onFocus={() => setActiveProjectId(project.id)}
                      onChange={(event) => updateProject(project.id, { name: event.target.value })}
                      className="w-full bg-transparent text-base font-bold outline-none focus:text-primary"
                    />
                    <label className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      <input
                        type="date"
                        aria-label={`${project.name} date`}
                        value={project.date}
                        onFocus={() => setActiveProjectId(project.id)}
                        onChange={(event) => updateProject(project.id, { date: event.target.value })}
                        className="bg-transparent outline-none focus:text-foreground"
                      />
                    </label>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4 lg:min-w-[520px]">
                  <div><dt className="text-muted-foreground">Workstreams</dt><dd className="mt-0.5 font-semibold tabular-nums">{project.groups.length}</dd></div>
                  <div><dt className="text-muted-foreground">Total tasks</dt><dd className="mt-0.5 font-semibold tabular-nums">{total}</dd></div>
                  <div><dt className="text-muted-foreground">Completed</dt><dd className="mt-0.5 font-semibold tabular-nums text-success">{tally.pass}</dd></div>
                  <div><dt className="text-muted-foreground">Needs attention</dt><dd className="mt-0.5 font-semibold tabular-nums text-warning">{tally.partial + tally.fail}</dd></div>
                </dl>
                <div className="flex items-center gap-2 lg:w-24 lg:justify-end">
                  <span className="text-sm font-bold tabular-nums">{progress}%</span>
                  <ChevronDown className={`size-5 text-muted-foreground transition-transform ${active ? "rotate-180" : ""}`} />
                  <button
                    type="button"
                    title="Remove project"
                    onClick={() => removeProject(project.id)}
                    className="pointer-events-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="pointer-events-none relative z-10 mt-3">
                <ProgressMeter rows={rows} />
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {tally.pass} pass - {tally.partial} partial - {tally.notRun} not run - {tally.fail} fail
                </p>
              </div>
            </section>
          );
        })}
      </div>

      {activeProject && (
        <div className="mt-3">
          <Toolbar className="mb-3 rounded-md px-2.5 py-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search test cases"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={!activeGroup}
                placeholder={
                  activeGroup ? "Search selected table..." : "Select a workstream to search"
                }
                className="h-9 w-full rounded-md border border-border bg-surface py-1.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {groups.reduce((sum, group) => sum + group.rows.length, 0)} test cases in {groups.length} workstreams
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={addGroup}
                className="press inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:border-primary/50"
              >
                <Plus className="size-4" />
                Add workstream
              </button>
            </div>
          </Toolbar>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {groups.map((group) => {
              const tally = counts(group.rows);
              const active = group.id === activeGroup?.id;
              return (
                <section
                  key={group.id}
                  className={`relative rounded-md border bg-surface px-3.5 py-3 transition-colors ${active ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/40"}`}
                >
                  <button
                    type="button"
                    aria-label={`Open ${group.name}`}
                    className="absolute inset-0 z-0"
                    aria-expanded={active}
                    onClick={() => {
                      setQuery("");
                      setActiveId((current) => (current === group.id ? "" : group.id));
                    }}
                  />
                  <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">{group.id}</span>
                    <div className="pointer-events-auto flex items-center gap-1">
                      <button
                        type="button"
                        title="Duplicate workstream"
                        onClick={() => duplicateGroup(group)}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Copy className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove workstream"
                        onClick={() => removeGroup(group.id)}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    aria-label={`${group.id} workstream name`}
                    value={group.name}
                    onFocus={() => setActiveId(group.id)}
                    onChange={(event) => updateGroup(group.id, { name: event.target.value })}
                    className="relative z-10 mt-1 w-full bg-transparent text-sm font-bold outline-none focus:text-primary"
                  />
                  <label className="pointer-events-auto relative z-10 mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    <input
                      type="date"
                      value={group.date}
                      onFocus={() => setActiveId(group.id)}
                      onChange={(event) => updateGroup(group.id, { date: event.target.value })}
                      className="min-w-0 bg-transparent outline-none focus:text-foreground"
                    />
                    <span className="ml-auto tabular-nums">{group.rows.length} cases</span>
                  </label>
                  <div className="pointer-events-none relative z-10 mt-2">
                    <ProgressMeter rows={group.rows} />
                  </div>
                  <p className="pointer-events-none relative z-10 mt-2 font-mono text-[11px] text-muted-foreground">
                    {tally.pass} pass - {tally.partial} partial - {tally.notRun} not run -{" "}
                    {tally.fail} fail
                  </p>
                </section>
              );
            })}
          </div>

          {activeGroup ? (
            <section className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold">{activeGroup.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {visibleRows.length} of {activeGroup.rows.length} test cases
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addRow}
                  className="press inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:border-primary/50"
                >
                  <Plus className="size-4" />
                  Add row
                </button>
              </div>
              <div className="kanban max-h-[64vh] overflow-auto rounded-md border border-border bg-surface">
                <table className="report-table w-full min-w-[1120px] border-collapse bg-surface text-[13.5px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface-2 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                      <th scope="col" className="w-[100px] px-3.5 py-2.5">
                        ID
                      </th>
                      <th scope="col" className="w-[30%] px-3.5 py-2.5">
                        Test case
                      </th>
                      <th scope="col" className="w-[20%] px-3.5 py-2.5">
                        Workstream
                      </th>
                      <th scope="col" className="w-[120px] px-3.5 py-2.5">
                        Outcome
                      </th>
                      <th scope="col" className="w-[150px] px-3.5 py-2.5">
                        Defect status
                      </th>
                      <th scope="col" className="w-[140px] px-3.5 py-2.5">
                        Owner
                      </th>
                      <th scope="col" className="w-[150px] px-3.5 py-2.5">
                        Last updated
                      </th>
                      <th scope="col" className="w-12 px-2 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-2"
                      >
                        <td className="px-3.5 py-2 align-middle">
                          <input
                            aria-label="Test case ID"
                            value={row.id}
                            onChange={(event) =>
                              updateRow(activeGroup.id, row.id, { id: event.target.value })
                            }
                            className="w-full bg-transparent font-mono text-xs font-semibold text-primary outline-none"
                          />
                        </td>
                        <td className="px-3.5 py-2 align-middle">
                          <input
                            aria-label={`${row.id} test case name`}
                            value={row.name}
                            onChange={(event) =>
                              updateRow(activeGroup.id, row.id, { name: event.target.value })
                            }
                            className="w-full bg-transparent font-medium text-foreground outline-none"
                          />
                        </td>
                        <td className="px-3.5 py-2 align-middle text-muted-foreground">
                          {activeGroup.name}
                        </td>
                        <td className="px-3.5 py-2 align-middle">
                          <select
                            aria-label={`${row.id} outcome`}
                            value={row.status}
                            onChange={(event) =>
                              updateRow(activeGroup.id, row.id, {
                                status: event.target.value as TestStatus,
                              })
                            }
                            className={`h-7 w-full rounded-full border px-2 font-mono text-[11px] font-semibold uppercase outline-none transition-colors focus:ring-2 focus:ring-primary/15 ${outcomeSelectClass(row.status)}`}
                          >
                            {OUTCOMES.map((status) => (
                              <option key={status} value={status}>
                                {OUTCOME_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3.5 py-2 align-middle">
                          <select
                            aria-label={`${row.id} defect status`}
                            value={row.defectStatus}
                            onChange={(event) =>
                              updateRow(activeGroup.id, row.id, {
                                defectStatus: event.target.value as BugStatus,
                              })
                            }
                            className={`h-7 w-full rounded-full border px-2 font-mono text-[11px] font-semibold uppercase outline-none transition-colors focus:ring-2 focus:ring-primary/15 ${defectSelectClass(row.defectStatus)}`}
                          >
                            {BUG_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3.5 py-2 align-middle">
                          <input
                            aria-label={`${row.id} owner`}
                            value={row.owner}
                            placeholder="Unassigned"
                            onChange={(event) =>
                              updateRow(activeGroup.id, row.id, { owner: event.target.value })
                            }
                            className="w-full bg-transparent text-xs text-muted-foreground outline-none focus:text-foreground"
                          />
                        </td>
                        <td className="px-3.5 py-2 align-middle">
                          <input
                            type="date"
                            aria-label={`${row.id} last updated`}
                            value={row.updated}
                            onChange={(event) =>
                              updateRow(activeGroup.id, row.id, { updated: event.target.value })
                            }
                            className="w-full bg-transparent text-xs text-muted-foreground outline-none focus:text-foreground"
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-middle">
                          <button
                            type="button"
                            title={`Remove ${row.id}`}
                            onClick={() => removeRow(row.id)}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleRows.length === 0 && (
                  <EmptyState
                    icon={query ? SearchX : Plus}
                    title={
                      query
                        ? "No test cases match that search"
                        : "This workstream has no test cases"
                    }
                    hint={
                      query
                        ? "Clear the search to see all rows."
                        : "Use Add row to create the first one."
                    }
                    className="m-3"
                  />
                )}
              </div>
            </section>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="No workstreams yet"
              hint="Add a workstream to create its test-case table."
              className="mt-3"
            />
          ) : null}
        </div>
      )}
    </Shell>
  );
}
