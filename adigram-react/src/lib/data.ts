import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  const workstreams = [...new Set(cases.map((c) => c.workstream))].map((id) => {
    const members = raw.team.filter((t) => t.slot === `Developer ${id.replace(/^D/, "")}`);
    const rows = cases.filter((c) => c.workstream === id);
    return {
      id,
      name: members[0]?.area || id,
      owner: members[0]?.name || "Unassigned",
      pass: rows.filter((c) => c.verdict === "PASS").length,
      partial: rows.filter((c) => c.verdict === "PARTIAL").length,
      notRun: rows.filter((c) => c.verdict === "NOT RUN").length,
      fail: rows.filter((c) => c.verdict === "FAIL").length,
    };
  });
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

  const testCases = cases.map((c) => ({
    id: c.caseId,
    name: text(c.edits?.title || c.original.title),
    workstream: streamName(c.workstream),
    status: ({ PASS: "pass", PARTIAL: "partial", "NOT RUN": "not-run", FAIL: "fail" } as const)[
      c.verdict || "NOT RUN"
    ],
    owner: c.tracking?.byName || "—",
    updated: date(c.tracking?.at),
  }));
  const events = raw.testcases
    .flatMap((c) => c.history.map((h, i) => ({ ...h, caseId: c.caseId, id: `${c.caseId}-${i}` })))
    .filter((h) => h.at && Number.isFinite(Date.parse(h.at)));
  const developers = raw.team
    .filter((t) => t.active)
    .map((t) => {
      /* The report's roster often still carries slot placeholders where a real
         name belongs, so a correction saved on the dashboard wins over it. */
      const patch = raw.teamEdits[t.memberKey];
      const reported = { name: t.name || t.slot, role: t.slot, workstream: t.area };
      const name = patch?.name || reported.name;
      const updated = cases.filter((c) => c.tracking?.byMemberKey === t.memberKey);
      const contributions = events.filter((h) => h.byMemberKey === t.memberKey).length;
      const named = tasks.filter((task) => task.assignee === name);
      return {
        id: t.memberKey,
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
        edited: Boolean(patch),
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

export function useDashboardQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/dashboard", { signal, cache: "no-store" });
      /* A session that lapses mid-visit should bring the access gate back,
         rather than leave the board reporting a data failure the reader has no
         way to act on. */
      if (response.status === 401) {
        void queryClient.invalidateQueries({ queryKey: ["session"] });
        throw new Error("Your session has ended. Enter the access code again.");
      }
      if (!response.ok)
        throw new Error("The readiness report is unavailable. Check the data source and retry.");
      return deriveDashboard(reportSchema.parse(await response.json()));
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 10000,
    retry: 1,
  });
}
export function useDashboard() {
  const query = useDashboardQuery();
  if (!query.data) throw new Error("Dashboard must render within its data boundary.");
  return query.data;
}

async function send(url: string, method: string, payload?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error || "The change could not be saved.");
  return result;
}

/* Every mutation invalidates the one dashboard query rather than patching the
   cache, because the server re-runs the automation on write and can legitimately
   hand back a different status than the one that was requested. */
function useBoardMutation<V>(run: (value: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
}

export type ItemDraft = {
  kind: ItemKind;
  title: string;
  description?: string;
  workstream?: string;
  assignee?: string;
  severity?: Severity;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  progress?: number | null;
  by?: string;
};

export const useCreateItem = () =>
  useBoardMutation((draft: ItemDraft) => send("/api/items", "POST", draft));

export const useUpdateItem = () =>
  useBoardMutation(({ id, ...rest }: Partial<ItemDraft> & { id: string }) =>
    send(`/api/items/${encodeURIComponent(id)}`, "PATCH", rest),
  );

export const useDeleteItem = () =>
  useBoardMutation((id: string) => send(`/api/items/${encodeURIComponent(id)}`, "DELETE"));

export const useUpdateRecord = () =>
  useBoardMutation(({ id, ...rest }: { id: string; kind: ItemKind; status: string; by?: string }) =>
    send(`/api/records/${encodeURIComponent(id)}`, "PATCH", rest),
  );

export type TeamEdit = { name?: string; role?: string; workstream?: string; by?: string };

export const useUpdateTeamMember = () =>
  useBoardMutation(({ id, ...rest }: TeamEdit & { id: string }) =>
    send(`/api/team/${encodeURIComponent(id)}`, "PATCH", rest),
  );

/** Drops a correction so the member falls back to whatever the report says. */
export const useResetTeamMember = () =>
  useBoardMutation((id: string) => send(`/api/team/${encodeURIComponent(id)}`, "DELETE"));

/** Moves a card whether it came from the report or from the overlay; the two
 *  need different endpoints, and no caller should have to remember which. */
export function useMoveCard() {
  const updateItem = useUpdateItem();
  const updateRecord = useUpdateRecord();
  return {
    isPending: updateItem.isPending || updateRecord.isPending,
    error: updateItem.error || updateRecord.error,
    move: (row: { id: string; origin: "report" | "dashboard" }, kind: ItemKind, status: string) =>
      row.origin === "dashboard"
        ? updateItem.mutateAsync({ id: row.id, status })
        : updateRecord.mutateAsync({ id: row.id, kind, status }),
  };
}
