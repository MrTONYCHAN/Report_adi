import fs from "node:fs";
export function readReport(SOURCE) {
  const src = fs.readFileSync(SOURCE, "utf8");

  /* ---- cases and findings -------------------------------------------------
   Both are single-line <tr> rows with the same four cells. They are told
   apart by their marker attribute: data-s carries the 5 Sep verdict on a
   tracked test case, data-fe the severity of an untracked integration
   finding. The title and finding cells keep their inline markup, because
   that markup is what "restore original" restores. */

  const ROW =
    /<tr data-(s|fe)="([^"]+)">\s*<td class="id">([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td class="st">[\s\S]*?<\/td><\/tr>/g;

  const testcases = [];
  for (const [, marker, value, rawId, title, finding] of src.matchAll(ROW)) {
    const caseId = rawId.trim();
    const [workstream, ordinal] = caseId.split("-");
    const doc = {
      caseId,
      kind: marker === "s" ? "case" : "finding",
      workstream,
      seq: Number(ordinal),
      original: { title: title.trim(), finding: finding.trim() },
      edits: null,
      tracking: null,
      history: [],
      addedAt: null, // null = shipped with the 5 Sep review
    };
    if (marker === "s")
      doc.verdict = value; // PASS | FAIL | PARTIAL | NOT RUN
    else doc.severity = value; // Critical | High | Medium
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

  // Read string-only records without executing JavaScript from the report.
  // Published reports use both SEED (6 Sep) and SEED_ROWS / SEED_LOG (7 Sep).
  const records = (value) =>
    [...value.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\{([^{}]*)\}/g)].map(([, fields]) =>
      Object.fromEntries(
        [...fields.matchAll(/(\w+)\s*:\s*"([^"\\]*)"/g)].map(([, key, value]) => [key, value]),
      ),
    );
  const array = (name) =>
    records(block(new RegExp(`var\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`), name));
  const team = array("DEFAULT_TEAM").map(({ key, slot, area, name }, i) => ({
    memberKey: key,
    slot,
    area,
    name,
    order: i,
    active: true,
  }));
  const modern = /var\s+SEED_ROWS\s*=/.test(src);
  const remediation = team.find((member) => member.slot === "Remediation");
  const seedBy = src.match(/var SEED_BY = "([^"]+)"/)?.[1] ?? remediation?.name;
  const seedSlot = src.match(/var SEED_SLOT = "([^"]+)"/)?.[1] ?? remediation?.slot;
  if (!seedBy || !seedSlot) throw new Error("Source is missing remediation attribution");
  const seeds = array(modern ? "SEED_ROWS" : "SEED");
  const logs = modern ? array("SEED_LOG") : seeds.map((entry) => ({ ...entry, to: entry.s }));

  // The page appends this row itself once the seeded pass is applied, because a
  // name that stamps updates has to exist on the roster to be attributable.
  if (!team.some((m) => m.name.toUpperCase() === seedBy.toUpperCase())) {
    team.push({
      memberKey: "rem",
      slot: seedSlot,
      area: "Cross-workstream remediation",
      name: seedBy,
      order: team.length,
      active: true,
    });
  }

  /* ---- apply the seed onto the cases -------------------------------------- */

  const byId = new Map(testcases.map((d) => [d.caseId, d]));
  const orphans = [];
  const stampFor = (entry) => {
    const byName = entry.by ?? seedBy;
    const bySlot = entry.slot ?? seedSlot;
    const member = team.find((m) => m.name === byName && m.slot === bySlot);
    if (!member) throw new Error("Source contains unknown tracking contributor");
    return { byMemberKey: member.memberKey, byName, bySlot, at: entry.at };
  };
  for (const entry of seeds) {
    const { id: caseId, s: status } = entry;
    const doc = byId.get(caseId);
    if (!doc) {
      orphans.push(caseId);
      continue;
    }
    doc.tracking = { status, ...stampFor(entry) };
  }
  for (const entry of logs) {
    const doc = byId.get(entry.id);
    if (!doc) {
      orphans.push(entry.id);
      continue;
    }
    doc.history.push({ kind: "status", from: "open", to: entry.to, ...stampFor(entry) });
  }

  if (orphans.length) {
    throw new Error("Source contains orphaned tracking updates");
  }

  const payload = {
    extractedAt: new Date().toISOString(),
    source: "ADIGRAMS readiness report",
    sourceUpdatedAt: fs.statSync(SOURCE).mtime.toISOString(),
    sourceBytes: Buffer.byteLength(src),
    team,
    testcases,
    versions: [], // nothing shared exists yet; see merge-localstorage.mjs
  };

  return payload;
}
