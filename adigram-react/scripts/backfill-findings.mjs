/* One-time backfill: copy each report record's finding onto the matching row of
   the saved test-case workspace, so the register's Finding column reads from
   stored data rather than being derived on every load.
 *
 * The findings come from the `testcases` and `findings` collections, which hold
 * the readiness report's own text verbatim. Rows with no report record behind
 * them keep an empty finding. Re-running is a no-op: a row that already carries
 * a finding is left exactly as it is, so later edits are never overwritten.
 *
 * Usage: npm run db:backfill-findings [-- --dry-run]
 */
import { createMongoRepository } from "../server/mongo.mjs";

const dryRun = process.argv.slice(2).includes("--dry-run");

/* The report stores findings as report HTML; the register shows plain text, the
   same reduction the dashboard already applies to titles and descriptions. */
function plainText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const repository = createMongoRepository();
try {
  const summary = await repository.run(async (data) => {
    const workspace = data.store.testCaseWorkspace;
    if (!workspace) throw new Error("No saved test-case workspace to backfill.");

    const findings = new Map(
      data.report.testcases.map((record) => [
        record.caseId,
        plainText(record.edits?.finding || record.original?.finding),
      ]),
    );

    let filled = 0;
    let kept = 0;
    let unmatched = [];
    const fill = (groups) =>
      groups.map((group) => ({
        ...group,
        rows: group.rows.map((row) => {
          if (row.finding) {
            kept += 1;
            return row;
          }
          const finding = findings.get(row.id) || "";
          if (!finding) unmatched.push(row.id);
          else filled += 1;
          return { ...row, finding };
        }),
      }));

    const updated = workspace.projects
      ? { ...workspace, projects: workspace.projects.map((p) => ({ ...p, groups: fill(p.groups) })) }
      : { ...workspace, groups: fill(workspace.groups || []) };

    if (!dryRun) data.store.testCaseWorkspace = { ...updated, updatedAt: new Date().toISOString() };
    return { filled, kept, unmatched };
  });

  console.log(
    `${dryRun ? "Would fill" : "Filled"} ${summary.filled} finding(s); ` +
      `${summary.kept} row(s) already had one.`,
  );
  if (summary.unmatched.length)
    console.log("No report record for:", summary.unmatched.join(", "));
} finally {
  await repository.close();
}
