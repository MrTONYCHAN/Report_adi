// Re-keys the collections the dashboard writes, to the identity scheme it uses.
//
//   node --env-file=.env scripts/migrate/rekey-for-dashboard.mjs [--dry-run]
//
// The migration in this repository gave every document an ObjectId _id and put
// a unique index on caseId. The dashboard instead uses the natural key as the
// _id - testcases and findings by case id, versions by sequence - and writes
// with replaceOne({ _id }, …, { upsert: true }). Against our documents that
// inserts a *second* row carrying the same caseId and trips the unique index:
//
//   E11000 duplicate key error … index: caseId_unique dup key: { caseId: "D1-01" }
//
// _id is immutable, so re-keying is an insert of the corrected document and a
// delete of the original. This also moves findings out of testcases: the
// dashboard keeps them in their own collection and writes only kind:"case"
// rows back to testcases, so leaving them there would strand them.
//
// Ordinary collections after this: testcases keyed by caseId holding the 50
// cases, findings keyed by caseId holding the 8, versions keyed by seq.

import process from 'node:process';
import { getDb, closeDb } from '../../src/db.js';

const DRY = process.argv.includes('--dry-run');

const plan = [];
const note = (line) => { plan.push(line); console.log(line); };

try {
  const db = await getDb();
  const testcases = db.collection('testcases');
  const findings = db.collection('findings');
  const versions = db.collection('versions');

  /* ---- guard: findings must already be safe in their own collection ------ */
  const inCases = await testcases.find({ kind: 'finding' }).toArray();
  const inFindings = await findings.find({}).toArray();
  const findingIds = new Set(inFindings.map((d) => d.caseId ?? d._id));
  const unmirrored = inCases.filter((d) => !findingIds.has(d.caseId));

  if (unmirrored.length) {
    console.error(
      `Refusing to continue: ${unmirrored.length} finding(s) in testcases have no row in `
      + `findings (${unmirrored.map((d) => d.caseId).join(', ')}).\n`
      + 'Run merge-handoff.mjs --with-projections first so nothing is dropped.',
    );
    process.exit(1);
  }
  note(`findings mirrored and safe to drop from testcases: ${inCases.length}`);

  /* ---- testcases: ObjectId -> caseId, cases only ------------------------- */
  const cases = await testcases.find({ kind: 'case' }).toArray();
  const needCaseRekey = cases.filter((d) => d._id !== d.caseId);
  note(`testcases  ${cases.length} cases, ${needCaseRekey.length} to re-key`);

  /* ---- versions: ObjectId -> String(seq) --------------------------------- */
  const vers = await versions.find({}).toArray();
  const needVerRekey = vers.filter((d) => d._id !== String(d.seq));
  note(`versions   ${vers.length} total, ${needVerRekey.length} to re-key`);

  if (DRY) {
    console.log('\nDry run - nothing written.');
    process.exit(0);
  }

  /* The unique index on caseId is what makes the old and new rows collide, so
     each document is deleted before its replacement goes in. One document at a
     time: a crash then leaves the rest untouched rather than half a collection
     without its index guarantee. */
  let moved = 0;
  for (const doc of needCaseRekey) {
    const { _id, ...rest } = doc;
    await testcases.deleteOne({ _id });
    await testcases.insertOne({ _id: rest.caseId, ...rest });
    moved++;
  }
  note(`re-keyed ${moved} testcase(s)`);

  const dropped = await testcases.deleteMany({ kind: 'finding' });
  note(`dropped ${dropped.deletedCount} finding(s) from testcases`);

  let movedV = 0;
  for (const doc of needVerRekey) {
    const { _id, ...rest } = doc;
    await versions.deleteOne({ _id });
    await versions.insertOne({ _id: String(rest.seq), ...rest });
    movedV++;
  }
  note(`re-keyed ${movedV} version(s)`);

  // caseId is now the _id, so the separate unique index is redundant; leaving
  // it would re-create the very collision this script exists to remove the
  // moment the dashboard upserts a case.
  const indexes = await testcases.indexes();
  if (indexes.some((i) => i.name === 'caseId_unique')) {
    await testcases.dropIndex('caseId_unique');
    note('dropped the now-redundant caseId_unique index');
  }
  const vIndexes = await versions.indexes();
  if (vIndexes.some((i) => i.name === 'seq_unique')) {
    await versions.dropIndex('seq_unique');
    note('dropped the now-redundant seq_unique index');
  }

  console.log('\nRe-key complete.');
} catch (err) {
  console.error('Re-key failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
