import fs from "node:fs";
import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { reportSchema } from "../src/lib/data.ts";
import { RULES } from "./workflow.mjs";
import { COLLECTIONS, documentsFor, ensureCollections, readDocuments, dataFrom } from "./mongo.mjs";

const digest = (data) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
export function createBundle(report, store) {
  store = {
    ...store,
    rules: { ...Object.fromEntries(RULES.map((rule) => [rule.id, true])), ...store.rules },
    counters: store.counters || { task: 1000, bug: 1000 },
  };
  const data = { report, store };
  const bundle = {
    format: "adigrams-mongodb-v1",
    exportedAt: new Date().toISOString(),
    sha256: digest(data),
    data,
  };
  validateBundle(bundle);
  return bundle;
}
export function validateBundle(bundle) {
  if (bundle.format !== "adigrams-mongodb-v1" || digest(bundle.data) !== bundle.sha256)
    throw new Error("Invalid migration bundle or checksum mismatch");
  const { report, store } = bundle.data;
  if (
    !Array.isArray(store.items) ||
    !Array.isArray(store.automation) ||
    !store.overrides ||
    !store.team ||
    !store.rules
  )
    throw new Error("Incomplete dashboard store");
  reportSchema.parse({ ...report, ...store, team: report.team, teamEdits: store.team });
  for (const value of Object.values(store.rules))
    if (typeof value !== "boolean") throw new Error("Invalid workflow rule");
  const documents = documentsFor(report, store);
  for (const [name, rows] of Object.entries(documents)) {
    if (new Set(rows.map((r) => r._id)).size !== rows.length)
      throw new Error(`Duplicate keys in ${name}`);
    if (
      rows.some(
        (r) =>
          typeof r._id !== "string" || ["__proto__", "constructor", "prototype"].includes(r._id),
      )
    )
      throw new Error(`Invalid key in ${name}`);
  }
  const recordIds = new Set(report.testcases.map((r) => r.caseId));
  const memberIds = new Set(report.team.map((r) => r.memberKey));
  if (
    Object.keys(store.overrides).some((id) => !recordIds.has(id)) ||
    Object.keys(store.team).some((id) => !memberIds.has(id))
  )
    throw new Error("Store contains orphaned overrides");
  return documents;
}

export async function importBundle(client, dbName, bundle) {
  const documents = validateBundle(bundle);
  const db = client.db(dbName);
  await ensureCollections(db);
  return client.withSession((session) =>
    session.withTransaction(
      async () => {
        const existing = await db
          .collection("reportMetadata")
          .findOne({ _id: "report" }, { session });
        if (existing?.bundleHash === bundle.sha256) return { alreadyImported: true };
        for (const name of COLLECTIONS) {
          if (await db.collection(name).findOne({}, { session }))
            throw new Error(
              "Target contains data. Import into a new database; existing work will not be overwritten.",
            );
        }
        documents.reportMetadata[0].bundleHash = bundle.sha256;
        documents.reportMetadata[0].revision = 0;
        const counts = {};
        for (const name of COLLECTIONS) {
          counts[name] = documents[name].length;
          if (counts[name]) await db.collection(name).insertMany(documents[name], { session });
        }
        return { alreadyImported: false, counts };
      },
      { writeConcern: { w: "majority" } },
    ),
  );
}

export async function exportDatabase(client, dbName) {
  return client.withSession((session) =>
    session.withTransaction(
      async () => {
        const data = dataFrom(await readDocuments(client.db(dbName), session));
        delete data.report.bundleHash;
        return createBundle(data.report, data.store);
      },
      { readConcern: { level: "snapshot" } },
    ),
  );
}

export function loadBundle(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export async function configuredClient() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in .env.local first.");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    return client;
  } catch {
    await client.close();
    throw new Error("Cannot connect to MongoDB. Check the URI, credentials, and network access.");
  }
}
