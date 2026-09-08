// Reads the unencrypted review document and writes every piece of durable state
// in it to JSON, ready for seed-mongo.mjs.
//
//   node scripts/migrate/extract-source.mjs [source.html] [-o out.json]
//
// The encrypted index.html in this repository is built FROM that source, so
// there is nothing to decrypt here and the access code is never needed. The
// source lives in the private project repository; the default path below is
// where it sits on the machine this was written on.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const outFlag = args.indexOf('-o');
const outPath = outFlag === -1 ? null : args[outFlag + 1];
const positional = args.filter((a, i) => a !== '-o' && i !== outFlag + 1);

const SOURCE = positional[0] ||
  'C:/Users/Admin/Desktop/ADIGRAMS/documents/ADIGRAMS_GOLIVE_READINESS.html';
const OUT = outPath || path.join(process.cwd(), 'scripts/migrate/source-data.json');

const src = fs.readFileSync(SOURCE, 'utf8');

/* ---- cases and findings -------------------------------------------------
   Both are single-line <tr> rows with the same four cells. They are told
   apart by their marker attribute: data-s carries the 5 Sep verdict on a
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
    addedAt: null,          // null = shipped with the 5 Sep review
  };
  if (marker === 's') doc.verdict = value;      // PASS | FAIL | PARTIAL | NOT RUN
  else doc.severity = value;                    // Critical | High | Medium
  testcases.push(doc);
}

/* ---- the remediation pass of 6 September --------------------------------
   Seeded into the page rather than left in one browser, so it is real shared
   state and belongs in the database. Everything else in the page's storage is
   per-browser and cannot be read from here. */

const block = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`Could not locate ${what} in ${SOURCE}`);
  return m[1];
};

const seedSrc = block(/var SEED = \[([\s\S]*?)\n {4}\];/, 'the SEED array');
const seedBy = src.match(/var SEED_BY = "([^"]+)"/)[1];
const seedSlot = src.match(/var SEED_SLOT = "([^"]+)"/)[1];

const seeds = [...seedSrc.matchAll(/\{ id: "([^"]+)",\s*s: "([^"]+)",\s*at: "([^"]+)" \}/g)]
  .map(([, caseId, status, at]) => ({ caseId, status, at }));

const teamSrc = block(/var DEFAULT_TEAM = \[([\s\S]*?)\n {4}\];/, 'DEFAULT_TEAM');
const team = [...teamSrc.matchAll(/\{ key: "([^"]+)", slot: "([^"]+)", area: "([^"]+)", name: "([^"]*)" \}/g)]
  .map(([, memberKey, slot, area, name], i) => ({
    memberKey, slot, area, name, order: i, active: true,
  }));

// The page appends this row itself once the seeded pass is applied, because a
// name that stamps updates has to exist on the roster to be attributable.
if (!team.some((m) => m.name.toUpperCase() === seedBy.toUpperCase())) {
  team.push({
    memberKey: 'rem',
    slot: seedSlot,
    area: 'Cross-workstream remediation',
    name: seedBy,
    order: team.length,
    active: true,
  });
}

/* ---- apply the seed onto the cases -------------------------------------- */

const byId = new Map(testcases.map((d) => [d.caseId, d]));
const rem = team.find((m) => m.name.toUpperCase() === seedBy.toUpperCase());
const orphans = [];

for (const { caseId, status, at } of seeds) {
  const doc = byId.get(caseId);
  if (!doc) { orphans.push(caseId); continue; }
  const stamp = { byMemberKey: rem.memberKey, byName: seedBy, bySlot: seedSlot, at };
  doc.tracking = { status, ...stamp };
  doc.history.push({ kind: 'status', from: 'open', to: status, ...stamp });
}

if (orphans.length) {
  console.error(`Refusing to continue: seeded case(s) with no row — ${orphans.join(', ')}`);
  process.exit(1);
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
console.log(`  seeded    ${seeds.length} updates by ${seedBy}`);
console.log(`  team      ${team.length}  ${team.map((t) => t.slot).join(' | ')}`);
console.log(`  next id   ${Object.entries(maxSeq).map(([w, n]) => `${w}-${String(n + 1).padStart(2, '0')}`).join('  ')}`);
console.log(`Wrote ${OUT}`);
