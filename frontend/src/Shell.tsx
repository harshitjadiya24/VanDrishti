import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity, Ban, Bell, Eye, FileText, Fingerprint, HelpCircle, LayoutDashboard, Menu, PawPrint, ScrollText,
  ShieldAlert, Signpost, Siren, Sparkles, X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ComponentType, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NavLink, useLocation } from "react-router";
import { api, ApiError, setCsrf, type QueueKind } from "./api";
import { CountBadge, ToastProvider } from "./components/kit";
import { SessionProvider, useSession } from "./context";
import { PageTransition } from "./motion/PageTransition";
import { getTheme, setTheme, subscribeTheme, type ThemeChoice } from "./motion/theme";
import { DURATION, EASE_BOARD } from "./motion/tokens";
import { LoginScreen } from "./screens/LoginScreen";

type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

const QUEUES: { kind: QueueKind; label: string; icon: Icon; tone: "neutral" | "check" | "alarm"; perm: string }[] = [
  { kind: "people_vehicles", label: "People & vehicles", icon: ShieldAlert, tone: "alarm", perm: "review_people" },
  { kind: "review", label: "To review", icon: Eye, tone: "check", perm: "review_species" },
  { kind: "uncertain", label: "Uncertain", icon: HelpCircle, tone: "check", perm: "review_species" },
  { kind: "blank", label: "Likely blank (sample)", icon: Ban, tone: "neutral", perm: "review_species" },
  { kind: "quality", label: "Quality", icon: Sparkles, tone: "neutral", perm: "review_species" },
];

interface NavItem { to: string; label: string; icon: Icon; perm: string; count?: number; tone?: "neutral" | "check" | "alarm" }
interface NavGroup { title: string; milestone?: number; items: NavItem[] }

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
      <ToastProvider>
        <Layout />
      </ToastProvider>
    </SessionProvider>
  );
}

function Layout() {
  const { reserve, can } = useSession();
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

  // Navigation follows the road: what you see, where the model decides, where people
  // review, what gets acted on, and the record.
  const groups: NavGroup[] = ([
    { title: "Insight", items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "view" },
      { to: "/app/tigers", label: "Named tigers", icon: PawPrint, perm: "view" },
      { to: "/app/feedback", label: "Feedback", icon: Activity, perm: "view" },
    ] },
    { title: "Decide", milestone: 3, items: [
      { to: "/app/routing", label: "Routing", icon: Signpost, perm: "view" },
    ] },
    { title: "Review", milestone: 4, items: [
      ...QUEUES.map((q) => ({ to: `/app/review/${q.kind}`, label: q.label, icon: q.icon, perm: q.perm,
        count: counts.data?.[q.kind], tone: q.tone })),
      { to: "/app/identity", label: "Tiger identities", icon: Fingerprint, perm: "view" },
    ] },
    { title: "Act", milestone: 5, items: [
      { to: "/app/alerts", label: "Alerts", icon: Bell, perm: "view", count: urgent, tone: "alarm" },
      { to: "/app/risk", label: "Poaching risk", icon: Siren, perm: "view" },
      { to: "/app/reports", label: "Reports and exports", icon: FileText, perm: "view" },
    ] },
    { title: "Records", items: [
      { to: "/app/audit", label: "Audit trail", icon: ScrollText, perm: "view_audit" },
    ] },
  ] as NavGroup[]).map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length > 0);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setMenuOpen(false); } // a link was followed

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Phones: a slim board with the alerts count and the menu. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-board px-4 py-2.5 text-on-board md:hidden">
        <Wordmark compact />
        <span className="flex-1" />
        <NavLink to="/app/alerts" aria-label={`Alerts${urgent ? `, ${urgent} open` : ""}`}
          className="relative grid size-10 place-items-center rounded-[8px] hover:bg-white/10">
          <Bell size={20} aria-hidden />
          {urgent > 0 && <span className="absolute -top-0.5 -right-0.5"><CountBadge n={urgent} tone="alarm" /></span>}
        </NavLink>
        <button ref={menuButton} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="console-menu"
          className="grid size-10 place-items-center rounded-[8px] hover:bg-white/10" aria-label="Open menu">
          <Menu size={22} aria-hidden />
        </button>
      </header>

      <aside className="hidden w-[272px] shrink-0 md:block">
        <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto bg-board text-on-board">
          <SideBoard groups={groups} />
        </div>
      </aside>

      <MenuSheet open={menuOpen} onClose={() => { setMenuOpen(false); menuButton.current?.focus(); }}>
        <SideBoard groups={groups} layoutKey="sheet" />
      </MenuSheet>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1360px]">
          <PageTransition />
        </div>
      </main>
    </div>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={clsx("board-title uppercase", compact ? "text-[24px]" : "text-[30px]")}>VanDrishti</span>
      {!compact && <span lang="hi" className="deva text-[15px] text-on-board-dim">वनदृष्टि</span>}
    </span>
  );
}

/** The sidebar's contents: one green board with the road's stages as groups. */
function SideBoard({ groups, layoutKey = "side" }: { groups: NavGroup[]; layoutKey?: string }) {
  const reduce = useReducedMotion();
  return (
    <>
      <div className="px-5 pt-5 pb-3"><Wordmark /></div>
      <nav aria-label="Console" className="grid flex-1 content-start gap-4 px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1 flex items-center gap-2 px-2 text-[13px] font-semibold text-on-board-dim">
              {g.milestone && (
                <span aria-hidden className="grid h-5 w-4 place-items-center rounded-t-[8px] rounded-b-[2px] bg-on-board text-[10px] font-bold text-board">
                  {g.milestone}
                </span>
              )}
              {g.title}
            </p>
            <ul className="grid gap-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to}
                    className={({ isActive }) => clsx("relative flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[15px]",
                      isActive ? "font-semibold text-board" : "text-on-board/90 hover:bg-white/10")}>
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId={`nav-plate-${layoutKey}`} aria-hidden
                            className="absolute inset-0 rounded-[8px] bg-on-board shadow-[0_2px_0_rgb(0_0_0/0.25)]"
                            transition={reduce ? { duration: 0 } : { duration: DURATION.board, ease: EASE_BOARD }} />
                        )}
                        <span className="relative"><it.icon size={17} aria-hidden /></span>
                        <span className="relative flex-1">{it.label}</span>
                        {it.count ? <span className="relative"><CountBadge n={it.count} tone={isActive ? "neutral" : it.tone} /></span> : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <Settings />
    </>
  );
}

/** Reserve, theme and the signed-in person, at the foot of the board. */
function Settings() {
  const { reserve, setReserve, me } = useSession();
  const qc = useQueryClient();
  const reserves = useQuery({ queryKey: ["reserves"], queryFn: api.reserves });
  const allReserves = me?.reserves.includes("*") ?? true;
  const signOut = async () => {
    try { await api.logout(); } finally { dropOtherData(qc); await qc.resetQueries({ queryKey: ["me"] }); }
  };
  return (
    <div className="grid gap-3 border-t border-board-line px-4 pt-4 pb-5">
      <label className="grid gap-1 text-[13px] text-on-board-dim">
        Reserve
        <select value={reserve} onChange={(e) => setReserve(e.target.value)}
          className="h-9 w-full min-w-0 rounded-[8px] border border-on-board/30 bg-board-deep px-2 text-[14px] text-on-board">
          {allReserves && <option value="">All reserves</option>}
          {(reserves.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
        </select>
      </label>
      <ThemeSwitch />
      <div className="flex items-center gap-2 text-[14px]">
        <span className="min-w-0 flex-1 truncate">
          {me?.display_name} <span className="text-on-board-dim">· {me?.role}</span>
        </span>
        <button type="button" onClick={signOut}
          className="rounded-[8px] border border-on-board/30 px-2.5 py-1 text-[13px] hover:bg-white/10">
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Phones: the board slides in from the left over a dimmed page. Escape or a link closes it. */
function MenuSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button, select")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <motion.div aria-hidden className="absolute inset-0 bg-black/50" onClick={onClose}
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div ref={panel} id="console-menu" role="dialog" aria-modal="true" aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col overflow-y-auto bg-board text-on-board shadow-2xl"
            initial={reduce ? false : { x: "-100%" }} animate={{ x: 0 }} exit={reduce ? { opacity: 0 } : { x: "-100%" }}
            transition={{ duration: reduce ? 0 : DURATION.board * 0.8, ease: EASE_BOARD }}>
            <button type="button" onClick={onClose} aria-label="Close menu"
              className="absolute top-4 right-3 grid size-10 place-items-center rounded-[8px] hover:bg-white/10">
              <X size={22} aria-hidden />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-[8px] border border-on-board/30 p-0.5 text-[13px]">
      {THEMES.map((t) => (
        <button key={t.value} type="button" role="radio" aria-checked={choice === t.value}
          onClick={() => setTheme(t.value)}
          className={clsx("rounded-[6px] px-2 py-1", choice === t.value ? "bg-on-board font-semibold text-board" : "text-on-board-dim hover:text-on-board")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
