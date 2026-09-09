// Second pass: folds each person's browser-local tracking into the shared
// database. Run AFTER seed-mongo.mjs.
//
//   node --env-file=.env scripts/migrate/merge-localstorage.mjs <dir> [--dry-run]
//
// <dir> holds one .json file per person, each the raw value of the page's
// localStorage key. Each of them runs this once in the console on the report
// page and sends you the result, named after themselves (vinay.json):
//
//   copy(localStorage.getItem("adigrams-golive-readiness-v3"))
//
// Collect these BEFORE cutting the page over to the database. Once it reads
// from Mongo the key is never read again and this history is stranded.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getDb, closeDb } from '../../src/db.js';

const DRY = process.argv.includes('--dry-run');
const DIR = process.argv.slice(2).find((a) => a !== '--dry-run');

if (!DIR || !fs.existsSync(DIR)) {
  console.error('Usage: node --env-file=.env scripts/migrate/merge-localstorage.mjs <dir> [--dry-run]');
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.error(`No .json exports in ${DIR}`);
  process.exit(1);
}

// A blob may be double-encoded: localStorage.getItem returns a string, and
// copy() of a string in some consoles wraps it in quotes again.
function parseBlob(raw) {
  let v = JSON.parse(raw);
  if (typeof v === 'string') v = JSON.parse(v);
  return v;
}

const blobs = files.map((f) => ({
  who: path.basename(f, '.json'),
  store: parseBlob(fs.readFileSync(path.join(DIR, f), 'utf8')),
}));

const newer = (a, b) => !a || String(b.at) > String(a.at);   // ISO strings sort correctly

try {
  // A dry run never opens a connection, so the merge plan — especially the
  // version renumbering — can be reviewed from a machine that cannot reach the
  // cluster. With no roster to match against, everyone reads as a new member.
  const db = DRY ? null : await getDb();
  const roster = db ? await db.collection('team').find({}).toArray() : [];

  /* ---- resolve a person to a roster row ---------------------------------
     Matched on name, never on slot: slots collide (removing Developer 3 and
     adding one produces a second "Developer 4"), names identify a person. */
  const byName = new Map(roster.map((m) => [(m.name || '').trim().toUpperCase(), m]));
  const pending = [];
  const resolve = (name, slot, area) => {
    const key = (name || '').trim().toUpperCase();
    if (!key) return null;
    if (byName.has(key)) return byName.get(key);
    const member = {
      memberKey: `d${Date.now().toString(36)}${pending.length}`,
      slot: slot || 'Developer',
      area: area || '—',
      name: name.trim(),
      order: roster.length + pending.length,
      active: true,
    };
    byName.set(key, member);
    pending.push(member);
    return member;
  };

  for (const { store } of blobs) {
    for (const m of store.team || []) if (m.name && m.name.trim()) resolve(m.name, m.slot, m.area);
  }

  /* ---- tracking, edits and history --------------------------------------
     tracking and edits are last-write-wins on their own timestamp — with one
     person per case in practice, conflicts are rare and the later click is the
     one that meant it. History entries are immutable events, so they union;
     the dedupe key is what makes re-running this safe. */
  const tracking = new Map();
  const edits = new Map();
  const history = new Map();

  for (const { store } of blobs) {
    for (const [caseId, r] of Object.entries(store.rows || {})) {
      const m = resolve(r.by, r.slot);
      if (!m) continue;
      const rec = { status: r.s, byMemberKey: m.memberKey, byName: m.name, bySlot: r.slot, at: r.at };
      if (newer(tracking.get(caseId), rec)) tracking.set(caseId, rec);
    }

    for (const [caseId, t] of Object.entries(store.text || {})) {
      const m = resolve(t.by, t.slot);
      if (!m) continue;
      const rec = { byMemberKey: m.memberKey, byName: m.name, bySlot: t.slot, at: t.at };
      if (t.title !== undefined) rec.title = t.title;
      if (t.finding !== undefined) rec.finding = t.finding;
      if (newer(edits.get(caseId), rec)) edits.set(caseId, rec);
    }

    for (const e of store.log || []) {
      const m = resolve(e.by, e.slot);
      if (!m) continue;
      const entry = e.kind === 'text'
        ? { kind: 'text', field: e.field, at: e.at, byMemberKey: m.memberKey, byName: m.name, bySlot: e.slot }
        : { kind: 'status', from: e.from, to: e.to, at: e.at, byMemberKey: m.memberKey, byName: m.name, bySlot: e.slot };
      const dedupe = `${e.id}|${e.at}|${m.memberKey}|${entry.kind}|${e.field || ''}|${e.to || ''}`;
      if (!history.has(dedupe)) history.set(dedupe, { caseId: e.id, entry });
    }
  }

  /* ---- versions ---------------------------------------------------------
     Every browser numbered its own v1.0, v1.1 … independently, so the numbers
     collide across people and mean nothing together. Order every snapshot by
     when it was actually saved and renumber into one sequence. */
  const allVersions = blobs
    .flatMap(({ who, store }) => (store.versions || []).map((v) => ({ ...v, who })))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const versionDocs = allVersions.map((v, i) => {
    const m = resolve(v.by, v.slot);
    return {
      seq: i,
      v: `v1.${i}`,
      at: new Date(v.at),
      byMemberKey: m ? m.memberKey : null,
      byName: v.by,
      bySlot: v.slot,
      note: v.note || '',
      snap: v.snap,
      originalLabel: v.v,     // what it was called in that person's browser
      originalOwner: v.who,
    };
  });

  const renumbered = versionDocs.filter((d) => d.v !== d.originalLabel);

  console.log(`Merging ${blobs.length} export(s): ${blobs.map((b) => b.who).join(', ')}`);
  console.log(`  new roster members  ${pending.length}${pending.length ? ` (${pending.map((p) => p.name).join(', ')})` : ''}`);
  console.log(`  tracking updates    ${tracking.size}`);
  console.log(`  wording edits       ${edits.size}`);
  console.log(`  log entries         ${history.size}`);
  console.log(`  versions            ${versionDocs.length}${renumbered.length ? `  (${renumbered.length} renumbered)` : ''}`);
  for (const d of renumbered) console.log(`      ${d.originalOwner}'s ${d.originalLabel} -> ${d.v}`);

  if (DRY) {
    console.log('\nDry run — nothing written.');
    process.exit(0);
  }

  if (pending.length) {
    await db.collection('team').bulkWrite(pending.map((m) => ({
      updateOne: {
        filter: { memberKey: m.memberKey },
        update: { $set: { ...m, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        upsert: true,
      },
    })), { ordered: false });
  }

  const ops = [];
  for (const [caseId, rec] of tracking) {
    ops.push({ updateOne: { filter: { caseId }, update: { $set: { tracking: rec } } } });
  }
  for (const [caseId, rec] of edits) {
    ops.push({ updateOne: { filter: { caseId }, update: { $set: { edits: rec } } } });
  }
  for (const { caseId, entry } of history.values()) {
    // addToSet keeps the merge re-runnable: an identical entry is not appended
    // twice if the same export is processed again.
    ops.push({ updateOne: { filter: { caseId }, update: { $addToSet: { history: entry } } } });
  }
  if (ops.length) {
    const r = await db.collection('testcases').bulkWrite(ops, { ordered: false });
    console.log(`  wrote ${r.modifiedCount} testcase update(s)`);
  }

  if (versionDocs.length) {
    await db.collection('versions').bulkWrite(versionDocs.map((d) => ({
      updateOne: { filter: { seq: d.seq }, update: { $set: d }, upsert: true },
    })), { ordered: false });
    console.log(`  wrote ${versionDocs.length} version(s)`);
  }

  // Keep the per-case history in the order the page renders it, newest first.
  await db.collection('testcases').updateMany({}, [
    { $set: { history: { $sortArray: { input: '$history', sortBy: { at: -1 } } } } },
  ]);

  console.log('\nMerge complete.');
} catch (err) {
  console.error('Merge failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
