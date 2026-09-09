import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv, downloadDocx, type Column, type DocSection } from "@/lib/export";

export type ExportSpec<T> = {
  /** File-name stem; the download adds an `adigram-` prefix and a timestamp. */
  base: string;
  title: string;
  subtitle: string;
  columns: Column<T>[];
  rows: T[];
  /** Extra tables that only belong in the Word pack, such as a summary block. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraSections?: DocSection<any>[];
};

export function ExportMenu<T>({
  spec,
  label = "Export",
  className = "",
}: {
  spec: ExportSpec<T>;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<null | "csv" | "docx">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "csv" | "docx") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "csv") {
        downloadCsv(spec.base, spec.columns, spec.rows);
      } else {
        await downloadDocx(spec.base, spec.title, spec.subtitle, [
          ...(spec.extraSections ?? []),
          {
            heading: spec.title,
            summary: spec.subtitle,
            columns: spec.columns,
            rows: spec.rows,
          },
        ]);
      }
    } catch {
      setError("The file could not be generated. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="press inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-xs font-semibold transition-colors hover:border-primary/40"
            aria-label={`${label} the current view`}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span className="hidden sm:inline">{label}</span>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {spec.rows.length}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-2xl">
          <DropdownMenuLabel>
            Download {spec.rows.length} filtered row{spec.rows.length === 1 ? "" : "s"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2.5 rounded-xl"
            disabled={busy !== null}
            onSelect={(event) => {
              event.preventDefault();
              void run("csv");
            }}
          >
            <FileSpreadsheet className="size-4 text-success" />
            <span className="flex-1">
              <span className="block text-sm">CSV spreadsheet</span>
              <span className="block text-xs text-muted-foreground">Excel, Sheets, Numbers</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2.5 rounded-xl"
            disabled={busy !== null}
            onSelect={(event) => {
              event.preventDefault();
              void run("docx");
            }}
          >
            <FileText className="size-4 text-primary" />
            <span className="flex-1">
              <span className="block text-sm">Word document</span>
              <span className="block text-xs text-muted-foreground">
                Formatted tables for a status pack
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="absolute right-0 top-full mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
