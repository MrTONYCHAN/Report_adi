import fs from "node:fs";
import path from "node:path";
import { readReport } from "../server/report-source.mjs";
import {
  createBundle,
  validateBundle,
  importBundle,
  exportDatabase,
  loadBundle,
  configuredClient,
} from "../server/migration.mjs";
import { COLLECTIONS } from "../server/mongo.mjs";

const [command, argument] = process.argv.slice(2);
const target = path.resolve(argument || "migration-data.json");
let client;
try {
  if (command === "extract") {
    if (!process.env.REPORT_SOURCE)
      throw new Error("Set REPORT_SOURCE to the original report for this one-time extraction.");
    // Migration must fail on damaged input, even though the legacy runtime ignored it.
    const legacy =
      process.env.ADIGRAM_STORE || new URL("../server/adigram-store.json", import.meta.url);
    const store = {
      version: 1,
      items: [],
      overrides: {},
      team: {},
      automation: [],
      rules: {},
      ...(fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, "utf8")) : {}),
    };
    const bundle = createBundle(readReport(process.env.REPORT_SOURCE), store);
    fs.writeFileSync(target, JSON.stringify(bundle, null, 2), { flag: "wx" });
    console.log("Exported migration bundle:", target);
  } else if (command === "validate") {
    const docs = validateBundle(loadBundle(target));
    console.log(
      JSON.stringify(
        Object.fromEntries(Object.entries(docs).map(([name, rows]) => [name, rows.length])),
        null,
        2,
      ),
    );
  } else {
    client = await configuredClient();
    const dbName = process.env.MONGODB_DB || "adigrams_dashboard";
    if (command === "import")
      console.log(JSON.stringify(await importBundle(client, dbName, loadBundle(target)), null, 2));
    else if (command === "export") {
      fs.writeFileSync(target, JSON.stringify(await exportDatabase(client, dbName), null, 2), {
        flag: "wx",
      });
      console.log("Exported database bundle:", target);
    } else if (command === "check") {
      const db = client.db(dbName);
      await db.command({ ping: 1 });
      const counts = {};
      for (const name of COLLECTIONS) counts[name] = await db.collection(name).countDocuments();
      if (!counts.reportMetadata)
        throw new Error("MongoDB connected, but the database has not been imported.");
      console.log(JSON.stringify({ database: dbName, counts }, null, 2));
    } else throw new Error("Use extract, validate, import, export, or check");
  }
} catch (error) {
  // Driver errors may contain connection details; keep those out of shared logs.
  console.error(
    error.name?.startsWith("Mongo")
      ? "MongoDB operation failed. Check connectivity and replica-set configuration."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.close();
}
