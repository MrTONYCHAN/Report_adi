/* The workflow engine.

   Two halves, deliberately kept apart:

   TRANSITIONS is the board's grammar — which status a card may legally move to
   next. The UI renders its move buttons from this, so the server never has to
   trust a status the browser invented.

   RULES is the automation — the part a tracker like Jira runs on a timer. Each
   rule is a pure (item, now) -> patch function, so the same board state always
   produces the same result and the engine can be replayed or tested without a
   clock. Rules only ever move work forward or raise a flag; none of them close
   or delete anything a person did not close. */

export const KINDS = ["task", "bug"];

export const TRANSITIONS = {
  task: {
    scheduled: ["todo", "in-progress", "blocked"],
    todo: ["in-progress", "blocked", "done"],
    "in-progress": ["review", "blocked", "todo"],
    review: ["done", "in-progress"],
    blocked: ["todo", "in-progress"],
    done: ["in-progress"],
  },
  bug: {
    scheduled: ["open", "in-progress"],
    untracked: ["open"],
    open: ["in-progress", "wont-fix"],
    "in-progress": ["fixed", "blocked", "open"],
    blocked: ["in-progress", "open"],
    fixed: ["verified", "in-progress"],
    verified: ["closed", "in-progress"],
    closed: ["open"],
    "wont-fix": ["open"],
  },
};

export const TERMINAL = { task: ["done"], bug: ["verified", "closed", "wont-fix"] };

/* The status work lands in once its start date arrives. */
const FIRST_ACTIVE = { task: "todo", bug: "open" };

/* Response targets by severity, in days. A critical defect raised on Monday is
   due Wednesday; a low one gets three working weeks. Used to fill in a due date
   nobody set, and to decide what counts as breached. */
export const SLA_DAYS = { critical: 2, high: 5, medium: 10, low: 20, unassessed: 15 };

const DAY = 86400000;
const at = (value) => (value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
const days = (from, to) => Math.floor((to - from) / DAY);

export const RULES = [
  {
    id: "activate-scheduled",
    name: "Start scheduled work",
    description:
      "A card planned for a future date sits in Scheduled until that date arrives, then moves into the board's first active column on its own.",
    run(item, now) {
      if (item.status !== "scheduled") return null;
      const start = at(item.startDate);
      if (start === null || start > now) return null;
      return { status: FIRST_ACTIVE[item.kind], note: "Start date reached" };
    },
  },
  {
    id: "sla-due-date",
    name: "Apply severity response target",
    description:
      "Work raised without a due date inherits one from its severity: critical 2 days, high 5, medium 10, low 20.",
    run(item) {
      if (item.dueDate) return null;
      const base = at(item.startDate) ?? at(item.createdAt);
      if (base === null) return null;
      const target = SLA_DAYS[item.severity] ?? SLA_DAYS.unassessed;
      return {
        dueDate: new Date(base + target * DAY).toISOString().slice(0, 10),
        note: `${target}-day ${item.severity} target`,
      };
    },
  },
  {
    id: "flag-overdue",
    name: "Flag breached targets",
    description:
      "Anything still open past its due date is marked breached so it surfaces at the top of the board instead of ageing quietly.",
    run(item, now) {
      if (TERMINAL[item.kind].includes(item.status)) return null;
      const due = at(item.dueDate);
      if (due === null || due >= now) return null;
      if (item.breached) return null;
      return { breached: true, note: `${days(due, now)} day(s) past due` };
    },
  },
  {
    id: "escalate-stale-critical",
    name: "Escalate stalled critical defects",
    description:
      "A critical defect that has not moved in 3 days is escalated, so a silent blocker cannot sit in the same column all week.",
    run(item, now) {
      if (item.kind !== "bug" || item.severity !== "critical") return null;
      if (TERMINAL[item.kind].includes(item.status) || item.escalated) return null;
      const touched = at(item.updatedAt) ?? at(item.createdAt);
      if (touched === null || days(touched, now) < 3) return null;
      return { escalated: true, note: `No movement for ${days(touched, now)} day(s)` };
    },
  },
  {
    id: "progress-to-review",
    name: "Send finished tasks to review",
    description:
      "A task reported at 100% complete moves to Review rather than waiting for someone to drag it there.",
    run(item) {
      if (item.kind !== "task" || item.progress !== 100) return null;
      if (item.status !== "in-progress") return null;
      return { status: "review", note: "Progress reached 100%" };
    },
  },
  {
    id: "close-verified",
    name: "Close long-verified defects",
    description:
      "A defect that has stayed verified for 7 days is closed, keeping the register to work that is still live.",
    run(item, now) {
      if (item.kind !== "bug" || item.status !== "verified") return null;
      const touched = at(item.updatedAt);
      if (touched === null || days(touched, now) < 7) return null;
      return { status: "closed", note: "Verified for 7 days" };
    },
  },
];

export function canMove(kind, from, to) {
  return (TRANSITIONS[kind]?.[from] || []).includes(to);
}

/* Applies every enabled rule to every item. Returns the mutated items and the
   log lines the run produced; the caller decides whether that is worth a write. */
export function runAutomation(items, { now = Date.now(), enabled = {} } = {}) {
  const fired = [];
  const stamp = new Date(now).toISOString();

  for (const item of items) {
    for (const rule of RULES) {
      if (enabled[rule.id] === false) continue;
      let patch;
      try {
        patch = rule.run(item, now);
      } catch {
        continue; // A rule that throws must not stop the board rendering.
      }
      if (!patch) continue;

      const { note, ...fields } = patch;
      if (fields.status && !canMove(item.kind, item.status, fields.status)) continue;

      const from = item.status;
      Object.assign(item, fields, { updatedAt: fields.status ? stamp : item.updatedAt });
      const entry = {
        at: stamp,
        by: "Workflow automation",
        rule: rule.id,
        kind: fields.status ? "status" : "flag",
        itemId: item.id,
        itemTitle: item.title,
        from: fields.status ? from : undefined,
        to: fields.status,
        note,
      };
      item.history = [...(item.history || []), entry];
      fired.push(entry);
    }
  }
  return { items, fired };
}
