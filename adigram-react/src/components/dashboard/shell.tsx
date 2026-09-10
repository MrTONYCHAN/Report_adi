import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  Bug,
  FlaskConical,
  Search,
  Bell,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  LockKeyhole,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { useSignOut } from "@/lib/access";
import { useDashboard, useDashboardQuery } from "@/lib/data";

/** Three-bar hamburger icon — drawn with plain spans so it needs no icon dep. */
function HamburgerIcon() {
  return (
    <span className="flex flex-col gap-[5px]" aria-hidden="true">
      <span className="block h-[2px] w-[18px] rounded-full bg-current" />
      <span className="block h-[2px] w-[18px] rounded-full bg-current" />
      <span className="block h-[2px] w-[18px] rounded-full bg-current" />
    </span>
  );
}

export function Shell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { activity, bugs, developers, tasks, testCases, totals, sourceUpdatedAt } = useDashboard();
  const { refetch, isFetching, dataUpdatedAt, error } = useDashboardQuery();
  const signOut = useSignOut();

  const nav = [
    { to: "/", label: "Overview", icon: LayoutDashboard, hint: "Readiness" },
    { to: "/developers", label: "Developers", icon: Users, hint: `${developers.length} members` },
    { to: "/tasks", label: "Tasks", icon: ListChecks, hint: `${totals.openTasks} open` },
    { to: "/bugs", label: "Bugs", icon: Bug, hint: `${totals.openBugs} open` },
    { to: "/test-cases", label: "Test Cases", icon: FlaskConical, hint: `${totals.testCases}` },
  ] as const;

  const findings = [
    ...tasks.map((t) => ({ id: t.id, title: t.title, to: "/tasks" as const })),
    ...bugs.map((b) => ({ id: b.id, title: b.title, to: "/bugs" as const })),
    ...testCases.map((t) => ({ id: t.id, title: t.name, to: "/test-cases" as const })),
    ...developers.map((d) => ({ id: d.id, title: d.name, to: "/developers" as const })),
  ];

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const matches = findings.filter((f) =>
    `${f.id} ${f.title}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    setOpen(false);
    setSearchOpen(false);
    setQuery("");
  }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight">ADIGRAMS 2.0</p>
          <p className="truncate text-xs text-muted-foreground">Go-Live Control</p>
        </div>
      </div>

      {/* Nav */}
      <nav
        aria-label="Workspace"
        className="flex-1 space-y-1 overflow-y-auto px-3 pb-4"
      >
        <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {nav.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`press flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground"
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <item.icon className="size-4" />
              </span>
              <span className="flex-1">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.hint}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status card */}
      <div className="m-3 rounded-2xl border border-sidebar-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <span className="size-2 rounded-full bg-success" />
          Readiness report
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {totals.testCases ? Math.round((totals.passed / totals.testCases) * 100) : 0}% passed ·{" "}
          {totals.openBugs} open defects.
        </p>
        {totals.breached > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="size-3.5" />
            {totals.breached} past due
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Source updated {new Date(sourceUpdatedAt).toLocaleString("en-IN")}
        </p>
        <button
          className="press mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Refreshing…" : "Refresh data"}
        </button>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen w-full bg-background">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>

        {/* Full-width layout — no sidebar offset */}
        <div className="min-w-0">
          <header className="glass-panel sticky top-0 z-20">
            <div className="flex flex-wrap items-center gap-3 px-3 py-3.5">

              {/* Hamburger — visible on ALL screen sizes */}
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <button
                    className="press rounded-xl border border-border bg-surface p-2.5 text-foreground"
                    aria-label={open ? "Close menu" : "Open menu"}
                    aria-expanded={open}
                  >
                    <HamburgerIcon />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="sidebar-drawer flex w-[min(272px,90vw)] flex-col gap-0 bg-sidebar p-0"
                >
                  <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate dashboard sections.
                  </SheetDescription>
                  {sidebar}
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{title}</h1>
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              </div>

              <div
                className="relative order-last w-full md:order-none md:w-56 xl:w-64"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                }}
              >
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="search"
                  aria-label="Search findings"
                  aria-expanded={searchOpen && query.trim().length > 0}
                  aria-controls="finding-results"
                  value={query}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  placeholder="Search findings…"
                  className="w-full rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm"
                />
                {searchOpen && query.trim() && (
                  <div
                    id="finding-results"
                    className="absolute right-0 top-full mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-lg md:w-96"
                  >
                    <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
                      {matches.length} matching findings
                    </p>
                    {matches.map((f) => (
                      <Link
                        key={f.id}
                        to={f.to}
                        hash={f.id}
                        onClick={() => {
                          setSearchOpen(false);
                          setQuery("");
                        }}
                        className="block rounded-lg px-2 py-3 text-sm hover:bg-secondary"
                      >
                        <span className="mr-2 font-mono text-xs text-primary">{f.id}</span>
                        {f.title}
                      </Link>
                    ))}
                    {!matches.length && (
                      <p className="p-3 text-sm text-muted-foreground">
                        Try an ID, name, or title.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {actions}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => void refetch()}
                    disabled={isFetching}
                    aria-label="Refresh dashboard data"
                    className={`press grid size-9 place-items-center rounded-full border bg-surface transition-colors ${
                      error
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {error
                    ? "Last refresh failed — retry"
                    : isFetching
                      ? "Refreshing…"
                      : `Refresh · last loaded ${dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN") : "—"}`}
                </TooltipContent>
              </Tooltip>

              <ThemeToggle />

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => signOut.mutate()}
                    disabled={signOut.isPending}
                    aria-label="Lock the dashboard"
                    className="press grid size-9 place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <LockKeyhole className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {signOut.isPending ? "Locking…" : "Lock · the access code will be asked again"}
                </TooltipContent>
              </Tooltip>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="press relative grid size-9 place-items-center rounded-full border border-border bg-surface"
                    aria-label="Notifications"
                  >
                    <Bell className="size-4" />
                    {totals.breached > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {totals.breached > 9 ? "9+" : totals.breached}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(380px,calc(100vw-32px))] rounded-2xl">
                  <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
                  <ol className="max-h-80 space-y-3 overflow-y-auto">
                    {activity.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="font-semibold">{a.who}</span> {a.what}
                        <p className="text-xs text-muted-foreground">{a.when}</p>
                      </li>
                    ))}
                    {!activity.length && (
                      <li className="text-sm text-muted-foreground">Nothing recorded yet.</li>
                    )}
                  </ol>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-[2400px] px-3 py-4 sm:py-5"
          >
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
