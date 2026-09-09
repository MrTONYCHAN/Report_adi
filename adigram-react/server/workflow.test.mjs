import { test } from "node:test";
import assert from "node:assert/strict";
import { runAutomation, canMove, TRANSITIONS, RULES } from "./workflow.mjs";

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();
const day = (offsetDays) => iso(offsetDays).slice(0, 10);

function item(overrides = {}) {
  return {
    id: "TASK-1001",
    kind: "task",
    title: "Re-run payments regression",
    severity: "medium",
    status: "todo",
    progress: null,
    startDate: day(0),
    dueDate: null,
    breached: false,
    escalated: false,
    createdAt: iso(0),
    updatedAt: iso(0),
    history: [],
    ...overrides,
  };
}

test("scheduled work stays put until its start date arrives", () => {
  const future = item({ status: "scheduled", startDate: day(5) });
  runAutomation([future]);
  assert.equal(future.status, "scheduled");

  const arrived = item({ status: "scheduled", startDate: day(-1) });
  runAutomation([arrived]);
  assert.equal(arrived.status, "todo");
  assert.ok(arrived.history.some((entry) => entry.rule === "activate-scheduled"));
});

test("a scheduled defect opens rather than becoming a task column", () => {
  const bug = item({ id: "BUG-1001", kind: "bug", status: "scheduled", startDate: day(0) });
  runAutomation([bug]);
  assert.equal(bug.status, "open");
});

test("a missing due date is filled from the severity response target", () => {
  const critical = item({ severity: "critical", startDate: day(0) });
  runAutomation([critical]);
  assert.equal(critical.dueDate, day(2));

  const low = item({ severity: "low", startDate: day(0) });
  runAutomation([low]);
  assert.equal(low.dueDate, day(20));
});

test("work past its due date is flagged once, not on every run", () => {
  const late = item({ dueDate: day(-3) });
  const first = runAutomation([late]);
  assert.equal(late.breached, true);
  assert.ok(first.fired.some((entry) => entry.rule === "flag-overdue"));

  const second = runAutomation([late]);
  assert.equal(
    second.fired.filter((entry) => entry.rule === "flag-overdue").length,
    0,
    "a flag already raised must not fire again",
  );
});

test("a finished task is sent to review and a stalled critical defect escalates", () => {
  const finished = item({ status: "in-progress", progress: 100, dueDate: day(5) });
  runAutomation([finished]);
  assert.equal(finished.status, "review");

  const stalled = item({
    id: "BUG-1002",
    kind: "bug",
    severity: "critical",
    status: "open",
    dueDate: day(5),
    updatedAt: iso(-4),
  });
  runAutomation([stalled]);
  assert.equal(stalled.escalated, true);
});

test("a disabled rule leaves the board alone", () => {
  const late = item({ dueDate: day(-3) });
  const { fired } = runAutomation([late], { enabled: { "flag-overdue": false } });
  assert.equal(late.breached, false);
  assert.equal(fired.filter((entry) => entry.rule === "flag-overdue").length, 0);
});

test("automation never makes a move the transition table forbids", () => {
  for (const kind of Object.keys(TRANSITIONS)) {
    for (const [from, targets] of Object.entries(TRANSITIONS[kind])) {
      for (const to of targets) assert.ok(canMove(kind, from, to));
      assert.equal(canMove(kind, from, "not-a-status"), false);
    }
  }
});

test("every rule declares the metadata the workflow page renders", () => {
  for (const rule of RULES) {
    assert.ok(rule.id && rule.name && rule.description, `${rule.id} is missing metadata`);
    assert.equal(typeof rule.run, "function");
  }
});
