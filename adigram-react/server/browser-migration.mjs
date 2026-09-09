import { createHash } from "node:crypto";

function valueEnd(text, start) {
  const stack = [];
  let quoted = false,
    escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        quoted = false;
        if (!stack.length) return i + 1;
      }
    } else if (ch === '"') quoted = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (!stack.length) return i + 1;
    }
  }
  return null;
}

export function parseBrowserExport(raw) {
  let text = raw.trim();
  if (text.startsWith("'")) text = text.slice(1, text.endsWith("'") ? -1 : undefined);
  try {
    let data = JSON.parse(text);
    for (let i = 0; typeof data === "string" && i < 3; i++) data = JSON.parse(data);
    if (!data || typeof data !== "object" || !Array.isArray(data.team) || !data.rows)
      throw new Error("Invalid export");
    return { data, complete: true };
  } catch {
    // Recover only complete JSON values from a truncated console copy. Never
    // invent the missing tail; the original bytes and incomplete flag are archived.
    if (!text.startsWith('{"team":')) throw new Error("Unrecognized browser export");
    const data = {};
    for (const key of ["team", "rows", "log", "text", "versions"]) {
      const match = new RegExp(`"${key}"\\s*:\\s*`).exec(text);
      if (!match) continue;
      const start = match.index + match[0].length;
      const end = valueEnd(text, start);
      if (end) data[key] = JSON.parse(text.slice(start, end));
      else if (text[start] === "[") {
        data[key] = [];
        let cursor = start + 1;
        while (cursor < text.length) {
          while (/[\s,]/.test(text[cursor] || "")) cursor++;
          if (text[cursor] !== "{") break;
          const end = valueEnd(text, cursor);
          if (!end) break;
          data[key].push(JSON.parse(text.slice(cursor, end)));
          cursor = end;
        }
      }
    }
    if (!Array.isArray(data.team) || !data.rows)
      throw new Error("Export is too incomplete to recover records");
    return { data, complete: false };
  }
}

// Seed timestamps are Indian local time; browser-generated timestamps include Z.
const time = (value) =>
  Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value || "") ? value : `${value}+05:30`);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const eventKey = (e) => JSON.stringify([time(e.at), e.byMemberKey, e.kind, e.from, e.to, e.field]);

export function mergeBrowserExports(report, files) {
  report.sourceExports ??= [];
  report.versions ??= [];
  const summary = {
    files: files.length,
    incomplete: [],
    trackingUpdates: 0,
    addedHistory: 0,
    addedVersions: 0,
    warnings: [],
  };
  const records = new Map(report.testcases.map((r) => [r.caseId, r]));
  const parsed = files.map(({ name, raw }) => ({ name, raw, ...parseBrowserExport(raw) }));
  for (const file of parsed) {
    const sha256 = hash(file.raw);
    if (!report.sourceExports.some((e) => e.sha256 === sha256))
      report.sourceExports.push({
        name: file.name,
        sha256,
        complete: file.complete,
        raw: file.raw,
      });
    if (!file.complete) summary.incomplete.push(file.name);
    for (const member of file.data.team) {
      if (!member.name?.trim()) continue;
      const current = report.team.find((m) => m.memberKey === member.key && m.slot === member.slot);
      if (
        current &&
        (!current.name || member.name.toLowerCase().startsWith(current.name.toLowerCase()))
      )
        current.name = member.name;
    }
  }
  const stamp = (entry) => {
    const member = report.team.find(
      (m) =>
        m.slot === entry.slot &&
        (m.name.toLowerCase().startsWith((entry.by || "").toLowerCase()) ||
          (entry.by || "").toLowerCase().startsWith(m.name.toLowerCase())),
    );
    if (!member || !entry.by || !Number.isFinite(time(entry.at)))
      throw new Error("Unknown contributor or invalid timestamp in browser export");
    return { byMemberKey: member.memberKey, byName: entry.by, bySlot: entry.slot, at: entry.at };
  };
  for (const { name, data } of parsed) {
    for (const [id, row] of Object.entries(data.rows)) {
      const record = records.get(id);
      if (!record) {
        summary.warnings.push(`${name}: unknown record ${id} preserved in sourceExports`);
        continue;
      }
      if (!["open", "prog", "fixed", "ver"].includes(row.s))
        throw new Error("Invalid browser tracking status");
      const attribution = stamp(row);
      if (!record.tracking || time(row.at) > time(record.tracking.at)) {
        record.tracking = { status: row.s, ...attribution };
        summary.trackingUpdates++;
      }
    }
    for (const [id, edit] of Object.entries(data.text || {})) {
      const record = records.get(id);
      if (!record) {
        summary.warnings.push(`${name}: unknown edited record ${id}`);
        continue;
      }
      if (!record.edits || time(edit.at) > time(record.edits.at))
        record.edits = { ...edit, ...stamp(edit) };
    }
    for (const entry of data.log || []) {
      const record = records.get(entry.id);
      if (!record) {
        summary.warnings.push(`${name}: unknown history record ${entry.id}`);
        continue;
      }
      const event =
        entry.kind === "text"
          ? { kind: "text", field: entry.field, ...stamp(entry) }
          : { kind: "status", from: entry.from, to: entry.to, ...stamp(entry) };
      if (!record.history.some((e) => eventKey(e) === eventKey(event))) {
        record.history.push(event);
        summary.addedHistory++;
      }
    }
    for (const version of data.versions || []) {
      const migrationKey = hash(JSON.stringify([name, version]));
      if (report.versions.some((v) => v.migrationKey === migrationKey)) continue;
      report.versions.push({
        ...version,
        migrationKey,
        originalOwner: name,
        originalLabel: version.v,
        ...stamp(version),
      });
      summary.addedVersions++;
    }
  }
  report.versions.sort((a, b) => time(a.at) - time(b.at));
  report.versions.forEach((v, seq) => {
    v.seq = seq;
    v.v = `v1.${seq}`;
  });
  for (const record of report.testcases) record.history.sort((a, b) => time(a.at) - time(b.at));
  return summary;
}
