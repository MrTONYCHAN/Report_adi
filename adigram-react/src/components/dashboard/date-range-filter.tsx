import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ArrowDownAZ, ArrowUpAZ, CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toDay } from "@/lib/data";
import {
  DATE_FIELDS,
  NO_DATE_FILTER,
  PRESETS,
  describe,
  isActive,
  type DateField,
  type DateFilter,
} from "@/lib/date-filter";

const asDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`) : undefined);

/** One control for both boards: it picks the date field, the range on a calendar,
 *  and the direction the board sorts in, because in practice those three are
 *  always changed together. */
export function DateRangeFilter({
  filter,
  onChange,
  direction,
  onDirectionChange,
  count,
  hiddenUndated,
}: {
  filter: DateFilter;
  onChange: (filter: DateFilter) => void;
  direction: "asc" | "desc";
  onDirectionChange: (direction: "asc" | "desc") => void;
  count: number;
  hiddenUndated: number;
}) {
  const [open, setOpen] = useState(false);
  const active = isActive(filter);

  const onSelect = (next: DateRange | undefined) =>
    onChange({
      field: filter.field === "any" && next ? "dueDate" : filter.field,
      from: next?.from ? toDay(next.from.toISOString()) : null,
      to: next?.to
        ? toDay(next.to.toISOString())
        : next?.from
          ? toDay(next.from.toISOString())
          : null,
    });

  /* exactOptionalPropertyTypes is on, so an explicitly undefined prop is a type
     error where the prop is merely optional. Both the range and the starting
     month are therefore assembled and spread rather than passed inline. */
  const range = useMemo<DateRange | undefined>(() => {
    if (!active) return undefined;
    const from = asDate(filter.from);
    const to = asDate(filter.to);
    return { from, ...(to ? { to } : {}) };
  }, [active, filter.from, filter.to]);

  const month = asDate(filter.from);
  const calendarProps = {
    mode: "range" as const,
    numberOfMonths: 1,
    captionLayout: "dropdown" as const,
    className: "w-full [--cell-size:2.1rem]",
    onSelect,
    ...(range ? { selected: range } : {}),
    ...(month ? { defaultMonth: month } : {}),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Filter by date"
            className={`press inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface hover:border-primary/40"
            }`}
          >
            <CalendarDays className="size-3.5" />
            {describe(filter)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(680px,calc(100vw-24px))] rounded-2xl p-0">
          <div className="grid gap-0 sm:grid-cols-[190px_1fr]">
            <div className="border-b border-border p-3 sm:border-b-0 sm:border-r">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick ranges
              </p>
              <div className="flex flex-wrap gap-1.5 sm:flex-col">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => onChange(preset.build())}
                    className="press rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3">
              <label
                htmlFor="date-field"
                className="block pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Match on
              </label>
              <select
                id="date-field"
                value={filter.field}
                onChange={(event) =>
                  onChange({ ...filter, field: event.target.value as DateField })
                }
                className="mb-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                {DATE_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
              <p className="pb-2 text-xs text-muted-foreground">
                {DATE_FIELDS.find((f) => f.value === filter.field)?.description}
              </p>
              <Calendar {...calendarProps} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              {count} row{count === 1 ? "" : "s"} in range
              {hiddenUndated > 0 && ` · ${hiddenUndated} undated hidden`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onChange(NO_DATE_FILTER)}
                className="press rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="press rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <button
        onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}
        title={`Sorting ${direction === "asc" ? "earliest first" : "latest first"}`}
        className="press inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-xs font-semibold transition-colors hover:border-primary/40"
      >
        {direction === "asc" ? (
          <ArrowUpAZ className="size-3.5" />
        ) : (
          <ArrowDownAZ className="size-3.5" />
        )}
        <span className="hidden sm:inline">
          {direction === "asc" ? "Earliest first" : "Latest first"}
        </span>
      </button>

      {active && (
        <button
          onClick={() => onChange(NO_DATE_FILTER)}
          aria-label="Clear date filter"
          className="press grid size-9 place-items-center rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
