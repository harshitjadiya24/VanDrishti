import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, Check, Command as CommandIcon, ChevronDown, LogOut, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, SunMoon, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { CountBadge, ToastProvider } from "../design/kit";
import { Kbd, Tip } from "../design/primitives";
import { LoginScreen } from "../features/auth/LoginScreen";
import { api, ApiError, setCsrf } from "../lib/api";
import { SessionProvider, useSession } from "../lib/session";
import { PageTransition } from "../motion/PageTransition";
import { getTheme, setTheme, subscribeTheme, type ThemeChoice } from "../motion/theme";
import { DURATION, EASE_OUT } from "../motion/tokens";
import { CommandPalette, useCommandShortcut } from "./CommandPalette";
import { buildNav, type NavGroup } from "./nav";

export { QUEUES } from "./nav";

/** Another person may sign in next: forget everything fetched for the previous one. */
function dropOtherData(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

/** Signed in: the console. Not signed in (401): the sign-in screen. */
export function Shell() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: 60_000 });
  if (me.isPending) return <div className="console grid min-h-dvh place-items-center bg-canvas text-fg-3">Loading…</div>;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <div className="console"><LoginScreen onSignedIn={(m) => { dropOtherData(qc); qc.setQueryData(["me"], m); }} /></div>;
    }
    return <p role="alert" className="console p-6 text-danger">Cannot reach the server: {String(me.error)}</p>;
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

const RAIL_KEY = "vd.rail";
const readRail = () => { try { return localStorage.getItem(RAIL_KEY) === "narrow"; } catch { return false; } };

function Layout() {
  const { reserve, setReserve, can, me } = useSession();
  const qc = useQueryClient();
  const counts = useQuery({ queryKey: ["counts", reserve], queryFn: () => api.counts(reserve || undefined), refetchInterval: 30_000 });
  const alertCounts = useQuery({ queryKey: ["alert-counts", reserve], queryFn: () => api.alertCounts(reserve || undefined), refetchInterval: 30_000 });
  const reserves = useQuery({ queryKey: ["reserves"], queryFn: api.reserves });
  const urgent = (alertCounts.data?.critical ?? 0) + (alertCounts.data?.warning ?? 0);
  const groups = buildNav(counts.data, urgent, can);
  const allReserves = me?.reserves.includes("*") ?? true;

  const [narrow, setNarrow] = useState(readRail);
  const toggleRail = () => setNarrow((v) => { try { localStorage.setItem(RAIL_KEY, v ? "wide" : "narrow"); } catch { /* per-viewer only */ } return !v; });
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const openPalette = useCallback(() => setPalette(true), [setPalette]);
  useCommandShortcut(openPalette);

  const { pathname } = useLocation();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setSheet(false); } // a link was followed
  const here = groups.flatMap((g) => g.items).find((i) => pathname.startsWith(i.to));

  const signOut = async () => {
    try { await api.logout(); } finally { dropOtherData(qc); await qc.resetQueries({ queryKey: ["me"] }); }
  };
  const reserveName = reserve ? reserves.data?.find((r) => r.code === reserve)?.name ?? reserve : "All reserves";

  return (
    <div className="console flex min-h-dvh bg-canvas text-fg">
      {/* Keyboard users skip the navigation on every screen. */}
      <a href="#content" className="sr-only z-50 rounded-[8px] bg-decide font-semibold text-on-decide focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-4 focus:py-2.5">
        Skip to content
      </a>

      <aside className={clsx("hidden shrink-0 border-r border-edge bg-surface transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)] md:block",
        narrow ? "w-[68px]" : "w-[252px]")}>
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className={clsx("flex h-14 shrink-0 items-center gap-2", narrow ? "justify-center" : "px-5")}>
            {narrow ? <span className="wide wide-max text-[18px]" aria-label="VanDrishti">V</span> : <Wordmark />}
          </div>
          <Rail groups={groups} narrow={narrow} layoutKey="rail" />
          <div className={clsx("border-t border-edge p-2", narrow && "flex justify-center")}>
            <Tip label={narrow ? "Expand the menu" : "Collapse the menu"}>
              <button type="button" onClick={toggleRail} aria-label={narrow ? "Expand the menu" : "Collapse the menu"}
                className="flex h-9 items-center gap-2 rounded-[7px] px-2.5 text-[13px] text-fg-3 hover:bg-surface-2 hover:text-fg">
                {narrow ? <PanelLeftOpen size={17} aria-hidden /> : <><PanelLeftClose size={17} aria-hidden /> Collapse</>}
              </button>
            </Tip>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-edge bg-canvas/85 px-3 backdrop-blur-xl md:px-6">
          <button type="button" onClick={() => setSheet(true)} aria-label="Open menu"
            className="grid size-11 place-items-center rounded-[8px] text-fg-2 hover:bg-surface-2 md:hidden">
            <MenuIcon size={21} aria-hidden />
          </button>
          <p className="min-w-0 truncate text-[14px] font-medium">
            <span className="text-fg-3 max-sm:hidden">{reserveName} <span aria-hidden>/</span> </span>{here?.label ?? "Console"}
          </p>
          <span className="flex-1" />
          <button type="button" onClick={openPalette}
            className="flex h-11 items-center gap-2 rounded-[var(--radius-ctl)] border border-edge bg-surface px-3 text-[13px] text-fg-3 hover:border-edge-strong hover:text-fg-2 md:h-9 md:w-[300px]">
            <Search size={15} aria-hidden /><span className="max-md:sr-only">Jump to…</span>
            <span className="ml-auto hidden gap-1 md:flex"><Kbd><CommandIcon size={10} aria-label="Command" /></Kbd><Kbd>K</Kbd></span>
          </button>
          <NavLink to="/app/alerts" aria-label={`Alerts${urgent ? `, ${urgent} open` : ""}`}
            className="relative grid size-11 place-items-center rounded-[8px] text-fg-2 hover:bg-surface-2 hover:text-fg md:size-9">
            <Bell size={18} aria-hidden />
            {urgent > 0 && <span className="absolute -top-0.5 -right-0.5"><CountBadge n={urgent} tone="alarm" /></span>}
          </NavLink>
          <ThemeMenu />
          <AccountMenu name={me?.display_name ?? ""} role={me?.role ?? ""} reserve={reserve} setReserve={setReserve}
            reserves={reserves.data ?? []} allReserves={allReserves} signOut={signOut} />
        </header>

        <main id="content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-8 md:py-8">
          <div className="mx-auto max-w-[1360px]">
            <PageTransition />
          </div>
        </main>
      </div>

      {/* Phones: the rail as a sheet. Radix gives focus trapping, Escape and focus return. */}
      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <Dialog.Portal>
          <Dialog.Overlay className="console fixed inset-0 z-40 bg-black/55 md:hidden" />
          <Dialog.Content aria-describedby={undefined}
            className="console fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-edge bg-surface text-fg shadow-[var(--lift)] data-[state=open]:animate-[sheet-in_240ms_cubic-bezier(0.16,1,0.3,1)] md:hidden">
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <div className="flex h-14 items-center justify-between pr-2 pl-5">
              <Wordmark />
              <Dialog.Close aria-label="Close menu" className="grid size-11 place-items-center rounded-[8px] text-fg-2 hover:bg-surface-2">
                <X size={20} aria-hidden />
              </Dialog.Close>
            </div>
            <Rail groups={groups} narrow={false} layoutKey="sheet" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} reserves={reserves.data ?? []}
        reserve={reserve} setReserve={setReserve} allReserves={allReserves} signOut={signOut} />
    </div>
  );
}

function Wordmark() {
  return (
    <span className="flex items-baseline gap-2">
      <span className="wide wide-max text-[17px]">VanDrishti</span>
      <span lang="hi" className="hindi text-[13px] text-fg-3">वनदृष्टि</span>
    </span>
  );
}

const HEAT = { alarm: "var(--danger)", check: "var(--color-heat-4)", neutral: "var(--mark)" } as const;

/** The navigation. Counts glow on the heat scale: hot means people are waiting. */
function Rail({ groups, narrow, layoutKey }: { groups: NavGroup[]; narrow: boolean; layoutKey: string }) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Console" className={clsx("flex-1 overflow-y-auto pb-4", narrow ? "px-2" : "px-3")}>
      {groups.map((g) => (
        <div key={g.title} className="pt-4">
          {narrow ? <hr className="mx-2 mb-2 border-edge" /> : <p className="px-2.5 pb-1.5 text-[11.5px] font-medium text-fg-3">{g.title}</p>}
          <ul className="grid gap-px">
            {g.items.map((it) => {
              const link = (
                <NavLink to={it.to} aria-label={narrow ? `${it.label}${it.count ? `, ${it.count}` : ""}` : undefined}
                  className={({ isActive }) => clsx("relative flex min-h-11 items-center gap-2.5 rounded-[8px] text-[13.5px] md:min-h-9",
                    narrow ? "justify-center px-0" : "px-2.5", isActive ? "text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId={`nav-${layoutKey}`} aria-hidden className="absolute inset-0 rounded-[8px] border border-edge bg-surface-3"
                          transition={reduce ? { duration: 0 } : { duration: DURATION.base, ease: EASE_OUT }} />
                      )}
                      <span className="relative"><it.icon size={17} strokeWidth={1.8} aria-hidden /></span>
                      {!narrow && <span className="relative flex-1 truncate">{it.label}</span>}
                      {it.count ? (
                        narrow
                          ? <span aria-hidden className="absolute top-1.5 right-2 size-1.5 rounded-full" style={{ background: HEAT[it.tone ?? "neutral"] }} />
                          : <span className="data relative flex items-center gap-1.5 text-[11px] text-fg">
                              <span aria-hidden className="size-1.5 rounded-full" style={{ background: HEAT[it.tone ?? "neutral"], boxShadow: it.tone !== "neutral" ? `0 0 7px ${HEAT[it.tone ?? "neutral"]}` : undefined }} />
                              {it.count}
                            </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
              // The tooltip trigger wraps the link: Radix's Slot would flatten NavLink's className function.
              return <li key={it.to}>{narrow ? <Tip label={it.label}><span className="block">{link}</span></Tip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const MENU = "z-50 min-w-[220px] rounded-[12px] border border-edge-strong bg-surface p-1 text-[13.5px] text-fg shadow-[var(--lift)] data-[state=open]:animate-[fade-in_120ms_ease-out]";
const MENU_ITEM = "flex h-11 cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 outline-none data-[highlighted]:bg-surface-3 md:h-9";

const THEMES: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "dark", label: "Night", icon: <Moon size={15} aria-hidden /> },
  { value: "light", label: "Flash (daylight)", icon: <Sun size={15} aria-hidden /> },
  { value: "system", label: "Follow the system", icon: <SunMoon size={15} aria-hidden /> },
];

function ThemeMenu() {
  const choice = useSyncExternalStore(subscribeTheme, getTheme);
  const current = THEMES.find((t) => t.value === choice) ?? THEMES[0];
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`Theme: ${current.label}`} className="grid size-11 place-items-center rounded-[8px] text-fg-2 hover:bg-surface-2 hover:text-fg md:size-9">
        {current.icon}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={clsx("console", MENU)}>
          <Menu.Label className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-fg-3">Theme</Menu.Label>
          <Menu.RadioGroup value={choice} onValueChange={(v) => setTheme(v as ThemeChoice)}>
            {THEMES.map((t) => (
              <Menu.RadioItem key={t.value} value={t.value} className={MENU_ITEM}>
                {t.icon}<span className="flex-1">{t.label}</span>
                <Menu.ItemIndicator><Check size={15} aria-hidden /></Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function AccountMenu({ name, role, reserve, setReserve, reserves, allReserves, signOut }: {
  name: string; role: string; reserve: string; setReserve: (c: string) => void;
  reserves: { code: string; name: string }[]; allReserves: boolean; signOut: () => void;
}) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`Account and reserve: ${name}`}
        className="flex h-11 items-center gap-1.5 rounded-[8px] pr-1.5 pl-1 hover:bg-surface-2 md:h-9">
        <span aria-hidden className="grid size-7 place-items-center rounded-full border border-edge-strong bg-surface-3 text-[11px] font-semibold">{initials}</span>
        <ChevronDown size={14} aria-hidden className="text-fg-3" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={clsx("console", MENU)}>
          <div className="px-2.5 pt-2 pb-2">
            <p className="font-medium">{name}</p>
            <p className="text-[12.5px] text-fg-3 capitalize">{role}</p>
          </div>
          <Menu.Separator className="my-1 h-px bg-edge" />
          <Menu.Label className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-fg-3">Reserve</Menu.Label>
          <Menu.RadioGroup value={reserve} onValueChange={setReserve}>
            {allReserves && (
              <Menu.RadioItem value="" className={MENU_ITEM}>
                <span className="flex-1">All reserves</span><Menu.ItemIndicator><Check size={15} aria-hidden /></Menu.ItemIndicator>
              </Menu.RadioItem>
            )}
            {reserves.map((r) => (
              <Menu.RadioItem key={r.code} value={r.code} className={MENU_ITEM}>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="data text-[10.5px] text-fg-3">{r.code}</span>
                <Menu.ItemIndicator><Check size={15} aria-hidden /></Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="my-1 h-px bg-edge" />
          <Menu.Item onSelect={signOut} className={MENU_ITEM}><LogOut size={15} aria-hidden /> Sign out</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
