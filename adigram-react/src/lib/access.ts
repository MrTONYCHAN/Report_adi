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
      if (!response.ok) throw new Error("Sign-in is unavailable. Retry in a moment.");
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
