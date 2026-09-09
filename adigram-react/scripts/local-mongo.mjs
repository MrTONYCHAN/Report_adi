import path from "node:path";
import { startLocalDatabase } from "../server/local-database.mjs";

// A real MongoDB replica set using persistent WiredTiger files. This helper is
// for local development; Atlas or a managed replica set is used for shared hosting.
const dbPath = path.resolve(".mongo-data");
const server = await startLocalDatabase({ dbPath });
console.log("Local MongoDB ready: mongodb://127.0.0.1:27018/?replicaSet=adigrams");
console.log("Data directory:", dbPath);
async function stop() {
  await server.stop();
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
