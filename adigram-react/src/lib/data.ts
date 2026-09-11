import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/lib/project";
import {
  deriveDashboard,
  reportSchema,
  scopeDashboard,
  type ItemKind,
  type Severity,
  type TestCaseWorkspace,
} from "@/lib/report";

/* The schema, the derivation and the project scoping live in report.ts, which
   stays free of React so the server tests can import it. Everything they export
   is re-exported here, because the whole app reads the data layer as one module. */
export * from "@/lib/report";

export function useDashboardQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/dashboard", { signal, cache: "no-store" });
      /* A session that lapses mid-visit should bring the access gate back,
         rather than leave the board reporting a data failure the reader has no
         way to act on. */
      if (response.status === 401) {
        void queryClient.invalidateQueries({ queryKey: ["session"] });
        throw new Error("Your session has ended. Enter the access code again.");
      }
      if (!response.ok)
        throw new Error("The readiness report is unavailable. Check the data source and retry.");
      return deriveDashboard(reportSchema.parse(await response.json()));
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 10000,
    retry: 1,
  });
}
/** Every page reads the board through here, so the header's project switcher
 *  scopes the whole dashboard without each route having to filter for itself. */
export function useDashboard() {
  const query = useDashboardQuery();
  const { projectId } = useProject();
  const data = query.data;
  const scoped = useMemo(() => (data ? scopeDashboard(data, projectId) : null), [data, projectId]);
  if (!scoped) throw new Error("Dashboard must render within its data boundary.");
  return scoped;
}

async function send(url: string, method: string, payload?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error || "The change could not be saved.");
  return result;
}

/* Every mutation invalidates the one dashboard query rather than patching the
   cache, because the server re-runs the automation on write and can legitimately
   hand back a different status than the one that was requested. */
function useBoardMutation<V>(run: (value: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
}

export type ItemDraft = {
  kind: ItemKind;
  title: string;
  description?: string;
  workstream?: string;
  projectId?: string;
  assignee?: string;
  severity?: Severity;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  progress?: number | null;
  by?: string;
};

export const useCreateItem = () =>
  useBoardMutation((draft: ItemDraft) => send("/api/items", "POST", draft));

export const useUpdateItem = () =>
  useBoardMutation(({ id, ...rest }: Partial<ItemDraft> & { id: string }) =>
    send(`/api/items/${encodeURIComponent(id)}`, "PATCH", rest),
  );

export const useDeleteItem = () =>
  useBoardMutation((id: string) => send(`/api/items/${encodeURIComponent(id)}`, "DELETE"));

export const useUpdateRecord = () =>
  useBoardMutation(({ id, ...rest }: { id: string; kind: ItemKind; status: string; by?: string }) =>
    send(`/api/records/${encodeURIComponent(id)}`, "PATCH", rest),
  );

export type TeamEdit = { name?: string; role?: string; workstream?: string; by?: string };

export const useCreateTeamMember = () =>
  useBoardMutation((draft: Required<Pick<TeamEdit, "name" | "role" | "workstream">>) =>
    send("/api/team", "POST", draft),
  );

export const useUpdateTeamMember = () =>
  useBoardMutation(({ id, ...rest }: TeamEdit & { id: string }) =>
    send(`/api/team/${encodeURIComponent(id)}`, "PATCH", rest),
  );

/** Drops a correction so the member falls back to whatever the report says. */
export const useResetTeamMember = () =>
  useBoardMutation((id: string) => send(`/api/team/${encodeURIComponent(id)}`, "PATCH", {}));

export const useDeleteTeamMember = () =>
  useBoardMutation((id: string) => send(`/api/team/${encodeURIComponent(id)}`, "DELETE"));

export const useSaveTestCaseWorkspace = () =>
  useBoardMutation((workspace: TestCaseWorkspace) => send("/api/test-cases", "PUT", workspace));

/** Moves a card whether it came from the report or from the overlay; the two
 *  need different endpoints, and no caller should have to remember which. */
export function useMoveCard() {
  const updateItem = useUpdateItem();
  const updateRecord = useUpdateRecord();
  return {
    isPending: updateItem.isPending || updateRecord.isPending,
    error: updateItem.error || updateRecord.error,
    move: (row: { id: string; origin: "report" | "dashboard" }, kind: ItemKind, status: string) =>
      row.origin === "dashboard"
        ? updateItem.mutateAsync({ id: row.id, status })
        : updateRecord.mutateAsync({ id: row.id, kind, status }),
  };
}
