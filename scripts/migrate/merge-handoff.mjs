// Merges the dashboard handoff bundle into this database.
//
//   node --env-file=.env scripts/migrate/merge-handoff.mjs <bundle.json> [options]
//     --dry-run            report the plan, write nothing
//     --with-projections   also write the findings/developers mirrors the
//                          handoff dashboard reads (see the warning below)
//
// The bundle is an `adigrams-mongodb-v1` export from the separate dashboard
// application. Its report data was built from the same four browser exports we
// merged, so testcases, team and versions overlap ours — and ours is the more
// complete copy, because the bundle was built from the truncated 5,000-byte
// vinay.json. This script therefore NEVER touches those three collections. It
// imports only what the bundle adds:
//
//   reportMetadata   provenance of the report the dashboard extracted
//   workflowRules    which automation rules are enabled
//   counters         last allocated task/bug number
//   sourceExports    the raw browser exports, archived by checksum
//
// plus the empty collections the dashboard expects to exist (tasks, bugs,
// recordOverrides, teamEdits, automationEvents).
//
// sourceExports is taken from our own Data/ directory rather than the bundle:
// three files are byte-identical, and our vinay.json is the complete 18,232-byte
// export where the bundle only has the truncated one.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { getDb, closeDb } from '../../src/db.js';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const PROJECTIONS = argv.includes('--with-projections');
const BUNDLE = argv.find((a) => !a.startsWith('--'));
const EXPORTS_DIR = process.env.EXPORTS_DIR || 'Data';

if (!BUNDLE || !fs.existsSync(BUNDLE)) {
  console.error('Usage: node --env-file=.env scripts/migrate/merge-handoff.mjs <bundle.json> [--dry-run] [--with-projections]');
  process.exit(1);
}

const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
if (bundle.format !== 'adigrams-mongodb-v1') {
  console.error(`Unexpected bundle format: ${bundle.format}`);
  process.exit(1);
}

const { report, store } = bundle.data;
const { testcases, team, versions = [], sourceExports = [], ...metadata } = report;

/* ---- what the bundle adds ------------------------------------------------ */

const reportMetadata = [{ _id: 'report', ...metadata, importedFrom: path.basename(BUNDLE) }];
const workflowRules = Object.entries(store.rules || {}).map(([k, enabled]) => ({ _id: k, enabled }));
const counters = ['task', 'bug'].map((kind) => ({
  _id: kind,
  value: Math.max(1000, store.counters?.[kind] || 0),
}));

// Our exports are authoritative; the bundle's vinay.json is the truncated one.
const ourExports = fs.existsSync(EXPORTS_DIR)
  ? fs.readdirSync(EXPORTS_DIR).filter((f) => f.endsWith('.json')).map((name) => {
    const raw = fs.readFileSync(path.join(EXPORTS_DIR, name), 'utf8');
    return {
      _id: crypto.createHash('sha256').update(raw).digest('hex'),
      name,
      sha256: crypto.createHash('sha256').update(raw).digest('hex'),
      complete: true,
      raw,
    };
  })
  : [];

const bundleBySha = new Map(sourceExports.map((e) => [e.sha256, e]));
const superseded = sourceExports.filter((e) => !ourExports.some((o) => o.sha256 === e.sha256));

/* ---- collections the dashboard expects to exist -------------------------- */
const EMPTY = ['tasks', 'bugs', 'recordOverrides', 'teamEdits', 'automationEvents'];

/* ---- optional mirrors ----------------------------------------------------
   The dashboard reads findings and developers as their own collections, where
   this database keeps findings inside testcases under kind:"finding" and the
   roster in team. Writing them duplicates data that already has a home, so two
   copies then have to be kept in step. Only do it if the dashboard has to run
   against this database, and treat the mirrors as read-only derivations. */

async function projections(db) {
  const cases = await db.collection('testcases').find({}).toArray();
  const roster = await db.collection('team').find({}).toArray();
  return {
    findings: cases.filter((r) => r.kind === 'finding').map(({ _id, ...r }) => ({ ...r, _id: r.caseId })),
    developers: roster.map(({ _id, ...r }) => ({ ...r, _id: r.memberKey })),
  };
}

try {
  console.log(`Bundle ${path.basename(BUNDLE)}  exported ${bundle.exportedAt}`);
  console.log(`  report data in bundle: ${testcases.length} testcases, ${team.length} team, ${versions.length} versions`);
  console.log('  -> not imported; this database already holds a more complete copy\n');
  console.log('Will import:');
  console.log(`  reportMetadata   ${reportMetadata.length}`);
  console.log(`  workflowRules    ${workflowRules.length}  (${workflowRules.filter((r) => r.enabled).length} enabled)`);
  console.log(`  counters         ${counters.length}  (${counters.map((c) => `${c._id}=${c.value}`).join(', ')})`);
  console.log(`  sourceExports    ${ourExports.length}  from ${EXPORTS_DIR}/`);
  for (const e of ourExports) {
    const inBundle = bundleBySha.has(e.sha256);
    console.log(`      ${e.name.padEnd(14)} ${String(e.raw.length).padStart(6)} bytes  ${inBundle ? 'matches bundle' : 'NEWER than bundle'}`);
  }
  for (const e of superseded) {
    console.log(`      superseded: ${e.name} (${String(e.raw || '').length} bytes, complete=${e.complete}) — not imported`);
  }
  console.log(`  empty collections ${EMPTY.join(', ')}`);
  if (PROJECTIONS) console.log('  plus findings/developers mirrors (--with-projections)');

  if (DRY) {
    console.log('\nDry run — no connection opened, nothing written.');
    process.exit(0);
  }

  const db = await getDb();

  const upsert = async (name, docs) => {
    if (!docs.length) return;
    await db.collection(name).bulkWrite(
      docs.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $set: d }, upsert: true } })),
      { ordered: false },
    );
    console.log(`  wrote ${String(docs.length).padStart(3)} -> ${name}`);
  };

  console.log();
  await upsert('reportMetadata', reportMetadata);
  await upsert('workflowRules', workflowRules);
  await upsert('counters', counters);
  await upsert('sourceExports', ourExports);
  await db.collection('sourceExports').createIndex({ name: 1 }, { name: 'name' });

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const name of EMPTY) {
    if (!existing.has(name)) { await db.createCollection(name); console.log(`  created empty  -> ${name}`); }
  }

  if (PROJECTIONS) {
    const p = await projections(db);
    await upsert('findings', p.findings);
    await upsert('developers', p.developers);
  }

  console.log('\nHandoff merge complete.');
} catch (err) {
  console.error('Handoff merge failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
