// Creates the three collections, their indexes, and loads the extracted source
// data into them.
//
//   node --env-file=.env scripts/migrate/seed-mongo.mjs [--dry-run] [--force]
//
// Idempotent by construction: testcases and team are upserted on their natural
// keys, so re-running after a source change updates rows rather than doubling
// them. It refuses to run against a database that already holds tracking work
// unless --force is given, because a re-seed resets tracking to the 6 September
// baseline and would discard anything recorded since.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getDb, closeDb } from '../../src/db.js';

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const DATA = path.join(process.cwd(), 'scripts/migrate/source-data.json');

if (!fs.existsSync(DATA)) {
  console.error(`${DATA} not found. Run scripts/migrate/extract-source.mjs first.`);
  process.exit(1);
}
const { team, testcases, extractedAt, source } = JSON.parse(fs.readFileSync(DATA, 'utf8'));

// A dry run reports what would be written and never opens a connection, so the
// plan can be checked from a machine that cannot reach the cluster.
if (DRY) {
  const cases = testcases.filter((d) => d.kind === 'case').length;
  const findings = testcases.length - cases;
  const seeded = testcases.filter((d) => d.tracking).length;
  console.log(`Source extracted ${extractedAt}`);
  console.log(`  from ${source}`);
  console.log('\nWould upsert:');
  console.log(`  team        ${team.length} members  (${team.map((t) => t.slot).join(' | ')})`);
  console.log(`  testcases   ${testcases.length}  (${cases} cases, ${findings} findings)`);
  console.log(`  tracking    ${seeded} cases carrying the 6 Sep remediation`);
  console.log('  versions    0  (none exist until someone clicks Save version)');
  console.log('\nDry run — no connection opened, nothing written.');
  process.exit(0);
}

try {
  const db = await getDb();
  console.log(`Database "${db.databaseName}"  (source extracted ${extractedAt})`);
  console.log(`  from ${source}`);

  /* ---- guard ------------------------------------------------------------
     Anything with tracking beyond the seeded pass or any saved version means
     real work is in here, and a re-seed would reset it to the 6 Sep baseline. */
  const existingVersions = await db.collection('versions').countDocuments();
  const tracked = await db.collection('testcases').countDocuments({ tracking: { $ne: null } });
  if ((existingVersions || tracked) && !FORCE) {
    console.error(
      `\nRefusing to seed: the database already holds ${tracked} tracked case(s) ` +
      `and ${existingVersions} saved version(s).\n` +
      'Re-seeding resets tracking to the 6 September baseline. Pass --force if ' +
      'that is what you want, or --dry-run to see the plan.');
    process.exit(1);
  }

  /* ---- indexes ---------------------------------------------------------- */
  await db.collection('team').createIndexes([
    { key: { memberKey: 1 }, unique: true, name: 'memberKey_unique' },
    { key: { order: 1 }, name: 'order' },
  ]);
  await db.collection('testcases').createIndexes([
    { key: { caseId: 1 }, unique: true, name: 'caseId_unique' },
    // Serves both the per-workstream render and the max(seq)+1 id allocation.
    { key: { kind: 1, workstream: 1, seq: -1 }, name: 'kind_workstream_seq' },
    { key: { 'history.at': -1 }, name: 'history_at' },
  ]);
  await db.collection('versions').createIndexes([
    // Unique so two concurrent saves cannot both claim the same number; the
    // loser retries rather than silently overwriting.
    { key: { seq: 1 }, unique: true, name: 'seq_unique' },
    { key: { at: -1 }, name: 'at' },
  ]);
  console.log('  indexes     created');

  /* ---- team ------------------------------------------------------------- */
  const now = new Date();
  const teamOps = team.map((m) => ({
    updateOne: {
      filter: { memberKey: m.memberKey },
      update: {
        $set: { slot: m.slot, area: m.area, order: m.order, active: m.active, updatedAt: now },
        // A name typed since the last seed is the team's, not the source's.
        $setOnInsert: { memberKey: m.memberKey, name: m.name, createdAt: now },
      },
      upsert: true,
    },
  }));
  const t = await db.collection('team').bulkWrite(teamOps, { ordered: false });
  console.log(`  team        ${t.upsertedCount} inserted, ${t.modifiedCount} updated`);

  /* ---- testcases --------------------------------------------------------
     original, verdict and severity are the source's to own and are always
     refreshed. tracking, edits and history belong to the team and are only
     written when the document is first created, so a re-seed after a wording
     fix does not wipe anyone's work. */
  const caseOps = testcases.map((d) => {
    const set = {
      kind: d.kind,
      workstream: d.workstream,
      seq: d.seq,
      original: d.original,
      updatedAt: now,
    };
    if (d.kind === 'case') set.verdict = d.verdict;
    else set.severity = d.severity;

    return {
      updateOne: {
        filter: { caseId: d.caseId },
        update: {
          $set: set,
          $setOnInsert: {
            caseId: d.caseId,
            edits: d.edits,
            tracking: d.tracking,
            history: d.history,
            addedAt: d.addedAt,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });
  const c = await db.collection('testcases').bulkWrite(caseOps, { ordered: false });
  console.log(`  testcases   ${c.upsertedCount} inserted, ${c.modifiedCount} updated`);

  const seeded = await db.collection('testcases').countDocuments({ tracking: { $ne: null } });
  console.log(`  tracking    ${seeded} cases carry the 6 Sep remediation`);
  console.log('\nSeed complete.');
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
