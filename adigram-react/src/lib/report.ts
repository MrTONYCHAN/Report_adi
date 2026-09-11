import { z } from "zod";

/** The register can hold several projects; everything the report itself carries
 *  sits under the first one. Picking this value drops the scope entirely and
 *  shows every project at once.
 *
 *  This module is the pure half of the data layer — schema, derivation and
 *  scoping, with no React in it — so the server tests can exercise it directly.
 */
export const ALL_PROJECTS = "all";

const stamp = z.object({
  byMemberKey: z.string().optional(),
  byName: z.string().optional(),
  at: z.string().optional(),
});
const tracking = stamp.extend({ status: z.enum(["open", "prog", "fixed", "ver"]) });
const record = z.object({
  caseId: z.string(),
  kind: z.enum(["case", "finding"]),
  workstream: z.string(),
  verdict: z.enum(["PASS", "PARTIAL", "NOT RUN", "FAIL"]).optional(),
  severity: z.string().optional(),
  original: z.object({ title: z.string(), finding: z.string() }),
  edits: z
    .object({ title: z.string().optional(), finding: z.string().optional() })
    .nullable()
    .optional(),
  tracking: tracking.nullable(),
  history: z.array(stamp.extend({ kind: z.string(), to: z.string().optional() })),
  addedAt: z.string().nullable(),
});

/* Anything the dashboard itself created. The report file stays read-only, so
   these arrive from the JSON overlay the API keeps beside it. */
const overlayItem = z.object({
  id: z.string(),
  kind: z.enum(["task", "bug"]),
  title: z.string(),
  description: z.string().default(""),
  workstream: z.string(),
  /* Blank on everything raised before the register held projects; those rows
     belong to the first project, which is where the report itself lives. */
  projectId: z.string().default(""),
  assignee: z.string(),
  severity: z.string(),
  status: z.string(),
  progress: z.number().nullable().default(null),
  startDate: z.string().nullable().default(null),
  dueDate: z.string().nullable().default(null),
  breached: z.boolean().default(false),
  escalated: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  origin: z.string().default("dashboard"),
  history: z.array(z.record(z.string(), z.unknown())).default([]),
});

const override = z.object({
  kind: z.string().optional(),
  status: z.string(),
  assignee: z.string().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  by: z.string().optional(),
  at: z.string().optional(),
});

/* Corrections to the roster the report shipped. The report often still carries
   slot placeholders ("Developer 1") where a real name belongs. */
const teamOverride = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  workstream: z.string().optional(),
  by: z.string().optional(),
  at: z.string().optional(),
});

const addedTeamMember = z.object({
  name: z.string(),
  role: z.string(),
  workstream: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const testCaseRow = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["pass", "partial", "not-run", "fail"]),
  defectStatus: z.enum([
    "scheduled",
    "untracked",
    "open",
    "in-progress",
    "blocked",
    "fixed",
    "verified",
    "closed",
    "wont-fix",
  ]),
  owner: z.string().default(""),
  updated: z.string().nullable().default(null),
});

const testCaseGroup = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().nullable().default(null),
  rows: z.array(testCaseRow),
});

const testCaseProject = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().nullable().default(null),
  groups: z.array(testCaseGroup),
});

const testCaseWorkspace = z.object({
  projects: z.array(testCaseProject).optional(),
  groups: z.array(testCaseGroup).optional(),
  updatedAt: z.string().optional(),
});

const automationEntry = z.object({
  at: z.string(),
  by: z.string().optional(),
  rule: z.string().optional(),
  kind: z.string().optional(),
  itemId: z.string().nullable().optional(),
  itemTitle: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  note: z.string().optional(),
});

export const reportSchema = z.object({
  source: z.string(),
  sourceUpdatedAt: z.string(),
  team: z.array(
    z.object({
      memberKey: z.string(),
      name: z.string(),
      slot: z.string(),
      area: z.string(),
      active: z.boolean(),
    }),
  ),
  testcases: z.array(record),
  items: z.array(overlayItem).default([]),
  overrides: z.record(z.string(), override).default({}),
  automation: z.array(automationEntry).default([]),
  teamEdits: z.record(z.string(), teamOverride).default({}),
  teamAdded: z.record(z.string(), addedTeamMember).default({}),
  teamRemoved: z.record(z.string(), z.boolean()).default({}),
  testCaseWorkspace: testCaseWorkspace.nullable().default(null),
  transitions: z.record(z.string(), z.record(z.string(), z.array(z.string()))).default({}),
  slaDays: z.record(z.string(), z.number()).default({}),
});

export type Severity = "critical" | "high" | "medium" | "low" | "unassessed";
export type TaskStatus = "scheduled" | "todo" | "in-progress" | "review" | "blocked" | "done";
export type BugStatus =
  | "scheduled"
  | "untracked"
  | "open"
  | "in-progress"
  | "blocked"
  | "fixed"
  | "verified"
  | "closed"
  | "wont-fix";
export type TestStatus = "pass" | "partial" | "not-run" | "fail";
export type ItemKind = "task" | "bug";
export type TestCaseWorkspace = z.infer<typeof testCaseWorkspace>;

export const TASK_STATUSES: TaskStatus[] = [
  "scheduled",
  "todo",
  "in-progress",
  "review",
  "blocked",
  "done",
];
export const BUG_STATUSES: BugStatus[] = [
  "scheduled",
  "untracked",
  "open",
  "in-progress",
  "blocked",
  "fixed",
  "verified",
  "closed",
  "wont-fix",
];
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "unassessed"];

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  todo: "To do",
  "in-progress": "In progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
  untracked: "Untracked",
  open: "Open",
  fixed: "Fixed",
  verified: "Verified",
  closed: "Closed",
  "wont-fix": "Won't fix",
};

function plainText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent?.trim() || "Untitled";
}
function date(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
export const formatDate = date;

/** The calendar filters work on plain YYYY-MM-DD, so every timestamp is reduced
 *  to the local day it falls on before it is compared to a picked range. */
export function toDay(value?: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const today = () => toDay(new Date().toISOString())!;

function severity(value?: string): Severity {
  const normalized = value?.toLowerCase();
  return normalized === "critical" ||
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low"
    ? normalized
    : "unassessed";
}

export type Task = {
  id: string;
  title: string;
  description: string;
  workstream: string;
  projectId: string;
  assignee: string;
  status: TaskStatus;
  severity: Severity;
  progress: number | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  due: string;
  breached: boolean;
  escalated: boolean;
  origin: "report" | "dashboard";
};

export type BugRow = {
  id: string;
  title: string;
  description: string;
  module: string;
  projectId: string;
  assignee: string;
  severity: Severity;
  status: BugStatus;
  age: number | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  breached: boolean;
  escalated: boolean;
  origin: "report" | "dashboard";
};

const asTaskStatus = (value: string): TaskStatus =>
  (TASK_STATUSES as string[]).includes(value) ? (value as TaskStatus) : "todo";
const asBugStatus = (value: string): BugStatus =>
  (BUG_STATUSES as string[]).includes(value) ? (value as BugStatus) : "open";

export function deriveDashboard(raw: z.infer<typeof reportSchema>, text = plainText) {
  const cases = raw.testcases.filter((c) => c.kind === "case");
  const getBugStatus = (c: z.infer<typeof record>) => {
    const patch = raw.overrides[c.caseId];
    const base: BugStatus = c.tracking
      ? ({ open: "open", prog: "in-progress", fixed: "fixed", ver: "verified" } as const)[
          c.tracking.status
        ]
      : "untracked";
    return patch ? asBugStatus(patch.status) : base;
  };

  const getTestCaseStatus = (c: z.infer<typeof record>) => {
    const bugStatus = getBugStatus(c);
    if (["fixed", "verified", "closed"].includes(bugStatus)) return "pass";
    return ({ PASS: "pass", PARTIAL: "partial", "NOT RUN": "not-run", FAIL: "fail" } as const)[
      c.verdict || "NOT RUN"
    ];
  };

  const reportWorkstreams = [...new Set(cases.map((c) => c.workstream))].map((id) => {
    const members = raw.team.filter((t) => t.slot === `Developer ${id.replace(/^D/, "")}`);
    const rows = cases.filter((c) => c.workstream === id);
    return {
      id,
      name: members[0]?.area || id,
      owner: members[0]?.name || "Unassigned",
      pass: rows.filter((c) => getTestCaseStatus(c) === "pass").length,
      partial: rows.filter((c) => getTestCaseStatus(c) === "partial").length,
      notRun: rows.filter((c) => getTestCaseStatus(c) === "not-run").length,
      fail: rows.filter((c) => getTestCaseStatus(c) === "fail").length,
      date: null as string | null,
    };
  });
  const reportGroups = reportWorkstreams.map((workstream) => ({
    id: workstream.id,
    name: workstream.name,
    date: workstream.date,
    rows: cases
      .filter((row) => row.workstream === workstream.id)
      .map((row) => ({
        id: row.caseId,
        name: text(row.edits?.title || row.original.title),
        status: getTestCaseStatus(row),
        defectStatus: getBugStatus(row),
        owner: row.tracking?.byName || "",
        updated: toDay(row.tracking?.at),
      })),
  }));
  const testCaseProjects = raw.testCaseWorkspace?.projects?.length
    ? raw.testCaseWorkspace.projects
    : raw.testCaseWorkspace?.groups
      ? [{ id: "PROJECT-1", name: "ADIGRAM", date: null, groups: raw.testCaseWorkspace.groups }]
      : [{ id: "PROJECT-1", name: "ADIGRAM", date: null, groups: reportGroups }];
  const workstreams = testCaseProjects.flatMap((project) =>
    project.groups.map((group) => ({
      id: group.id,
      name: group.name,
      owner: "",
      pass: group.rows.filter((row) => row.status === "pass").length,
      partial: group.rows.filter((row) => row.status === "partial").length,
      notRun: group.rows.filter((row) => row.status === "not-run").length,
      fail: group.rows.filter((row) => row.status === "fail").length,
      date: group.date,
      projectId: project.id,
    })),
  );
  const streamName = (id: string) => workstreams.find((w) => w.id === id)?.name || id;
  const overrides = raw.overrides;

  const reportTasks: Task[] = cases
    .filter((c) => c.tracking || c.verdict !== "PASS")
    .map((c) => {
      const patch = overrides[c.caseId];
      const base = ({ open: "todo", prog: "in-progress", fixed: "review", ver: "done" } as const)[
        c.tracking?.status || "open"
      ];
      return {
        id: c.caseId,
        title: text(c.edits?.title || c.original.title),
        description: text(c.edits?.finding || c.original.finding),
        workstream: streamName(c.workstream),
        projectId: "",
        assignee: patch?.assignee || "Unassigned",
        status: patch ? asTaskStatus(patch.status) : base,
        severity: severity(c.severity),
        progress: (patch ? asTaskStatus(patch.status) : base) === "done" ? 100 : null,
        startDate: patch?.startDate ?? null,
        dueDate: patch?.dueDate ?? null,
        createdAt: c.addedAt,
        updatedAt: patch?.at ?? c.tracking?.at ?? null,
        due: date(patch?.dueDate) === "—" ? "No due date" : date(patch?.dueDate),
        breached: Boolean(patch?.dueDate && patch.dueDate < today() && patch.status !== "done"),
        escalated: false,
        origin: "report" as const,
      };
    });

  const overlayTasks: Task[] = raw.items
    .filter((i) => i.kind === "task")
    .map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      workstream: i.workstream,
      projectId: i.projectId,
      assignee: i.assignee,
      status: asTaskStatus(i.status),
      severity: severity(i.severity),
      progress: i.progress,
      startDate: i.startDate,
      dueDate: i.dueDate,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      due: i.dueDate ? date(i.dueDate) : "No due date",
      breached: i.breached,
      escalated: i.escalated,
      origin: "dashboard" as const,
    }));

  const tasks = [...overlayTasks, ...reportTasks];

  const reportBugs: BugRow[] = raw.testcases
    .filter((c) => c.kind === "finding")
    .map((c) => {
      const patch = overrides[c.caseId];
      const base: BugStatus = c.tracking
        ? ({ open: "open", prog: "in-progress", fixed: "fixed", ver: "verified" } as const)[
            c.tracking.status
          ]
        : "untracked";
      const status = patch ? asBugStatus(patch.status) : base;
      return {
        id: c.caseId,
        title: text(c.edits?.title || c.original.title),
        description: text(c.edits?.finding || c.original.finding),
        module: streamName(c.workstream),
        projectId: "",
        assignee: patch?.assignee || "Unassigned",
        severity: severity(c.severity),
        status,
        age:
          c.addedAt && Number.isFinite(Date.parse(c.addedAt))
            ? Math.max(0, Math.floor((Date.now() - Date.parse(c.addedAt)) / 86400000))
            : null,
        startDate: patch?.startDate ?? null,
        dueDate: patch?.dueDate ?? null,
        createdAt: c.addedAt,
        updatedAt: patch?.at ?? c.tracking?.at ?? null,
        breached: Boolean(
          patch?.dueDate && patch.dueDate < today() && !["verified", "closed"].includes(status),
        ),
        escalated: false,
        origin: "report" as const,
      };
    });

  const overlayBugs: BugRow[] = raw.items
    .filter((i) => i.kind === "bug")
    .map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      module: i.workstream,
      projectId: i.projectId,
      assignee: i.assignee,
      severity: severity(i.severity),
      status: asBugStatus(i.status),
      age: Number.isFinite(Date.parse(i.createdAt))
        ? Math.max(0, Math.floor((Date.now() - Date.parse(i.createdAt)) / 86400000))
        : null,
      startDate: i.startDate,
      dueDate: i.dueDate,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      breached: i.breached,
      escalated: i.escalated,
      origin: "dashboard" as const,
    }));

  const bugs = [...overlayBugs, ...reportBugs];

  const testCases = testCaseProjects.flatMap((project) =>
    project.groups.flatMap((group) =>
      group.rows.map((row) => ({
        ...row,
        updated: row.updated || "",
        workstream: group.name,
        workstreamId: group.id,
        projectId: project.id,
      })),
    ),
  );
  const events = raw.testcases
    .flatMap((c) => c.history.map((h, i) => ({ ...h, caseId: c.caseId, id: `${c.caseId}-${i}` })))
    .filter((h) => h.at && Number.isFinite(Date.parse(h.at)));
  const roster = [
    ...raw.team
      .filter((member) => member.active && !raw.teamRemoved[member.memberKey])
      .map((member) => ({
        id: member.memberKey,
        reported: {
          name: member.name || member.slot,
          role: member.slot,
          workstream: member.area,
        },
        source: "report" as const,
      })),
    ...Object.entries(raw.teamAdded).map(([id, member]) => ({
      id,
      reported: { name: member.name, role: member.role, workstream: member.workstream },
      source: "dashboard" as const,
    })),
  ];
  const developers = roster.map((member) => {
    const patch = member.source === "report" ? raw.teamEdits[member.id] : undefined;
    const reported = member.reported;
    const name = patch?.name || reported.name;
    const updated = cases.filter((c) => c.tracking?.byMemberKey === member.id);
    const contributions = events.filter((h) => h.byMemberKey === member.id).length;
    const named = tasks.filter((task) => task.assignee === name);
    return {
      id: member.id,
      name,
      initials: name
        .split(/\s+/)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      role: patch?.role || reported.role,
      workstream: patch?.workstream || reported.workstream,
      reported,
      edited: Boolean(patch) || member.source === "dashboard",
      source: member.source,
      openTasks: updated.length + named.filter((task) => task.status !== "done").length,
      openBugs: updated.filter(
        (c) => c.tracking?.status === "open" || c.tracking?.status === "prog",
      ).length,
      resolved: updated.filter(
        (c) => c.tracking?.status === "fixed" || c.tracking?.status === "ver",
      ).length,
      load: events.length ? Math.round((contributions / events.length) * 100) : 0,
      online: false,
    };
  });
  const activity = [
    ...raw.automation.map((a, i) => ({
      id: `auto-${i}-${a.at}`,
      who: a.by || "Workflow automation",
      what: `${a.rule ? "automation " : ""}${a.itemId ? `${a.itemId} ` : ""}${a.to ? `→ ${STATUS_LABELS[a.to] || a.to}` : a.note || "updated"}`,
      when: date(a.at),
      at: a.at,
      tone: a.rule ? "warning" : "info",
    })),
    ...events
      .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!))
      .map((h) => ({
        id: h.id,
        who: h.byName || "Unknown author",
        what: `updated ${h.caseId}${h.to ? ` to ${{ open: "open", prog: "in progress", fixed: "fixed", ver: "verified" }[h.to] || h.to}` : ""}`,
        when: date(h.at),
        at: h.at!,
        tone: h.to === "fixed" || h.to === "ver" ? "success" : "info",
      })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 24);

  const severityMix = SEVERITIES.map((key) => ({
    key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: bugs.filter((b) => b.severity === key).length,
  })).filter((s) => s.value > 0);

  const closedBug = (b: BugRow) => ["fixed", "verified", "closed", "wont-fix"].includes(b.status);
  const now = today();

  return {
    testCaseProjects,
    projects: testCaseProjects.map((project) => ({
      id: project.id,
      name: project.name,
      date: project.date ?? null,
      cases: project.groups.reduce((sum, group) => sum + group.rows.length, 0),
      workstreams: project.groups.length,
    })),
    /* Replaced by scopeDashboard once a project is picked in the header. */
    activeProjectId: ALL_PROJECTS as string,
    workstreams,
    tasks,
    bugs,
    testCases,
    developers,
    activity,
    severityMix,
    automation: raw.automation,
    transitions: raw.transitions,
    slaDays: raw.slaDays,
    readinessTrend: [] as { week: string; pass: number; coverage: number }[],
    burndown: [] as { day: string; open: number; closed: number }[],
    totals: {
      testCases: cases.length,
      passed: testCases.filter((c) => c.status === "pass").length,
      failed: testCases.filter((c) => c.status === "fail").length,
      openBugs: bugs.filter((b) => !closedBug(b)).length,
      openTasks: tasks.filter((t) => t.status !== "done").length,
      scheduled:
        tasks.filter((t) => t.status === "scheduled").length +
        bugs.filter((b) => b.status === "scheduled").length,
      breached: [...tasks, ...bugs].filter((r) => r.breached).length,
      dueToday: [...tasks, ...bugs].filter((r) => r.dueDate === now).length,
    },
    source: raw.source,
    sourceUpdatedAt: raw.sourceUpdatedAt,
  };
}

export type Dashboard = ReturnType<typeof deriveDashboard>;
export type DashboardProject = Dashboard["projects"][number];

const isClosedBug = (status: BugStatus) =>
  ["fixed", "verified", "closed", "wont-fix"].includes(status);

/** Narrows a whole-register dashboard down to one project.
 *
 *  Test cases and workstreams carry a projectId, so they scope exactly. Tasks,
 *  defects and roster rows only name a workstream, so they are matched by that
 *  name — and anything whose workstream belongs to no project at all (a card
 *  created from the board with a free-text module, say) stays with the first
 *  project, which is where every record that predates projects lives. */
export function scopeDashboard(full: Dashboard, projectId: string): Dashboard {
  if (projectId === ALL_PROJECTS) return { ...full, activeProjectId: ALL_PROJECTS };
  const active = full.testCaseProjects.find((p) => p.id === projectId) || full.testCaseProjects[0];
  if (!active) return { ...full, activeProjectId: ALL_PROJECTS };
  const mine = new Set(active.groups.map((group) => group.name));
  const claimed = new Set(
    full.testCaseProjects.flatMap((project) => project.groups.map((group) => group.name)),
  );
  const isPrimary = full.testCaseProjects[0]?.id === active.id;
  const owns = (workstream: string) =>
    mine.has(workstream) || (isPrimary && !claimed.has(workstream));
  /* A row filed under a project answers for itself. One with no project — the
     report's own findings, and anything raised before projects existed — is
     placed by its workstream instead. */
  const owned = (row: { projectId: string }, workstream: string) =>
    row.projectId ? row.projectId === active.id : owns(workstream);

  const workstreams = full.workstreams.filter((w) => w.projectId === active.id);
  const testCases = full.testCases.filter((c) => c.projectId === active.id);
  const tasks = full.tasks.filter((t) => owned(t, t.workstream));
  const bugs = full.bugs.filter((b) => owned(b, b.module));
  const developers = full.developers.filter((d) => owns(d.workstream));
  const now = today();

  return {
    ...full,
    activeProjectId: active.id,
    workstreams,
    testCases,
    tasks,
    bugs,
    developers,
    severityMix: SEVERITIES.map((key) => ({
      key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: bugs.filter((b) => b.severity === key).length,
    })).filter((s) => s.value > 0),
    totals: {
      testCases: testCases.length,
      passed: testCases.filter((c) => c.status === "pass").length,
      failed: testCases.filter((c) => c.status === "fail").length,
      openBugs: bugs.filter((b) => !isClosedBug(b.status)).length,
      openTasks: tasks.filter((t) => t.status !== "done").length,
      scheduled:
        tasks.filter((t) => t.status === "scheduled").length +
        bugs.filter((b) => b.status === "scheduled").length,
      breached: [...tasks, ...bugs].filter((r) => r.breached).length,
      dueToday: [...tasks, ...bugs].filter((r) => r.dueDate === now).length,
    },
  };
}
