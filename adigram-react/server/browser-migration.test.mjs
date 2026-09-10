import test from "node:test";
import assert from "node:assert/strict";
import { parseBrowserExport, mergeBrowserExports } from "./browser-migration.mjs";

const team = [{ key: "d1", slot: "Developer 1", area: "Testing", name: "Tester" }];
const row = { s: "fixed", by: "Tester", slot: "Developer 1", at: "2026-09-07T06:00:00Z" };
const event = { id: "D1-01", from: "prog", to: "fixed", by: row.by, slot: row.slot, at: row.at };
const data = {
  team,
  rows: { "D1-01": row },
  log: [event],
  text: {},
  versions: [
    {
      v: "v1.0",
      at: row.at,
      by: row.by,
      slot: row.slot,
      snap: { rows: { "D1-01": row }, team, text: {} },
    },
  ],
};

test("browser exports accept console quotes and double-encoded JSON", () => {
  for (const raw of [
    JSON.stringify(data),
    `'${JSON.stringify(data)}'`,
    JSON.stringify(JSON.stringify(data)),
  ]) {
    const parsed = parseBrowserExport(raw);
    assert.equal(parsed.complete, true);
    assert.deepEqual(parsed.data, data);
  }
});
test("truncated export recovers complete rows and log entries without inventing the tail", () => {
  const raw = `'{"team":${JSON.stringify(team)},"rows":${JSON.stringify(data.rows)},"log":[${JSON.stringify(event)},{"id":"D1`;
  const parsed = parseBrowserExport(raw);
  assert.equal(parsed.complete, false);
  assert.deepEqual(parsed.data.rows, data.rows);
  assert.deepEqual(parsed.data.log, [event]);
  assert.equal(parsed.data.versions, undefined);
});
test("merge uses actual timestamps, keeps snapshots and raw exports, and is repeatable", () => {
  const report = {
    team: team.map(({ key, ...member }) => ({ ...member, memberKey: key })),
    testcases: [
      { caseId: "D1-01", tracking: { status: "prog", at: "2026-09-07T11:00:00" }, history: [] },
    ],
    versions: [],
  };
  const files = [{ name: "tester.json", raw: JSON.stringify(data) }];
  const result = mergeBrowserExports(report, files);
  assert.equal(result.trackingUpdates, 1);
  assert.equal(report.testcases[0].tracking.status, "fixed");
  assert.equal(report.testcases[0].history.length, 1);
  assert.deepEqual(report.versions[0].snap, data.versions[0].snap);
  assert.equal(report.sourceExports[0].raw, files[0].raw);
  const repeated = mergeBrowserExports(report, files);
  assert.equal(repeated.addedHistory, 0);
  assert.equal(repeated.addedVersions, 0);
  assert.equal(report.sourceExports.length, 1);
});
