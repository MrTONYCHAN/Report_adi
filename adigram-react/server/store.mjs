import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The readiness report is read-only: it is the 5 Sep assessment plus the 6 Sep
   remediation pass, and rewriting it would destroy the record. Everything this
   dashboard adds — planned work, defects raised after the review, workflow
   transitions — lives beside it in a JSON overlay that the API merges on read.
   One file, so a single operator's board survives a restart without a database. */

const DEFAULT_FILE = fileURLToPath(new URL("./adigram-store.json", import.meta.url));

const EMPTY = { version: 1, items: [], overrides: {}, automation: [], rules: {}, team: {} };

function file() {
  return process.env.ADIGRAM_STORE ? path.resolve(process.env.ADIGRAM_STORE) : DEFAULT_FILE;
}

export function readStore() {
  const target = file();
  if (!fs.existsSync(target)) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      automation: Array.isArray(parsed.automation) ? parsed.automation : [],
      rules: parsed.rules && typeof parsed.rules === "object" ? parsed.rules : {},
      team: parsed.team && typeof parsed.team === "object" ? parsed.team : {},
    };
  } catch {
    // A corrupt overlay must not take the report down with it.
    return structuredClone(EMPTY);
  }
}

export function writeStore(store) {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Write-then-rename so a crash mid-write cannot leave a truncated board.
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, target);
  return store;
}

export function mutateStore(change) {
  const store = readStore();
  const result = change(store);
  writeStore(store);
  return result;
}

/* Ids are sequential per kind so they read like a tracker (TASK-1007, BUG-1003)
   rather than like opaque uuids the team would have to copy and paste. */
export function nextId(store, kind) {
  const prefix = kind === "bug" ? "BUG" : "TASK";
  const used = store.items
    .filter((i) => i.id.startsWith(`${prefix}-`))
    .map((i) => Number(i.id.slice(prefix.length + 1)))
    .filter(Number.isFinite);
  store.counters ??= {};
  const next = Math.max(1000, store.counters[kind] || 0, ...used) + 1;
  store.counters[kind] = next;
  return `${prefix}-${next}`;
}
