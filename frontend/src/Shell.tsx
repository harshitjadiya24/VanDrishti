import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Activity, Ban, Bell, Eye, FileText, Fingerprint, HelpCircle, LayoutDashboard, PawPrint, ScrollText, ShieldAlert, Signpost, Siren, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import { NavLink } from "react-router";
import { api, ApiError, setCsrf, type QueueKind } from "./api";
import { SessionProvider, useSession } from "./context";
import { PageTransition } from "./motion/PageTransition";
import { getTheme, setTheme, subscribeTheme, type ThemeChoice } from "./motion/theme";
import { LoginScreen } from "./screens/LoginScreen";

const QUEUES: { kind: QueueKind; label: string; icon: ComponentType<{ size?: number }>; tone: string; perm: string }[] = [
  { kind: "people_vehicles", label: "People & vehicles", icon: ShieldAlert, tone: "text-alarm", perm: "review_people" },
  { kind: "review", label: "To review", icon: Eye, tone: "text-amber", perm: "review_species" },
  { kind: "uncertain", label: "Uncertain", icon: HelpCircle, tone: "text-amber", perm: "review_species" },
  { kind: "blank", label: "Likely blank (sample)", icon: Ban, tone: "text-dim", perm: "review_species" },
  { kind: "quality", label: "Quality", icon: Sparkles, tone: "text-dim", perm: "review_species" },
];

/** Another person may sign in next: forget everything fetched for the previous one. */
function dropOtherData(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

/** Signed in: the console. Not signed in (401): the sign-in screen. */
export function Shell() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: 60_000 });
  if (me.isPending) return <p className="p-6 text-dim">Loading…</p>;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <LoginScreen onSignedIn={(m) => { dropOtherData(qc); qc.setQueryData(["me"], m); }} />;
    }
    return <p role="alert" className="p-6 text-alarm">Cannot reach the server: {String(me.error)}</p>;
  }
  setCsrf(me.data.csrf_token);
  return (
    <SessionProvider key={me.data.username} me={me.data}>
      <Layout />
    </SessionProvider>
  );
}

function Layout() {
  const { reserve, setReserve, me, can } = useSession();
  const qc = useQueryClient();
  const signOut = async () => {
    try { await api.logout(); } finally { dropOtherData(qc); await qc.resetQueries({ queryKey: ["me"] }); }
  };
  const reserves = useQuery({ queryKey: ["reserves"], queryFn: api.reserves });
  const counts = useQuery({
    queryKey: ["counts", reserve],
    queryFn: () => api.counts(reserve || undefined),
    refetchInterval: 30_000,
  });
  const alertCounts = useQuery({
    queryKey: ["alert-counts", reserve],
    queryFn: () => api.alertCounts(reserve || undefined),
    refetchInterval: 30_000,
  });
  const urgent = (alertCounts.data?.critical ?? 0) + (alertCounts.data?.warning ?? 0);
  const allReserves = me?.reserves.includes("*") ?? true;
  const settings = (
    <>
      <label className="grid gap-1 text-[12px] text-dim">
        Reserve
        <select
          value={reserve}
          onChange={(e) => setReserve(e.target.value)}
          className="h-9 w-full min-w-0 rounded-md border border-line bg-base px-2 text-[14px] text-ink"
        >
          {allReserves && <option value="">All reserves</option>}
          {(reserves.data ?? []).map((r) => (
            <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
          ))}
        </select>
      </label>
      <ThemeSwitch />
      <div className="flex items-center gap-2 text-[13px]">
        <span className="min-w-0 flex-1 truncate">
          {me?.display_name} <span className="text-dim">({me?.role})</span>
        </span>
        <button type="button" onClick={signOut} className="rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:text-ink">
          Sign out
        </button>
      </div>
    </>
  );
  const link = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] transition-colors",
      isActive ? "bg-raised text-ink" : "text-dim hover:bg-panel hover:text-ink",
    );
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-line bg-panel md:w-64 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <span aria-hidden className="flex gap-1">
            <span className="size-2 rounded-full bg-amber shadow-[0_0_10px_2px_rgba(227,163,59,.45)]" />
            <span className="size-2 rounded-full bg-amber shadow-[0_0_10px_2px_rgba(227,163,59,.45)]" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">VanDrishti</span>
        </div>
        {/* On phones the settings fold away and the queues become a scrolling row. */}
        <details className="group px-4 pb-3 md:hidden">
          <summary className="cursor-pointer list-none text-[13px] text-dim">
            {reserve || "All reserves"}, {me?.display_name} <span className="text-amber">change</span>
          </summary>
          <div className="mt-2 grid gap-3">{settings}</div>
        </details>
        <div className="hidden gap-3 px-4 pb-3 md:grid">{settings}</div>
        <nav aria-label="Queues" className="flex gap-1.5 overflow-x-auto px-4 pb-3 md:hidden">
          {[{ to: "/app/dashboard", label: "Dashboard", n: undefined, perm: "view" }, { to: "/app/alerts", label: "Alerts", n: urgent || undefined, perm: "view" },
            { to: "/app/reports", label: "Reports", n: undefined, perm: "view" }, { to: "/app/identity", label: "Tiger identities", n: undefined, perm: "view" },
            { to: "/app/tigers", label: "Named tigers", n: undefined, perm: "view" }, { to: "/app/routing", label: "Routing", n: undefined, perm: "view" },
            ...QUEUES.map((q) => ({ to: `/app/review/${q.kind}`, label: q.label, n: counts.data?.[q.kind], perm: q.perm })),
            { to: "/app/risk", label: "Poaching risk", n: undefined, perm: "view" }, { to: "/app/feedback", label: "Feedback", n: undefined, perm: "view" },
            { to: "/app/audit", label: "Audit", n: undefined, perm: "view_audit" }].filter((x) => can(x.perm)).map((x) => (
            <NavLink key={x.to} to={x.to}
              className={({ isActive }) => clsx("shrink-0 rounded-full border px-3 py-1 text-[13px] whitespace-nowrap",
                isActive ? "border-amber text-ink" : "border-line text-dim")}>
              {x.label}{x.n ? ` ${x.n}` : ""}
            </NavLink>
          ))}
        </nav>
        <nav aria-label="Main" className="hidden gap-0.5 px-2 pb-4 md:grid">
          <NavLink to="/app/dashboard" className={link}><LayoutDashboard size={17} /> Dashboard</NavLink>
          <NavLink to="/app/alerts" className={link}>
            <span className={urgent ? "text-alarm" : undefined}><Bell size={17} /></span>
            <span className="flex-1">Alerts</span>
            {urgent ? <span className="rounded-full bg-base px-2 text-[12px] tabular-nums text-ink">{urgent}</span> : null}
          </NavLink>
          <NavLink to="/app/reports" className={link}><FileText size={17} /> Reports and exports</NavLink>
          <NavLink to="/app/identity" className={link}><span className="text-amber"><Fingerprint size={17} /></span> Tiger identities</NavLink>
          <NavLink to="/app/tigers" className={link}><PawPrint size={17} /> Named tigers</NavLink>
          <NavLink to="/app/routing" className={link}><Signpost size={17} /> Routing (section 7)</NavLink>
          <div className="mt-3 px-2.5 pb-1 text-[12px] text-dim">Review queues (section 8)</div>
          {QUEUES.filter((q) => can(q.perm)).map(({ kind, label, icon: Icon, tone }) => {
            const n = counts.data?.[kind];
            return (
              <NavLink key={kind} to={`/app/review/${kind}`} className={link}>
                <span className={tone}><Icon size={17} /></span>
                <span className="flex-1">{label}</span>
                {n ? <span className="rounded-full bg-base px-2 text-[12px] tabular-nums text-ink">{n}</span> : null}
              </NavLink>
            );
          })}
          <div className="mt-3 px-2.5 pb-1 text-[12px] text-dim">Section 6</div>
          <NavLink to="/app/risk" className={link}><span className="text-alarm"><Siren size={17} /></span> Poaching risk</NavLink>
          <div className="mt-3 px-2.5 pb-1 text-[12px] text-dim">Records</div>
          <NavLink to="/app/feedback" className={link}><Activity size={17} /> Feedback</NavLink>
          {can("view_audit") && <NavLink to="/app/audit" className={link}><ScrollText size={17} /> Audit trail</NavLink>}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <PageTransition />
      </main>
    </div>
  );
}

export { QUEUES };

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Daylight" },
  { value: "dark", label: "Night" },
];

/** Daylight for field and desk work; night patrol for long night-IR sessions. */
function ThemeSwitch() {
  const choice = useSyncExternalStore(subscribeTheme, getTheme);
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-md border border-line p-0.5 text-[12px]">
      {THEMES.map((t) => (
        <button key={t.value} type="button" role="radio" aria-checked={choice === t.value}
          onClick={() => setTheme(t.value)}
          className={clsx("rounded px-2 py-1", choice === t.value ? "bg-raised text-ink" : "text-dim hover:text-ink")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

