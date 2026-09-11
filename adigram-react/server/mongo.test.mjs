import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createBundle, importBundle, exportDatabase } from "./migration.mjs";
import { createMongoRepository } from "./mongo.mjs";
import { dashboardApi } from "./api.mjs";
import { reportSchema } from "../src/lib/data.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalDatabase } from "./local-database.mjs";

test("local MongoDB data survives a clean stop and restart", { timeout: 120000 }, async () => {
  const dbPath = mkdtempSync(join(tmpdir(), "adigrams-persistence-test-"));
  let server;
  let client;
  try {
    server = await startLocalDatabase({ dbPath, port: 0, name: "persistence" });
    const port = new URL(server.uri).port;
    client = new MongoClient(server.uri);
    await client.db("persistence_test").collection("probe").insertOne({ _id: "saved", value: 42 });
    await client.close();
    await server.stop();
    server = await startLocalDatabase({ dbPath, port: Number(port), name: "persistence" });
    client = new MongoClient(server.uri);
    assert.equal(
      (await client.db("persistence_test").collection("probe").findOne({ _id: "saved" })).value,
      42,
    );
  } finally {
    if (client) await client.close();
    if (server) await server.stop();
    rmSync(dbPath, { recursive: true, force: true });
  }
});

test(
  "MongoDB migration, API persistence, concurrency and portable export",
  { timeout: 120000 },
  async (t) => {
    const server = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    const uri = server.getUri();
    const client = new MongoClient(uri);
    await client.connect();
    const repository = createMongoRepository({ uri, dbName: "migration_test" });
    const api = dashboardApi({ repository });
    const web = http.createServer((req, res) =>
      api(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
    );
    web.listen(0, "127.0.0.1");
    await once(web, "listening");
    const url = `http://127.0.0.1:${web.address().port}`;
    const request = async (route, method = "GET", data) => {
      const response = await fetch(url + route, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    };
    const report = {
      source: "Test report",
      sourceUpdatedAt: "2026-09-07T10:00:00Z",
      versions: [],
      team: [
        {
          memberKey: "d1",
          name: "Tester",
          slot: "Developer 1",
          area: "Testing",
          order: 0,
          active: true,
        },
      ],
      testcases: [
        {
          caseId: "D1-01",
          kind: "case",
          workstream: "D1",
          verdict: "FAIL",
          original: { title: "Test case", finding: "Test finding" },
          tracking: null,
          history: [],
          addedAt: null,
        },
      ],
    };
    const store = { version: 1, items: [], overrides: {}, team: {}, automation: [], rules: {} };
    const bundle = createBundle(report, store);
    try {
      await t.test("empty database fails closed, import initializes all collections", async () => {
        assert.equal((await request("/api/dashboard")).status, 503);
        const imported = await importBundle(client, "migration_test", bundle);
        assert.equal(imported.counts.testcases, 1);
        const response = await request("/api/dashboard");
        assert.equal(response.status, 200);
        assert.equal(reportSchema.parse(response.body).team.length, 1);
      });
      await t.test("simultaneous creates have unique IDs and survive reconnect", async () => {
        const results = await Promise.all(
          Array.from({ length: 6 }, (_, i) =>
            request("/api/items", "POST", { title: `Task ${i}`, kind: "task" }),
          ),
        );
        assert.ok(results.every((r) => r.status === 201));
        assert.equal(new Set(results.map((r) => r.body.item.id)).size, 6);
        assert.equal(await client.db("migration_test").collection("tasks").countDocuments(), 6);
        const fresh = createMongoRepository({ uri, dbName: "migration_test" });
        try {
          assert.equal(await fresh.run(({ store }) => store.items.length), 6);
        } finally {
          await fresh.close();
        }
      });
      await t.test("edits, defects, roster changes and report overrides persist", async () => {
        const bug = await request("/api/items", "POST", { title: "Test defect", kind: "bug" });
        assert.equal(
          (await request(`/api/items/${bug.body.item.id}`, "PATCH", { status: "in-progress" }))
            .status,
          200,
        );
        assert.equal(
          (await request(`/api/items/${bug.body.item.id}`, "PATCH", { status: "closed" })).status,
          409,
        );
        assert.equal(
          (await request("/api/team/d1", "PATCH", { name: "Updated tester" })).status,
          200,
        );
        assert.equal(
          (await request("/api/records/D1-01", "PATCH", { status: "in-progress", kind: "task" }))
            .status,
          200,
        );
        assert.equal(
          (await request("/api/records/D9-99", "PATCH", { status: "todo" })).status,
          404,
        );
        const data = (await request("/api/dashboard")).body;
        assert.equal(data.teamEdits.d1.name, "Updated tester");
        assert.equal(data.overrides["D1-01"].status, "in-progress");
        assert.equal(data.items.find((i) => i.kind === "bug").status, "in-progress");
        assert.ok(data.automation.length > 0);
      });
      await t.test("test-case workstreams and rows save as one editable workspace", async () => {
        const workspace = {
          groups: [
            {
              id: "D1",
              name: "Auth and scope",
              date: "2026-09-11",
              rows: [
                {
                  id: "D1-01",
                  name: "Edited test case",
                  status: "pass",
                  defectStatus: "verified",
                  owner: "Tester",
                  updated: "2026-09-11",
                },
                {
                  id: "D1-02",
                  name: "Added test case",
                  status: "not-run",
                  defectStatus: "untracked",
                  owner: "",
                  updated: null,
                },
              ],
            },
          ],
        };
        assert.equal((await request("/api/test-cases", "PUT", workspace)).status, 200);
        const data = (await request("/api/dashboard")).body;
        assert.equal(data.testCaseWorkspace.groups[0].name, "Auth and scope");
        assert.equal(data.testCaseWorkspace.groups[0].rows.length, 2);
        const fresh = createMongoRepository({ uri, dbName: "migration_test" });
        try {
          assert.equal(
            await fresh.run(({ store }) => store.testCaseWorkspace.groups[0].rows[1].id),
            "D1-02",
          );
        } finally {
          await fresh.close();
        }
      });
      await t.test(
        "failed transaction rolls back and repeated import preserves edits",
        async () => {
          await assert.rejects(
            repository.run(({ store }) => {
              store.items.length = 0;
              throw new Error("rollback");
            }),
            /rollback/,
          );
          assert.equal(
            (await importBundle(client, "migration_test", bundle)).alreadyImported,
            true,
          );
          assert.equal(await client.db("migration_test").collection("tasks").countDocuments(), 6);
          await assert.rejects(
            importBundle(
              client,
              "migration_test",
              createBundle({ ...report, source: "Different report" }, store),
            ),
            /Target contains data/,
          );
        },
      );
      await t.test("friend can import an exported database with all changes", async () => {
        const exported = await exportDatabase(client, "migration_test");
        const result = await importBundle(client, "friend_test", exported);
        assert.equal(result.counts.tasks, 6);
        assert.equal(result.counts.bugs, 1);
        assert.equal(result.counts.teamEdits, 1);
        const restored = await exportDatabase(client, "friend_test");
        assert.deepEqual(restored.data, exported.data);
        const bad = structuredClone(exported);
        bad.data.report.source = "Tampered";
        await assert.rejects(importBundle(client, "tampered_test", bad), /checksum/);
      });
      await t.test("delete persists without altering other items", async () => {
        const data = (await request("/api/dashboard")).body;
        const item = data.items.find((i) => i.kind === "task");
        assert.equal((await request(`/api/items/${item.id}`, "DELETE")).status, 200);
        assert.equal(await client.db("migration_test").collection("tasks").countDocuments(), 5);
        assert.equal(await client.db("migration_test").collection("bugs").countDocuments(), 1);
      });
    } finally {
      await new Promise((resolve) => web.close(resolve));
      await repository.close();
      await client.close();
      await server.stop();
    }
  },
);
