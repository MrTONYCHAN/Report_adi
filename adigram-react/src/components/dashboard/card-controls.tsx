import { AlarmClock, ChevronRight, Flame, Loader2, MoveRight, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS, useDeleteItem, useMoveCard, type ItemKind } from "@/lib/data";

export type MovableRow = {
  id: string;
  status: string;
  origin: "report" | "dashboard";
  breached?: boolean;
  escalated?: boolean;
  dueDate?: string | null;
};

/** The move menu is built from the server's transition table, so the board can
 *  only ever offer a step the workflow engine will actually accept. */
export function StatusMenu({
  row,
  kind,
  transitions,
}: {
  row: MovableRow;
  kind: ItemKind;
  transitions: Record<string, Record<string, string[]>>;
}) {
  const { move, isPending } = useMoveCard();
  const remove = useDeleteItem();
  const next = transitions[kind]?.[row.status] ?? [];

  if (!next.length && row.origin === "report") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Move ${row.id}`}
          className="press inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {isPending || remove.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <MoveRight className="size-3" />
          )}
          Move
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl">
        <DropdownMenuLabel className="text-xs">
          {STATUS_LABELS[row.status] ?? row.status} →
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {next.map((status) => (
          <DropdownMenuItem
            key={status}
            className="gap-2 rounded-xl text-sm"
            onSelect={() => void move(row, kind, status).catch(() => undefined)}
          >
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {STATUS_LABELS[status] ?? status}
          </DropdownMenuItem>
        ))}
        {row.origin === "dashboard" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 rounded-xl text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => void remove.mutateAsync(row.id).catch(() => undefined)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Flags the automation raised. They are deliberately loud: a breached target
 *  that reads like ordinary metadata is a breached target nobody acts on. */
export function Flags({ row }: { row: MovableRow }) {
  if (!row.breached && !row.escalated) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {row.breached && (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
          <AlarmClock className="size-3" />
          Overdue
        </span>
      )}
      {row.escalated && (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/35 bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
          <Flame className="size-3" />
          Escalated
        </span>
      )}
    </span>
  );
}
