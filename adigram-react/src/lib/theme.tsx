import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "adigram.theme";
const ThemeContext = createContext<{
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
} | null>(null);

const media = () =>
  typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // A browser with site data blocked still gets a working dashboard.
  }
  return "system";
}

function apply(theme: Theme): "light" | "dark" {
  const resolved = theme === "system" ? (media()?.matches ? "dark" : "light") : theme;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  // Keeps the mobile browser chrome from staying light over a dark dashboard.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#0b1220" : "#2563eb");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(stored);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof document === "undefined" ? "light" : apply(stored()),
  );

  useEffect(() => {
    setResolved(apply(theme));
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Preference is lost on reload, but the session still honours the choice.
    }
    if (theme !== "system") return;
    const query = media();
    if (!query) return;
    const onChange = () => setResolved(apply("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState(apply(stored()) === "dark" ? "light" : "dark"),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider.");
  return context;
}
