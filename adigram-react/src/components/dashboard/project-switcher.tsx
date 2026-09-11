import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, FolderKanban, Layers, Loader2, Plus, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useDashboard, useSaveTestCaseWorkspace } from "@/lib/data";
import { ALL_PROJECTS, useProject } from "@/lib/project";

function nextProjectId(taken: string[]) {
  let number = taken.length + 1;
  while (taken.includes(`PROJECT-${number}`)) number += 1;
  return `PROJECT-${number}`;
}

/** Header switcher for the register's projects. Everything the report itself
 *  carries sits under the first project, which is ADIGRAM; anything raised
 *  afterwards is filed under whichever project is picked here. */
export function ProjectSwitcher() {
  const { projects, testCaseProjects, activeProjectId, totals } = useDashboard();
  const { projectId, setProjectId } = useProject();
  const saveWorkspace = useSaveTestCaseWorkspace();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = projects.find((project) => project.id === activeProjectId);
  const showingAll = projectId === ALL_PROJECTS || !active;
  const label = showingAll ? "All projects" : active.name;
  const count = showingAll
    ? projects.reduce((sum, project) => sum + project.cases, 0)
    : totals.testCases;

  /* A project lives in the test-case workspace, so adding one means saving that
     workspace back with the new project appended — every existing project and
     row is carried across untouched. */
  async function addProject(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the project a name.");
      return;
    }
    const id = nextProjectId(testCaseProjects.map((project) => project.id));
    try {
      await saveWorkspace.mutateAsync({
        projects: [
          ...testCaseProjects.map((project) => ({
            id: project.id,
            name: project.name,
            date: project.date,
            groups: project.groups,
          })),
          { id, name: trimmed, date: null, groups: [] },
        ],
      });
      setProjectId(id);
      setAdding(false);
      setName("");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be created.");
    }
  }

  return (
    <>
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
                <span className="min-w-0 flex-1">
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
              No projects yet. Add the first one below.
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
          <DropdownMenuItem
            className="gap-2.5 rounded-xl"
            onSelect={(event) => {
              event.preventDefault();
              setName("");
              setError(null);
              setAdding(true);
            }}
          >
            <Plus className="size-4 text-primary" />
            <span className="text-sm font-medium">New project</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2.5 rounded-xl">
            <Link to="/test-cases">
              <Settings2 className="size-4 text-muted-foreground" />
              <span className="text-sm">Manage projects</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="w-[min(440px,calc(100vw-24px))] rounded-3xl">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Its own test cases, defects and tasks. Everything recorded so far stays with the first
              project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addProject} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <input
                id="project-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Second programme"
                maxLength={160}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="press rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveWorkspace.isPending}
                className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saveWorkspace.isPending && <Loader2 className="size-4 animate-spin" />}
                Create project
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
