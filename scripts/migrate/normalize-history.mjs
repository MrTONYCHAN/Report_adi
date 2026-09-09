// One-off repair: normalises every history timestamp to UTC and drops the
// duplicates that the mixed formats created.
//
//   node --env-file=.env scripts/migrate/normalize-history.mjs [--dry-run]
//
// An earlier extract-source.mjs wrote the seed arrays' naive local stamps
// straight through, while merge-localstorage.mjs normalised the same events to
// UTC. $addToSet cannot tell "2026-09-06T13:02:00" and
// "2026-09-06T07:32:00.000Z" are one moment, so each seeded change was stored
// twice and the update log showed it twice.
//
// extract-source.mjs now normalises on the way in, so a fresh seed and merge
// will not reproduce this. Run it once against a database that was populated
// before that fix. It is idempotent: on already-clean data it changes nothing.

import process from 'node:process';
import { getDb, closeDb } from '../../src/db.js';

const DRY = process.argv.includes('--dry-run');

// Naive stamps came from machines in IST; override if that is not true.
const TZ = process.env.MERGE_TZ_OFFSET || '+05:30';
const zoned = /[Zz]$|[+-]\d{2}:?\d{2}$/;
const iso = (at) => {
  const s = String(at);
  const ms = Date.parse(zoned.test(s) ? s : s + TZ);
  if (Number.isNaN(ms)) throw new Error(`Unparseable timestamp: ${at}`);
  return new Date(ms).toISOString();
};

try {
  const db = await getDb();
  const tc = db.collection('testcases');
  const docs = await tc.find({ 'history.0': { $exists: true } }).toArray();

  const ops = [];
  let naive = 0;
  let removed = 0;

  for (const doc of docs) {
    const seen = new Set();
    const clean = [];

    // A UTC-stamped entry and its naive twin are the same event. Keeping the
    // first of each identity is enough; the stamp stored is normalised either
    // way, so which copy wins does not matter.
    for (const h of doc.history) {
      if (!zoned.test(String(h.at))) naive++;
      const at = iso(h.at);
      const key = [at, h.byMemberKey ?? h.byName, h.kind, h.field ?? '', h.from ?? '', h.to ?? ''].join('|');
      if (seen.has(key)) { removed++; continue; }
      seen.add(key);
      clean.push({ ...h, at });
    }

    clean.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));   // newest first

    const changed = clean.length !== doc.history.length
      || clean.some((h, i) => h.at !== doc.history[i].at);
    if (changed) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { history: clean } } } });
  }

  // tracking.at is written normalised by the merge, but a database seeded and
  // never merged still carries naive stamps there.
  const trackOps = [];
  for (const doc of await tc.find({ tracking: { $ne: null } }).toArray()) {
    if (zoned.test(String(doc.tracking.at))) continue;
    trackOps.push({
      updateOne: { filter: { _id: doc._id }, update: { $set: { 'tracking.at': iso(doc.tracking.at) } } },
    });
  }

  console.log(`documents with history   : ${docs.length}`);
  console.log(`  naive history stamps   : ${naive}`);
  console.log(`  duplicate entries      : ${removed}`);
  console.log(`  documents to rewrite   : ${ops.length}`);
  console.log(`  naive tracking stamps  : ${trackOps.length}`);

  if (DRY) {
    console.log('\nDry run — nothing written.');
    process.exit(0);
  }
  if (!ops.length && !trackOps.length) {
    console.log('\nAlready clean — nothing to do.');
    process.exit(0);
  }

  if (ops.length) await tc.bulkWrite(ops, { ordered: false });
  if (trackOps.length) await tc.bulkWrite(trackOps, { ordered: false });
  console.log('\nRepair complete.');
} catch (err) {
  console.error('Repair failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
