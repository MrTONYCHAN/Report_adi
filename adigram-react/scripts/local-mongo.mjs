import fs from "node:fs";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// A real MongoDB replica set using persistent WiredTiger files. This helper is
// for local development; Atlas or a managed replica set is used for shared hosting.
const dbPath = path.resolve(".mongo-data");
fs.mkdirSync(dbPath, { recursive: true });
const server = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: 27018, dbPath }],
  replSet: { count: 1, name: "adigrams", storageEngine: "wiredTiger", ip: "127.0.0.1" },
});
console.log("Local MongoDB ready: mongodb://127.0.0.1:27018/?replicaSet=adigrams");
console.log("Data directory:", dbPath);
async function stop() {
  await server.stop({ doCleanup: false });
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
