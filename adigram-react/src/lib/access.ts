import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/* The dashboard is reachable only with an access code. The check that matters
   happens on the server — these hooks just reflect the session cookie the
   server sets, so the UI can show the gate instead of an unexplained failure. */

export const ACCESS_CODE_LENGTH = 8;
export const SESSION_KEY = ["session"] as const;

type Session = { signedIn: boolean };

export function useSessionQuery() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }): Promise<Session> => {
      const response = await fetch("/api/session", { signal, cache: "no-store" });
      /* The status is carried into the message because the causes need
         different fixes and the screen is often the only place anyone looks: a
         404 means the API is not deployed alongside the site at all, a 401 that
         it is routing the request past the session endpoint, and a 5xx that it
         is deployed and failing. */
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 200).trim();
        throw new Error(`Sign-in is unavailable (HTTP ${response.status}). ${detail}`.trim());
      }
      return (await response.json()) as Session;
    },
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "That access code is not correct.");
      return result as Session;
    },
    // The dashboard query has been failing or idle behind the gate, so it is
    // invalidated alongside the session rather than left to its stale timer.
    onSuccess: () => {
      queryClient.setQueryData(SESSION_KEY, { signedIn: true });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch("/api/session", { method: "DELETE" });
    },
    // Report data must not survive sign-out in the cache where the next person
    // at this browser could see it in the moment before the gate renders.
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, { signedIn: false });
    },
  });
}
