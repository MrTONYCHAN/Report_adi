import { readReport } from "./report-source.mjs";
import { readStore, writeStore, nextId } from "./store.mjs";
import { runAutomation, canMove, TRANSITIONS, TERMINAL, SLA_DAYS } from "./workflow.mjs";

const SEVERITIES = ["critical", "high", "medium", "low", "unassessed"];
const MAX_BODY = 256 * 1024;
const MAX_LOG = 500;

const json = (res, code, payload) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const text = (value, max, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

/* Dates arrive from a date input, so a plain YYYY-MM-DD is the only shape
   accepted; anything else is dropped rather than stored as an unparseable
   string the board would later have to defend against. */
function day(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function draft(input, store) {
  const kind = input.kind === "bug" ? "bug" : "task";
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const start = day(input.startDate);
  const requested = text(input.status, 24);
  // Work planned for a future date opens in Scheduled; the automation moves it
  // onto the board the day it starts, which is what makes forward planning safe.
  const status =
    requested && TRANSITIONS[kind][requested]
      ? requested
      : start && start > today
        ? "scheduled"
        : kind === "bug"
          ? "open"
          : "todo";

  return {
    id: nextId(store, kind),
    kind,
    title: text(input.title, 240, "Untitled"),
    description: text(input.description, 4000),
    workstream: text(input.workstream, 120, "Unassigned workstream"),
    assignee: text(input.assignee, 120, "Unassigned"),
    severity: SEVERITIES.includes(input.severity) ? input.severity : "unassessed",
    status,
    progress: Number.isFinite(input.progress) ? Math.min(100, Math.max(0, input.progress)) : null,
    startDate: start ?? today,
    dueDate: day(input.dueDate),
    breached: false,
    escalated: false,
    createdAt: now,
    updatedAt: now,
    origin: "dashboard",
    history: [
      {
        at: now,
        by: text(input.by, 120, "Dashboard user"),
        kind: "created",
        to: status,
        note: start && start > today ? "Planned for " + start : "Created",
      },
    ],
  };
}

function patch(item, input, now) {
  const changes = [];
  const by = text(input.by, 120, "Dashboard user");

  if (input.status && input.status !== item.status) {
    if (!canMove(item.kind, item.status, input.status))
      return { error: item.status + " cannot move to " + input.status };
    changes.push({ at: now, by, kind: "status", from: item.status, to: input.status });
    item.status = input.status;
    // Clearing the flags on a move is what lets a rule fire again later, rather
    // than an item staying permanently marked by one breach months ago.
    if (TERMINAL[item.kind].includes(item.status)) {
      item.breached = false;
      item.escalated = false;
    }
  }

  for (const [field, max] of [
    ["title", 240],
    ["description", 4000],
    ["workstream", 120],
    ["assignee", 120],
  ]) {
    if (typeof input[field] === "string" && text(input[field], max) !== item[field]) {
      item[field] = text(input[field], max, item[field]);
      changes.push({ at: now, by, kind: "field", note: "Updated " + field });
    }
  }
  if (SEVERITIES.includes(input.severity) && input.severity !== item.severity) {
    changes.push({ at: now, by, kind: "field", note: "Severity to " + input.severity });
    item.severity = input.severity;
  }
  for (const field of ["startDate", "dueDate"]) {
    if (field in input) {
      const value = day(input[field]);
      if (value !== item[field]) {
        item[field] = value;
        changes.push({ at: now, by, kind: "field", note: field + " to " + (value || "cleared") });
      }
    }
  }
  if (Number.isFinite(input.progress)) {
    const value = Math.min(100, Math.max(0, input.progress));
    if (value !== item.progress) {
      item.progress = value;
      changes.push({ at: now, by, kind: "field", note: "Progress to " + value + "%" });
    }
  }

  if (!changes.length) return { changes };
  item.updatedAt = now;
  item.history = [
    ...(item.history || []),
    ...changes.map((c) => ({ ...c, itemId: item.id, itemTitle: item.title })),
  ];
  return { changes };
}

/* Automation runs on read as well as on write, because a due date passes with
   nobody touching the board. Only a run that actually changed something earns a
   write back to disk. */
function withAutomation(store) {
  const { fired } = runAutomation(store.items, { enabled: store.rules });
  if (fired.length) {
    store.automation = [...fired, ...store.automation].slice(0, MAX_LOG);
    writeStore(store);
  }
  return store;
}

const overlay = (store) => ({
  items: store.items,
  overrides: store.overrides,
  automation: store.automation.slice(0, 80),
  teamEdits: store.team,
  transitions: TRANSITIONS,
  slaDays: SLA_DAYS,
});

export function dashboardApi(source) {
  return async (req, res, next) => {
    const [pathname] = (req.url || "").split("?");
    if (!pathname.startsWith("/api/")) return next();

    try {
      if (pathname === "/api/dashboard" && req.method === "GET") {
        if (!source) throw new Error("Report source not configured");
        const store = withAutomation(readStore());
        return json(res, 200, { ...readReport(source), ...overlay(store) });
      }

      if (pathname === "/api/items" && req.method === "POST") {
        const store = readStore();
        const item = draft(await body(req), store);
        store.items.push(item);
        writeStore(store);
        return json(res, 201, { item, ...overlay(withAutomation(readStore())) });
      }

      const itemMatch = pathname.match(/^\/api\/items\/([A-Za-z0-9-]{1,40})$/);
      if (itemMatch) {
        const store = readStore();
        const item = store.items.find((i) => i.id === itemMatch[1]);
        if (!item) return json(res, 404, { error: "No such item" });

        if (req.method === "DELETE") {
          store.items = store.items.filter((i) => i.id !== item.id);
          writeStore(store);
          return json(res, 200, overlay(store));
        }
        if (req.method === "PATCH") {
          const result = patch(item, await body(req), new Date().toISOString());
          if (result.error) return json(res, 409, { error: result.error });
          store.automation = [
            ...result.changes.map((c) => ({ ...c, itemId: item.id, itemTitle: item.title })),
            ...store.automation,
          ].slice(0, MAX_LOG);
          writeStore(store);
          return json(res, 200, { item, ...overlay(withAutomation(readStore())) });
        }
        return json(res, 405, { error: "Use PATCH or DELETE" });
      }

      /* Records that came out of the report cannot be edited in place, but the
         board still has to be able to move them. The move is kept as an
         override keyed by case id and replayed over the report on every read. */
      const recordMatch = pathname.match(/^\/api\/records\/([A-Za-z0-9-]{1,40})$/);
      if (recordMatch && req.method === "PATCH") {
        const input = await body(req);
        const store = readStore();
        const id = recordMatch[1];
        const now = new Date().toISOString();
        const by = text(input.by, 120, "Dashboard user");
        const previous = store.overrides[id];
        const status = text(input.status, 24);
        const kind = input.kind === "bug" ? "bug" : "task";
        if (!TRANSITIONS[kind][status]) return json(res, 400, { error: "Unknown status" });

        store.overrides[id] = {
          kind,
          status,
          assignee: text(input.assignee, 120, previous?.assignee || ""),
          dueDate: "dueDate" in input ? day(input.dueDate) : (previous?.dueDate ?? null),
          startDate: "startDate" in input ? day(input.startDate) : (previous?.startDate ?? null),
          by,
          at: now,
        };
        store.automation = [
          { at: now, by, kind: "status", itemId: id, to: status, note: "Report record moved" },
          ...store.automation,
        ].slice(0, MAX_LOG);
        writeStore(store);
        return json(res, 200, overlay(store));
      }

      /* The roster comes from the report, where the names are often still slot
         placeholders ("Developer 1"). Corrections are kept as an overlay keyed
         by member so the report file is never rewritten, and clearing a field
         falls back to whatever the report said. */
      const teamMatch = pathname.match(/^\/api\/team\/([A-Za-z0-9_-]{1,40})$/);
      if (teamMatch && req.method === "PATCH") {
        const input = await body(req);
        const store = readStore();
        const key = teamMatch[1];

        // An override for a member the report does not have would never merge
        // onto anything; refusing it keeps the overlay free of orphans.
        if (source && !readReport(source).team.some((m) => m.memberKey === key))
          return json(res, 404, { error: "No such team member" });

        const now = new Date().toISOString();
        const by = text(input.by, 120, "Dashboard user");

        const patched = {};
        for (const [field, max] of [
          ["name", 120],
          ["role", 120],
          ["workstream", 160],
        ]) {
          if (field in input) {
            const value = text(input[field], max);
            if (value) patched[field] = value;
          }
        }

        if (Object.keys(patched).length === 0) {
          delete store.team[key];
        } else {
          store.team[key] = { ...patched, by, at: now };
        }
        writeStore(store);
        return json(res, 200, overlay(store));
      }

      if (teamMatch && req.method === "DELETE") {
        const store = readStore();
        delete store.team[teamMatch[1]];
        writeStore(store);
        return json(res, 200, overlay(store));
      }

      return json(res, 404, { error: "No such endpoint" });
    } catch (error) {
      if (pathname === "/api/dashboard")
        return json(res, 503, {
          error:
            "The readiness report is unavailable. Check REPORT_SOURCE on the server and try again.",
        });
      return json(res, 400, { error: error?.message || "The request could not be completed." });
    }
  };
}
