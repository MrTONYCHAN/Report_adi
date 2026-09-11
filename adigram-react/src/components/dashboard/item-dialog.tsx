import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SEVERITIES,
  STATUS_LABELS,
  today,
  useCreateItem,
  useUpdateItem,
  type ItemKind,
  type Severity,
} from "@/lib/data";

export type ItemFormValues = {
  id?: string;
  title: string;
  description: string;
  workstream: string;
  projectId: string;
  assignee: string;
  severity: Severity;
  status: string;
  startDate: string;
  dueDate: string;
  progress: string;
};

const blank = (projectId: string): ItemFormValues => ({
  title: "",
  description: "",
  workstream: "",
  projectId,
  assignee: "",
  severity: "medium",
  status: "",
  startDate: today(),
  dueDate: "",
  progress: "",
});

const field =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary";

export function ItemDialog({
  kind,
  trigger,
  initial,
  workstreams,
  assignees,
  statuses,
  slaDays,
  projects,
  defaultProjectId = "",
  onDone,
}: {
  kind: ItemKind;
  trigger: ReactNode;
  initial?: ItemFormValues;
  workstreams: string[];
  assignees: string[];
  statuses: string[];
  slaDays: Record<string, number>;
  /** Every project the register holds; the item is filed under one of them. */
  projects: { id: string; name: string }[];
  /** Whichever project the board is scoped to, so a new item lands there. */
  defaultProjectId?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ItemFormValues>(initial ?? blank(defaultProjectId));
  const [error, setError] = useState<string | null>(null);
  const create = useCreateItem();
  const update = useUpdateItem();
  const editing = Boolean(initial?.id);
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) {
      setValues(initial ?? blank(defaultProjectId));
      setError(null);
    }
  }, [open, initial, defaultProjectId]);

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const future = values.startDate > today();
  const sla = slaDays[values.severity];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.title.trim()) {
      setError("Give the item a title so it can be found on the board.");
      return;
    }
    if (values.dueDate && values.startDate && values.dueDate < values.startDate) {
      setError("The due date cannot fall before the start date.");
      return;
    }
    const payload = {
      kind,
      title: values.title.trim(),
      description: values.description.trim(),
      workstream: values.workstream.trim(),
      projectId: values.projectId,
      assignee: values.assignee.trim(),
      severity: values.severity,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
      progress: values.progress === "" ? null : Number(values.progress),
      ...(values.status ? { status: values.status } : {}),
    };
    try {
      if (editing) await update.mutateAsync({ id: initial!.id!, ...payload });
      else await create.mutateAsync(payload);
      setOpen(false);
      onDone?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The item could not be saved.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[min(680px,calc(100vw-24px))] overflow-y-auto rounded-3xl sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit" : "New"} {kind === "bug" ? "defect" : "task"}
          </DialogTitle>
          <DialogDescription>
            Saved to the dashboard&apos;s own register. The readiness report file is never
            rewritten.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="item-title">Title</Label>
            <input
              id="item-title"
              className={field}
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={
                kind === "bug" ? "Invoice export drops tax lines" : "Re-run regression on payments"
              }
              maxLength={240}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-description">Detail</Label>
            <Textarea
              id="item-description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Steps, evidence, or the acceptance condition."
              rows={3}
              maxLength={4000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-project">Project</Label>
              <select
                id="item-project"
                className={field}
                value={values.projectId}
                onChange={(e) => set("projectId", e.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
                {!projects.length && <option value="">No projects yet</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-workstream">{kind === "bug" ? "Module" : "Workstream"}</Label>
              <input
                id="item-workstream"
                className={field}
                list="workstream-options"
                value={values.workstream}
                onChange={(e) => set("workstream", e.target.value)}
                placeholder="Pick or type a new one"
              />
              <datalist id="workstream-options">
                {workstreams.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-assignee">Assignee</Label>
              <input
                id="item-assignee"
                className={field}
                list="assignee-options"
                value={values.assignee}
                onChange={(e) => set("assignee", e.target.value)}
                placeholder="Unassigned"
              />
              <datalist id="assignee-options">
                {assignees.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-severity">Severity</Label>
              <select
                id="item-severity"
                className={field}
                value={values.severity}
                onChange={(e) => set("severity", e.target.value as Severity)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-start">Start date</Label>
              <Input
                id="item-start"
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-due">Due date</Label>
              <Input
                id="item-due"
                type="date"
                min={values.startDate || undefined}
                value={values.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          </div>

          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-status">Status</Label>
                <select
                  id="item-status"
                  className={field}
                  value={values.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
              {kind === "task" && (
                <div className="space-y-1.5">
                  <Label htmlFor="item-progress">Progress %</Label>
                  <Input
                    id="item-progress"
                    type="number"
                    min={0}
                    max={100}
                    value={values.progress}
                    onChange={(e) => set("progress", e.target.value)}
                    placeholder="Not recorded"
                  />
                </div>
              )}
            </div>
          )}

          {/* Defects are raised by people who already know how the register
              behaves, so the dialog states the automation only for tasks. */}
          {kind === "task" && (
            <div className="rounded-2xl border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                What the workflow will do
              </p>
              {future ? (
                <p className="flex items-start gap-1.5">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                  Planned for {values.startDate}. It opens in <strong>Scheduled</strong> and moves
                  to <strong>To do</strong> on its own that morning.
                </p>
              ) : (
                <p>
                  Starts on the board today in <strong>To do</strong>.
                </p>
              )}
              {!values.dueDate && sla !== undefined && (
                <p className="mt-1">
                  No due date set, so the {values.severity} response target of {sla} days will be
                  applied automatically.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : `Create ${kind === "bug" ? "defect" : "task"}`}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
