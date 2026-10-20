import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Activity, Ban, Bell, Eye, FileText, Fingerprint, HelpCircle, LayoutDashboard, PawPrint, ScrollText, ShieldAlert, Signpost, Siren, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router";
import { api, type QueueKind } from "./api";
import { SessionProvider, useSession } from "./context";

const QUEUES: { kind: QueueKind; label: string; icon: ComponentType<{ size?: number }>; tone: string }[] = [
  { kind: "people_vehicles", label: "People & vehicles", icon: ShieldAlert, tone: "text-alarm" },
  { kind: "review", label: "To review", icon: Eye, tone: "text-amber" },
  { kind: "uncertain", label: "Uncertain", icon: HelpCircle, tone: "text-amber" },
  { kind: "blank", label: "Likely blank (sample)", icon: Ban, tone: "text-dim" },
  { kind: "quality", label: "Quality", icon: Sparkles, tone: "text-dim" },
];

export function Shell() {
  return (
    <SessionProvider>
      <Layout />
    </SessionProvider>
  );
}

function Layout() {
  const { reserve, setReserve, reviewer, setReviewer } = useSession();
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
  const settings = (
    <>
          <label className="grid gap-1 text-[12px] text-dim">
        Reserve
        <select
          value={reserve}
          onChange={(e) => setReserve(e.target.value)}
          className="h-9 w-full min-w-0 rounded-md border border-line bg-base px-2 text-[14px] text-ink"
        >
          <option value="">All reserves</option>
          {(reserves.data ?? []).map((r) => (
            <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[12px] text-dim">
        Your name (shown in the audit trail)
        <input
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value.slice(0, 100))}
          placeholder="e.g. Asha"
          className="h-9 w-full min-w-0 rounded-md border border-line bg-base px-2 text-[14px] text-ink placeholder:text-dim/60"
        />
      </label>
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
            Settings: {reserve || "all reserves"}, {reviewer || "no name yet"} <span className="text-amber">change</span>
          </summary>
          <div className="mt-2 grid gap-3">{settings}</div>
        </details>
        <div className="hidden gap-3 px-4 pb-3 md:grid">{settings}</div>
        <nav aria-label="Queues" className="flex gap-1.5 overflow-x-auto px-4 pb-3 md:hidden">
          {[{ to: "/dashboard", label: "Dashboard", n: undefined }, { to: "/alerts", label: "Alerts", n: urgent || undefined },
            { to: "/reports", label: "Reports", n: undefined }, { to: "/identity", label: "Tiger identities", n: undefined },
            { to: "/tigers", label: "Named tigers", n: undefined }, { to: "/routing", label: "Routing", n: undefined }, ...QUEUES.map((q) => ({ to: `/review/${q.kind}`, label: q.label, n: counts.data?.[q.kind] })),
            { to: "/risk", label: "Poaching risk", n: undefined }, { to: "/feedback", label: "Feedback", n: undefined }, { to: "/audit", label: "Audit", n: undefined }].map((x) => (
            <NavLink key={x.to} to={x.to}
              className={({ isActive }) => clsx("shrink-0 rounded-full border px-3 py-1 text-[13px] whitespace-nowrap",
                isActive ? "border-amber text-ink" : "border-line text-dim")}>
              {x.label}{x.n ? ` ${x.n}` : ""}
            </NavLink>
          ))}
        </nav>
        <nav aria-label="Main" className="hidden gap-0.5 px-2 pb-4 md:grid">
          <NavLink to="/dashboard" className={link}><LayoutDashboard size={17} /> Dashboard</NavLink>
          <NavLink to="/alerts" className={link}>
            <span className={urgent ? "text-alarm" : undefined}><Bell size={17} /></span>
            <span className="flex-1">Alerts</span>
            {urgent ? <span className="rounded-full bg-base px-2 text-[12px] tabular-nums text-ink">{urgent}</span> : null}
          </NavLink>
          <NavLink to="/reports" className={link}><FileText size={17} /> Reports and exports</NavLink>
          <NavLink to="/identity" className={link}><span className="text-amber"><Fingerprint size={17} /></span> Tiger identities</NavLink>
          <NavLink to="/tigers" className={link}><PawPrint size={17} /> Named tigers</NavLink>
          <NavLink to="/routing" className={link}><Signpost size={17} /> Routing (section 7)</NavLink>
          <div className="mt-3 px-2.5 pb-1 text-[12px] text-dim">Review queues (section 8)</div>
          {QUEUES.map(({ kind, label, icon: Icon, tone }) => {
            const n = counts.data?.[kind];
            return (
              <NavLink key={kind} to={`/review/${kind}`} className={link}>
                <span className={tone}><Icon size={17} /></span>
                <span className="flex-1">{label}</span>
                {n ? <span className="rounded-full bg-base px-2 text-[12px] tabular-nums text-ink">{n}</span> : null}
              </NavLink>
            );
          })}
          <div className="mt-3 px-2.5 pb-1 text-[12px] text-dim">Section 6</div>
          <NavLink to="/risk" className={link}><span className="text-alarm"><Siren size={17} /></span> Poaching risk</NavLink>
          <div className="mt-3 px-2.5 pb-1 text-[12px] text-dim">Records</div>
          <NavLink to="/feedback" className={link}><Activity size={17} /> Feedback</NavLink>
          <NavLink to="/audit" className={link}><ScrollText size={17} /> Audit trail</NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <Outlet />
      </main>
    </div>
  );
}

export { QUEUES };
