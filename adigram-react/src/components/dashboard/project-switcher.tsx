import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, FolderKanban, Layers, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDashboard } from "@/lib/data";
import { ALL_PROJECTS, useProject } from "@/lib/project";

/** Header switcher for the register's projects. Everything recorded so far sits
 *  under ADIGRAM, so that is what the button reads until a second project is
 *  added on the test-case page. */
export function ProjectSwitcher() {
  const { projects, activeProjectId, totals } = useDashboard();
  const { projectId, setProjectId } = useProject();

  const active = projects.find((project) => project.id === activeProjectId);
  const showingAll = projectId === ALL_PROJECTS || !active;
  const label = showingAll ? "All projects" : active.name;
  const count = showingAll
    ? projects.reduce((sum, project) => sum + project.cases, 0)
    : totals.testCases;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="press inline-flex h-9 min-w-0 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:border-primary/40"
          aria-label={`Project: ${label}. Change project`}
        >
          {showingAll ? (
            <Layers className="size-3.5 shrink-0 text-primary" />
          ) : (
            <FolderKanban className="size-3.5 shrink-0 text-primary" />
          )}
          <span className="max-w-[9rem] truncate">{label}</span>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-2xl">
        <DropdownMenuLabel>
          Project scope
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Filters every board, register and export.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project) => {
          const selected = !showingAll && project.id === activeProjectId;
          return (
            <DropdownMenuItem
              key={project.id}
              className="gap-2.5 rounded-xl"
              onSelect={() => setProjectId(project.id)}
            >
              <FolderKanban className="size-4 text-primary" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium">{project.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {project.cases} case{project.cases === 1 ? "" : "s"} · {project.workstreams}{" "}
                  workstream{project.workstreams === 1 ? "" : "s"}
                </span>
              </span>
              {selected && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        {!projects.length && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No projects yet. Add one on the test-case page.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5 rounded-xl"
          onSelect={() => setProjectId(ALL_PROJECTS)}
        >
          <Layers className="size-4 text-muted-foreground" />
          <span className="flex-1">
            <span className="block text-sm">All projects</span>
            <span className="block text-xs text-muted-foreground">
              Combine every project in one view
            </span>
          </span>
          {showingAll && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2.5 rounded-xl">
          <Link to="/test-cases">
            <Settings2 className="size-4 text-muted-foreground" />
            <span className="text-sm">Manage projects</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
