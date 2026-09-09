import { toDay, today } from "@/lib/data";

export type DateField = "any" | "dueDate" | "startDate" | "createdAt" | "updatedAt";

export type DateFilter = {
  field: DateField;
  from: string | null;
  to: string | null;
};

export const NO_DATE_FILTER: DateFilter = { field: "any", from: null, to: null };

export const DATE_FIELDS: { value: DateField; label: string; description: string }[] = [
  { value: "any", label: "Any date", description: "Match if any recorded date falls in range" },
  { value: "dueDate", label: "Due date", description: "When the work is expected to land" },
  { value: "startDate", label: "Start date", description: "When the work is planned to begin" },
  { value: "createdAt", label: "Raised", description: "When the item entered the register" },
  { value: "updatedAt", label: "Last updated", description: "Most recent recorded movement" },
];

export type DatedRow = {
  dueDate?: string | null;
  startDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** The days a row occupies for filtering purposes. `any` widens to every date the
 *  row carries, which is what makes a range useful on report rows that only ever
 *  recorded one timestamp. */
export function daysOf(row: DatedRow, field: DateField): string[] {
  if (field !== "any") return [toDay(row[field])].filter((d): d is string => d !== null);
  return [row.dueDate, row.startDate, row.createdAt, row.updatedAt]
    .map((value) => toDay(value))
    .filter((d): d is string => d !== null);
}

export const isActive = (filter: DateFilter) => filter.from !== null || filter.to !== null;

export function matchesRange(row: DatedRow, filter: DateFilter) {
  if (!isActive(filter)) return true;
  const days = daysOf(row, filter.field);
  if (!days.length) return false; // An undated row cannot be inside a range.
  return days.some(
    (day) => (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to),
  );
}

/** The day a row sorts on. Rows with nothing recorded sort last in both
 *  directions rather than pretending to be very old or very new. */
export function sortKey(row: DatedRow, field: DateField) {
  const days = daysOf(row, field === "any" ? "dueDate" : field).sort();
  return days[0] ?? null;
}

export function bySortKey<T extends DatedRow>(field: DateField, direction: "asc" | "desc") {
  return (a: T, b: T) => {
    const left = sortKey(a, field);
    const right = sortKey(b, field);
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
  };
}

function shift(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDay(date.toISOString())!;
}

function monthEdges() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toDay(first.toISOString())!, to: toDay(last.toISOString())! };
}

export const PRESETS: { id: string; label: string; build: () => DateFilter }[] = [
  { id: "all", label: "All dates", build: () => NO_DATE_FILTER },
  {
    id: "today",
    label: "Due today",
    build: () => ({ field: "dueDate", from: today(), to: today() }),
  },
  {
    id: "overdue",
    label: "Overdue",
    build: () => ({ field: "dueDate", from: "1970-01-01", to: shift(-1) }),
  },
  {
    id: "next7",
    label: "Next 7 days",
    build: () => ({ field: "dueDate", from: today(), to: shift(7) }),
  },
  {
    id: "next30",
    label: "Next 30 days",
    build: () => ({ field: "dueDate", from: today(), to: shift(30) }),
  },
  { id: "month", label: "This month", build: () => ({ field: "dueDate", ...monthEdges() }) },
  {
    id: "recent",
    label: "Updated last 14 days",
    build: () => ({ field: "updatedAt", from: shift(-14), to: today() }),
  },
];

export function describe(filter: DateFilter) {
  if (!isActive(filter)) return "All dates";
  const label = DATE_FIELDS.find((f) => f.value === filter.field)?.label ?? "Date";
  const pretty = (value: string | null) =>
    value
      ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
      : "…";
  return `${label}: ${pretty(filter.from)} – ${pretty(filter.to)}`;
}
