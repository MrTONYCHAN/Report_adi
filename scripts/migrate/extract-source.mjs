// Reads the unencrypted review document and writes every piece of durable state
// in it to JSON, ready for seed-mongo.mjs.
//
//   node scripts/migrate/extract-source.mjs <source.html> [-o out.json]
//
// The encrypted index.html in this repository is built FROM that source, so
// there is nothing to decrypt here and the access code is never needed. If the
// private source is not checked out locally, decrypt-page.mjs recovers an
// equivalent document from index.html.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const oAt = argv.indexOf('-o');
const OUT = oAt === -1
  ? path.join(process.cwd(), 'scripts/migrate/source-data.json')
  : argv[oAt + 1];

// Anything that is not the -o flag or its value is the source path. Guard the
// -1 case explicitly, or index 0 gets filtered out as "oAt + 1".
const SOURCE = argv.filter((a, i) => oAt === -1 || (i !== oAt && i !== oAt + 1))[0];

if (!SOURCE || !fs.existsSync(SOURCE)) {
  console.error('Usage: node scripts/migrate/extract-source.mjs <source.html> [-o out.json]');
  console.error('\n  <source.html> is the UNENCRYPTED review document - either');
  console.error('  documents/ADIGRAMS_GOLIVE_READINESS.html from the private project');
  console.error('  repo, or the output of scripts/migrate/decrypt-page.mjs.');
  process.exit(1);
}

const src = fs.readFileSync(SOURCE, 'utf8');

if (/var PAYLOAD = "/.test(src)) {
  console.error(`${SOURCE} is the encrypted build output, not the source.`);
  console.error('Run scripts/migrate/decrypt-page.mjs first, or point this at the private source.');
  process.exit(1);
}

/* ---- cases and findings -------------------------------------------------
   Both are single-line <tr> rows with the same four cells. They are told
   apart by their marker attribute: data-s carries the reviewed verdict on a
   tracked test case, data-fe the severity of an untracked integration
   finding. The title and finding cells keep their inline markup, because
   that markup is what "restore original" restores. */

const ROW = /<tr data-(s|fe)="([^"]+)">\s*<td class="id">([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td class="st">[\s\S]*?<\/td><\/tr>/g;

const testcases = [];
for (const [, marker, value, rawId, title, finding] of src.matchAll(ROW)) {
  const caseId = rawId.trim();
  const [workstream, ordinal] = caseId.split('-');
  const doc = {
    caseId,
    kind: marker === 's' ? 'case' : 'finding',
    workstream,
    seq: Number(ordinal),
    original: { title: title.trim(), finding: finding.trim() },
    edits: null,
    tracking: null,
    history: [],
    addedAt: null,          // null = shipped with the reviewed baseline
  };
  if (marker === 's') doc.verdict = value;      // PASS | FAIL | PARTIAL | NOT RUN
  else doc.severity = value;                    // Critical | High | Medium
  testcases.push(doc);
}

if (!testcases.length) {
  console.error(`No case rows found in ${SOURCE}. Is this the right file?`);
  process.exit(1);
}

/* ---- the recorded remediation -------------------------------------------
   Seeded into the page rather than left in one browser, so it is real shared
   state and belongs in the database. Everything else in the page's storage is
   per-browser and cannot be read from here.

   SEED_ROWS and SEED_LOG are deliberately different sets. SEED_ROWS is what
   the Updated/By/On columns show: the state a case now stands at and who last
   put their name to it. SEED_LOG is the history of state *changes* behind it.
   On 7 September each developer confirmed work already recorded and took their
   name to it - a change of hand, not a change of state - so it moves By and On
   without inventing a log entry saying Fixed became Fixed. tracking and history
   are separate fields for exactly this reason; do not derive one from the
   other. */

const block = (re, what) => {
  const m = src.match(re);
  if (!m) {
    console.error(`Could not locate ${what} in ${SOURCE}. Has the page format changed?`);
    process.exit(1);
  }
  return m[1];
};

const teamSrc = block(/var DEFAULT_TEAM = \[([\s\S]*?)\n\s*\];/, 'DEFAULT_TEAM');
const team = [...teamSrc.matchAll(/\{\s*key:\s*"([^"]+)",\s*slot:\s*"([^"]+)",\s*area:\s*"([^"]+)",\s*name:\s*"([^"]*)"\s*\}/g)]
  .map(([, memberKey, slot, area, name], i) => ({
    memberKey, slot, area, name, order: i, active: true,
  }));

// Resolve a seeded entry's author to a roster row. Matched on slot rather than
// name, because the page writes the slot alongside every seeded record and two
// roster rows share the name CHANDAN; the slot is what tells them apart.
const bySlot = new Map(team.map((m) => [m.slot, m]));
const memberFor = (name, slot) =>
  bySlot.get(slot) || team.find((m) => m.name === name) || null;

const rowsSrc = block(/var SEED_ROWS = \[([\s\S]*?)\n\s*\];/, 'SEED_ROWS');
const seedRows = [...rowsSrc.matchAll(
  /\{\s*id:\s*"([^"]+)",\s*s:\s*"([^"]+)",\s*by:\s*"([^"]+)",\s*slot:\s*"([^"]+)",\s*at:\s*"([^"]+)"\s*\}/g)]
  .map(([, caseId, status, by, slot, at]) => ({ caseId, status, by, slot, at }));

// Entries carry CHANDAN and the Remediation slot unless they say otherwise.
const logSrc = block(/var SEED_LOG = \[([\s\S]*?)\n\s*\];/, 'SEED_LOG');
const seedLog = [...logSrc.matchAll(
  /\{\s*at:\s*"([^"]+)",\s*id:\s*"([^"]+)",\s*to:\s*"([^"]+)"\s*(?:,\s*by:\s*"([^"]+)",\s*slot:\s*"([^"]+)"\s*)?\}/g)]
  .map(([, at, caseId, to, by, slot]) => ({
    at, caseId, to, by: by || 'CHANDAN', slot: slot || 'Remediation',
  }));

if (!seedRows.length || !seedLog.length) {
  console.error('Parsed no SEED_ROWS or SEED_LOG entries. Has the page format changed?');
  process.exit(1);
}

/* ---- timestamps ----------------------------------------------------------
   The seed arrays carry naive local stamps with no zone, while a click in the
   browser writes new Date().toISOString(). Storing both shapes puts the same
   moment in the database under two spellings, so the merge cannot tell that a
   seeded change and the same change in someone's export are one event, and the
   update log shows it twice. Everything is normalised to UTC on the way in.
   The seeded pass was recorded in IST; override with SOURCE_TZ_OFFSET. */

const TZ = process.env.SOURCE_TZ_OFFSET || '+05:30';
const iso = (at) => {
  const s = String(at);
  const ms = Date.parse(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + TZ);
  if (Number.isNaN(ms)) throw new Error(`Unparseable timestamp in source: ${at}`);
  return new Date(ms).toISOString();
};

/* ---- apply onto the cases ----------------------------------------------- */

const byId = new Map(testcases.map((d) => [d.caseId, d]));
const orphans = [];

for (const { caseId, status, by, slot, at } of seedRows) {
  const doc = byId.get(caseId);
  if (!doc) { orphans.push(`SEED_ROWS ${caseId}`); continue; }
  const m = memberFor(by, slot);
  doc.tracking = { status, byMemberKey: m ? m.memberKey : null, byName: by, bySlot: slot, at: iso(at) };
}

for (const { at, caseId, to, by, slot } of seedLog) {
  const doc = byId.get(caseId);
  if (!doc) { orphans.push(`SEED_LOG ${caseId}`); continue; }
  const m = memberFor(by, slot);
  // Every seeded change is a case moving off Open: the Updated column starts
  // unset and is independent of the Status column beside it.
  doc.history.push({
    kind: 'status', from: 'open', to,
    byMemberKey: m ? m.memberKey : null, byName: by, bySlot: slot, at: iso(at),
  });
}

if (orphans.length) {
  console.error(`Refusing to continue: seeded entries with no row - ${orphans.join(', ')}`);
  process.exit(1);
}

// The log renders newest first.
for (const doc of testcases) {
  doc.history.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

const payload = {
  extractedAt: new Date().toISOString(),
  source: SOURCE,
  sourceBytes: Buffer.byteLength(src),
  team,
  testcases,
  versions: [],          // nothing shared exists yet; see merge-localstorage.mjs
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

const cases = testcases.filter((d) => d.kind === 'case');
const findings = testcases.filter((d) => d.kind === 'finding');
const tally = (rows, key) => rows.reduce((a, r) => (a[r[key]] = (a[r[key]] || 0) + 1, a), {});
const maxSeq = cases.reduce((a, c) => (a[c.workstream] = Math.max(a[c.workstream] || 0, c.seq), a), {});

console.log(`Read ${SOURCE}`);
console.log(`  cases     ${cases.length}  ${JSON.stringify(tally(cases, 'workstream'))}`);
console.log(`  verdicts     ${JSON.stringify(tally(cases, 'verdict'))}`);
console.log(`  findings  ${findings.length}  ${JSON.stringify(tally(findings, 'severity'))}`);
console.log(`  tracking  ${seedRows.length} cases  ${JSON.stringify(tally(seedRows, 'status'))}`);
console.log(`            by ${JSON.stringify(tally(seedRows, 'by'))}`);
console.log(`  log       ${seedLog.length} entries`);
console.log(`  team      ${team.length}  ${team.map((t) => `${t.slot}=${t.name || '(unnamed)'}`).join(' | ')}`);
console.log(`  next id   ${Object.entries(maxSeq).map(([w, n]) => `${w}-${String(n + 1).padStart(2, '0')}`).join('  ')}`);
console.log(`Wrote ${OUT}`);
