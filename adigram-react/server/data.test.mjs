import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReport } from "./report-source.mjs";
import { dashboardApi } from "./api.mjs";
import { deriveDashboard, reportSchema } from "../src/lib/report.ts";

function report(verdict = "FAIL") {
  return `<tr data-s="${verdict}"><td class="id">D1-01</td><td>Source title</td><td>Source finding</td><td class="st">status</td></tr>
var SEED = [
    ];
var SEED_BY = "Reviewer";
var SEED_SLOT = "Remediation";
var DEFAULT_TEAM = [
{ key: "dev1", slot: "Developer 1", area: "Source area", name: "Engineer" }
    ];`;
}
function withSource(fn) {
  const dir = mkdtempSync(join(tmpdir(), "adigram-source-"));
  try {
    return fn(join(dir, "report.html"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("published report keeps current attribution separate from historical updates", () =>
  withSource((file) => {
    const source = report().replace(
      /var SEED = [\s\S]*/,
      `var DEFAULT_TEAM = [
      { key: "dev1",  slot: "Developer 1", area: "Source area", name: "Engineer" },
      { key: "rem", slot: "Remediation", area: "Review", name: "Reviewer" }
    ];
    var SEED_ROWS = [
      /* The owner signed off after the original remediation. */
      { id: "D1-01", s: "fixed", by: "Engineer", slot: "Developer 1", at: "2026-09-07T11:00:00" }
    ];
    var SEED_LOG = [
      { at: "2026-09-06T10:00:00", id: "D1-01", to: "prog" },
      { at: "2026-09-07T11:00:00", id: "D1-01", to: "fixed", by: "Engineer", slot: "Developer 1" }
    ];`,
    );
    writeFileSync(file, source);
    const parsed = reportSchema.parse(readReport(file));
    assert.equal(parsed.team.length, 2);
    assert.equal(parsed.testcases[0].tracking.byMemberKey, "dev1");
    assert.equal(parsed.testcases[0].tracking.status, "fixed");
    assert.deepEqual(
      parsed.testcases[0].history.map((event) => [event.to, event.byMemberKey]),
      [
        ["prog", "rem"],
        ["fixed", "dev1"],
      ],
    );
    writeFileSync(file, source.replace('id: "D1-01", to: "prog"', 'id: "D9-99", to: "prog"'));
    assert.throws(() => readReport(file), /orphaned tracking updates/);
  }));
test("runtime reads reflect changed source records and derived totals", () =>
  withSource((file) => {
    writeFileSync(file, report());
    const first = deriveDashboard(reportSchema.parse(readReport(file)), (text) => text);
    assert.equal(first.totals.failed, 1);
    assert.equal(first.totals.openTasks, 1);
    assert.equal(first.tasks[0].progress, null);
    assert.equal(first.tasks[0].assignee, "Unassigned");
    writeFileSync(file, report("PASS"));
    const second = deriveDashboard(reportSchema.parse(readReport(file)), (text) => text);
    assert.equal(second.totals.failed, 0);
    assert.equal(second.totals.passed, 1);
    assert.equal(second.totals.openTasks, 0);
    assert.equal(second.workstreams[0].pass, 1);
    assert.deepEqual(second.readinessTrend, []);
    assert.deepEqual(second.burndown, []);
  }));
test("tracking does not overwrite the original assessment; contributor is not assignee", () =>
  withSource((file) => {
    writeFileSync(file, report());
    const raw = reportSchema.parse(readReport(file));
    raw.testcases[0].tracking = {
      status: "ver",
      byMemberKey: "dev1",
      byName: "Engineer",
      at: "2026-09-07T12:00:00Z",
    };
    raw.testcases[0].history = [
      {
        kind: "status",
        to: "ver",
        byMemberKey: "dev1",
        byName: "Engineer",
        at: "2026-09-07T12:00:00Z",
      },
    ];
    const data = deriveDashboard(raw, (text) => text);
    assert.equal(data.totals.failed, 1);
    assert.equal(data.tasks[0].status, "done");
    assert.equal(data.tasks[0].progress, 100);
    assert.equal(data.tasks[0].assignee, "Unassigned");
    assert.equal(data.developers[0].resolved, 1);
    assert.equal(data.developers[0].load, 100);
    assert.equal(data.activity.length, 1);
  }));
test("API has no fixture fallback and does not disclose connection details on failure", async () => {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader: (key, value) => (headers[key] = value),
    end(body) {
      this.body = body;
    },
  };
  await dashboardApi({
    repository: {
      run: async () => {
        throw new Error("mongodb://private:secret@host");
      },
    },
  })({ url: "/api/dashboard", method: "GET" }, res, () => assert.fail("unexpected fallthrough"));
  assert.equal(res.statusCode, 503);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.ok(!res.body.includes("private:secret"));
  assert.ok(!res.body.includes("testcases"));
});
test("malformed API records are rejected instead of displaying made-up totals", () => {
  assert.equal(reportSchema.safeParse({ team: [], testcases: [{}] }).success, false);
});

test("test-case workspace saves all groups and rows in one request", async () => {
  const data = {
    report: {
      source: "Test report",
      sourceUpdatedAt: "2026-09-11T00:00:00Z",
      team: [],
      testcases: [],
    },
    store: {
      items: [],
      overrides: {},
      automation: [],
      team: {},
      rules: {},
      testCaseWorkspace: null,
    },
  };
  const api = dashboardApi({ repository: { run: async (action) => action(data) } });
  const response = () => ({
    statusCode: 200,
    setHeader() {},
    end(value) {
      this.body = JSON.parse(value);
    },
  });
  const res = response();
  await api(
    {
      url: "/api/test-cases",
      method: "PUT",
      body: {
        groups: [
          {
            id: "D1",
            name: "Auth, RBAC and scope",
            date: "2026-09-11",
            rows: [
              {
                id: "D1-01",
                name: "Authentication works",
                status: "pass",
                defectStatus: "verified",
                owner: "Tester",
                updated: "2026-09-11",
              },
            ],
          },
        ],
      },
    },
    res,
    () => assert.fail("unexpected fallthrough"),
  );
  assert.equal(res.statusCode, 200);
  assert.equal(data.store.testCaseWorkspace.groups[0].rows[0].id, "D1-01");
  assert.ok(data.store.testCaseWorkspace.updatedAt);
});

test("developers can be added, edited and removed without rewriting the report roster", async () => {
  const data = {
    report: {
      source: "Test report",
      sourceUpdatedAt: "2026-09-11T00:00:00Z",
      team: [
        {
          memberKey: "report-dev",
          name: "Report developer",
          slot: "Developer",
          area: "D1",
          active: true,
        },
      ],
      testcases: [],
    },
    store: {
      items: [],
      overrides: {},
      automation: [],
      team: {},
      teamAdded: {},
      teamRemoved: {},
      rules: {},
      testCaseWorkspace: null,
    },
  };
  const api = dashboardApi({ repository: { run: async (action) => action(data) } });
  const request = async (url, method, body) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await api({ url, method, body }, res, () => assert.fail("unexpected fallthrough"));
    return res;
  };

  const added = await request("/api/team", "POST", {
    name: "New developer",
    role: "Engineer",
    workstream: "D2",
  });
  assert.equal(added.statusCode, 201);
  assert.equal(Object.keys(data.store.teamAdded).length, 1);
  assert.equal(
    (await request(`/api/team/${added.body.id}`, "PATCH", { role: "Lead engineer" })).statusCode,
    200,
  );
  assert.equal(data.store.teamAdded[added.body.id].role, "Lead engineer");
  assert.equal((await request(`/api/team/${added.body.id}`, "DELETE")).statusCode, 200);
  assert.equal(Object.keys(data.store.teamAdded).length, 0);
  assert.equal((await request("/api/team/report-dev", "DELETE")).statusCode, 200);
  assert.equal(data.store.teamRemoved["report-dev"], true);
  assert.equal(data.report.team[0].name, "Report developer");
});
