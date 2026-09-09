import { MongoClient } from "mongodb";
import { isDeepStrictEqual } from "node:util";
import dns from "node:dns";

/* mongodb+srv:// needs an SRV lookup, and Node resolves that with its own
   resolver rather than the OS stub. On a machine where Node inherits only
   127.0.0.1, with nothing listening there, the lookup fails with ECONNREFUSED
   even though the operating system resolves the record fine. Point it at real
   resolvers when that is all we have.

   Never on a managed platform: Vercel's resolver is the one that can reach the
   cluster, and replacing it with a public pair breaks resolution rather than
   fixing it. MONGODB_DNS_SERVERS overrides the default pair. */
const dnsOverride = (process.env.MONGODB_DNS_SERVERS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const onlyLoopback = dns
  .getServers()
  .every((server) => server.startsWith("127.") || server === "::1");
if (!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
  if (dnsOverride.length) dns.setServers(dnsOverride);
  else if (onlyLoopback) dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

export const COLLECTIONS = [
  "reportMetadata",
  "testcases",
  "findings",
  "developers",
  "tasks",
  "bugs",
  "recordOverrides",
  "teamEdits",
  "automationEvents",
  "workflowRules",
  "versions",
  "counters",
  "sourceExports",
];

export function documentsFor(report, store) {
  const { testcases, team, versions = [], sourceExports = [], ...metadata } = report;
  return {
    reportMetadata: [{ ...metadata, _id: "report" }],
    testcases: testcases.filter((r) => r.kind === "case").map((r) => ({ ...r, _id: r.caseId })),
    findings: testcases.filter((r) => r.kind === "finding").map((r) => ({ ...r, _id: r.caseId })),
    developers: team.map((r) => ({ ...r, _id: r.memberKey })),
    tasks: store.items.filter((r) => r.kind === "task").map((r) => ({ ...r, _id: r.id })),
    bugs: store.items.filter((r) => r.kind === "bug").map((r) => ({ ...r, _id: r.id })),
    recordOverrides: Object.entries(store.overrides).map(([key, value]) => ({
      ...value,
      _id: key,
    })),
    teamEdits: Object.entries(store.team).map(([key, value]) => ({ ...value, _id: key })),
    automationEvents: store.automation.map((value, i) => ({ ...value, _id: String(i), order: i })),
    workflowRules: Object.entries(store.rules).map(([key, enabled]) => ({ _id: key, enabled })),
    versions: versions.map((value, i) => ({ ...value, _id: String(value.seq ?? i) })),
    sourceExports: sourceExports.map((value) => ({ ...value, _id: value.sha256 })),
    counters: ["task", "bug"].map((kind) => ({
      _id: kind,
      value: Math.max(
        1000,
        store.counters?.[kind] || 0,
        ...store.items
          .filter((item) => item.kind === kind)
          .map((item) => Number(item.id.split("-").at(-1)) || 0),
      ),
    })),
  };
}

const clean = ({ _id, ...value }) => value;
export function dataFrom(documents) {
  const metadata = documents.reportMetadata.find((r) => r._id === "report");
  if (!metadata) throw new Error("Database is not initialized. Run db:import first.");
  const { revision, ...info } = clean(metadata);
  return {
    report: {
      ...info,
      // report_adi keeps findings inside testcases under kind:"finding" and
      // mirrors them into findings as well, so take only the cases from here or
      // every finding arrives twice. A no-op against a database this app
      // imported itself, where testcases holds cases alone.
      testcases: [
        ...documents.testcases.filter((r) => r.kind !== "finding"),
        ...documents.findings,
      ].map(clean),
      team: documents.developers.map(clean).sort((a, b) => a.order - b.order),
      versions: documents.versions.map(clean),
      sourceExports: documents.sourceExports.map(clean),
    },
    store: {
      version: 1,
      items: [...documents.tasks, ...documents.bugs].map(clean),
      overrides: Object.fromEntries(documents.recordOverrides.map((r) => [r._id, clean(r)])),
      team: Object.fromEntries(documents.teamEdits.map((r) => [r._id, clean(r)])),
      automation: documents.automationEvents
        .sort((a, b) => a.order - b.order)
        .map(({ _id, order, ...r }) => r),
      rules: Object.fromEntries(documents.workflowRules.map((r) => [r._id, r.enabled])),
      counters: Object.fromEntries(documents.counters.map((r) => [r._id, r.value])),
    },
  };
}

export async function ensureCollections(db) {
  const names = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of COLLECTIONS) if (!names.has(name)) await db.createCollection(name);
  for (const name of ["testcases", "findings"]) {
    await db.collection(name).createIndex({ caseId: 1 }, { unique: true });
    await db.collection(name).createIndex({ workstream: 1 });
  }
  await db.collection("developers").createIndex({ memberKey: 1 }, { unique: true });
  for (const name of ["tasks", "bugs"]) {
    await db.collection(name).createIndex({ id: 1 }, { unique: true });
    await db.collection(name).createIndex({ status: 1, dueDate: 1 });
    await db.collection(name).createIndex({ assignee: 1 });
  }
}

export async function readDocuments(db, session) {
  const documents = {};
  // MongoDB sessions must execute transaction operations sequentially.
  for (const name of COLLECTIONS)
    documents[name] = await db.collection(name).find({}, { session }).toArray();
  return documents;
}

export function createMongoRepository(options = {}) {
  let client;
  async function connect() {
    if (!client) {
      const uri = options.uri || process.env.MONGODB_URI;
      if (!uri) throw new Error("MONGODB_URI is not configured");
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, ignoreUndefined: true });
    }
    await client.connect();
    return client.db(options.dbName || process.env.MONGODB_DB || "adigrams_dashboard");
  }
  return {
    async run(action) {
      const db = await connect();
      return client.withSession((session) =>
        session.withTransaction(
          async () => {
            // One revision lock serializes writers across processes and makes retries
            // reload current state, preventing lost edits and duplicate item IDs.
            const lock = await db
              .collection("reportMetadata")
              .updateOne({ _id: "report" }, { $inc: { revision: 1 } }, { session });
            if (!lock.matchedCount)
              throw new Error("Database is not initialized. Run db:import first.");
            const before = await readDocuments(db, session);
            const data = dataFrom(before);
            const result = await action(data);
            const after = documentsFor(data.report, data.store);
            for (const name of COLLECTIONS.filter((name) => name !== "reportMetadata")) {
              const old = new Map(before[name].map((r) => [r._id, r]));
              const current = new Map(after[name].map((r) => [r._id, r]));
              for (const [id, value] of current) {
                if (!isDeepStrictEqual(old.get(id), value))
                  await db
                    .collection(name)
                    .replaceOne({ _id: id }, value, { session, upsert: true });
              }
              for (const id of old.keys()) {
                if (!current.has(id)) await db.collection(name).deleteOne({ _id: id }, { session });
              }
            }
            return result;
          },
          { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
        ),
      );
    },
    async close() {
      if (client) await client.close();
    },
  };
}
