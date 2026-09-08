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
  // A dry run still wants the roster, because who a record is attributed to is
  // most of what there is to preview. But it must also work from a machine that
  // cannot reach the cluster - the version renumbering is worth checking on its
  // own - so a failed connection degrades to an empty roster rather than
  // stopping, and says so, since every author will then read as new.
  let db = null;
  let offline = false;
  try {
    db = await getDb();
  } catch (err) {
    if (!DRY) throw err;
    offline = true;
    console.warn(`Cannot reach the database (${err.message}).`);
    console.warn('Previewing without a roster: every author will look new, and');
    console.warn('attribution cannot be checked. Version renumbering is still accurate.');
    console.warn('');
  }
  const roster = db ? await db.collection('team').find({}).toArray() : [];

  /* ---- resolve a person to a roster row ---------------------------------
     Slot first, then name.

     The page writes both alongside every record, and which one identifies a
     person depends on the document. Here the roster carries CHANDAN twice -
     once as Developer 1 and once as Remediation - so matching on name alone
     would file all of his Developer 1 work under Remediation. Slots are unique
     on this roster, so they are the better key.

     Name is still the fallback, because a slot can be renamed between someone
     taking their export and this running, and because a browser that predates a
     slot change will carry the old label. */
  const bySlot = new Map(roster.map((m) => [m.slot, m]));
  const byName = new Map();
  for (const m of roster) {
    const key = (m.name || '').trim().toUpperCase();
    // Only unambiguous names are usable as a fallback; a duplicated one tells
    // us nothing about which row was meant.
    if (!key) continue;
    byName.set(key, byName.has(key) ? null : m);
  }

  const pending = [];
  const unresolved = new Set();
  const resolve = (name, slot, area) => {
    const nameKey = (name || '').trim().toUpperCase();
    if (!nameKey) return null;

    if (slot && bySlot.has(slot)) return bySlot.get(slot);
    const byNameHit = byName.get(nameKey);
    if (byNameHit) return byNameHit;
    if (byNameHit === null) {
      // The name is on the roster more than once and the slot did not match
      // any of them, so there is no honest way to pick. Say so rather than
      // guessing at attribution.
      unresolved.add(`${name} (${slot || 'no slot'})`);
      return null;
    }

    const member = {
      memberKey: `d${Date.now().toString(36)}${pending.length}`,
      slot: slot || 'Developer',
      area: area || '—',
      name: name.trim(),
      order: roster.length + pending.length,
      active: true,
    };
    bySlot.set(member.slot, member);
    byName.set(nameKey, member);
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
  // Who ends up credited with what. This is the part worth reading before a
  // real run: a roster carrying the same name twice makes misattribution easy
  // and silent, so the split across rows is shown rather than just the totals.
  const credited = new Map();
  const credit = (m, what) => {
    if (!m) return;
    const row = credited.get(m.memberKey) || { slot: m.slot, name: m.name, tracking: 0, edits: 0, log: 0 };
    row[what] += 1;
    credited.set(m.memberKey, row);
  };
  for (const rec of tracking.values()) credit({ memberKey: rec.byMemberKey, slot: rec.bySlot, name: rec.byName }, 'tracking');
  for (const rec of edits.values()) credit({ memberKey: rec.byMemberKey, slot: rec.bySlot, name: rec.byName }, 'edits');
  for (const { entry } of history.values()) credit({ memberKey: entry.byMemberKey, slot: entry.bySlot, name: entry.byName }, 'log');

  console.log('  attributed to:');
  for (const [key, r] of [...credited].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`      ${key.padEnd(6)} ${String(r.name).padEnd(9)} ${String(r.slot).padEnd(14)} ${r.tracking} tracking, ${r.edits} edits, ${r.log} log`);
  }
  console.log(`  versions            ${versionDocs.length}${renumbered.length ? `  (${renumbered.length} renumbered)` : ''}`);
  for (const d of renumbered) console.log(`      ${d.originalOwner}'s ${d.originalLabel} -> ${d.v}`);

  if (unresolved.size) {
    // Dropped rather than guessed: attributing a change to the wrong person is
    // worse than reporting that it could not be placed.
    console.warn(`
  ${unresolved.size} author(s) could not be matched to a roster row, and their`);
    console.warn('  records were skipped. Add the slot to the roster, or rename it to match:');
    for (const u of unresolved) console.warn(`      ${u}`);
  }

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
  if (!offline) await closeDb();
}
