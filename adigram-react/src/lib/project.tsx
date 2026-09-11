import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/* The constant now sits with the scoping logic that uses it, and is
   re-exported here so callers can take the provider and the value together. */
export { ALL_PROJECTS } from "@/lib/report";

const KEY = "adigram.project";

const ProjectContext = createContext<{
  /** Raw choice. It may be stale after a project is renamed away or deleted —
   *  `scopeDashboard` resolves it against the projects that actually exist. */
  projectId: string;
  setProjectId: (id: string) => void;
} | null>(null);

function stored(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    // A browser with site data blocked still gets the default project.
    return "";
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setState] = useState<string>(stored);
  const setProjectId = useCallback((next: string) => {
    setState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice still holds for this session.
    }
  }, []);
  const value = useMemo(() => ({ projectId, setProjectId }), [projectId, setProjectId]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used inside ProjectProvider.");
  return context;
}
