// ⌘K / Ctrl+K (or "/"): jump to any screen or queue, switch reserve or theme, sign out.
// Radix Dialog gives the focus trap and Escape; cmdk gives filtering and arrow-key selection.

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { LogOut, MapPinned, Moon, Search, Sun, SunMoon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Kbd } from "../design/primitives";
import { isTypingTarget } from "../lib/keys";
import type { Reserve } from "../lib/api";
import { setTheme } from "../motion/theme";
import type { NavGroup } from "./nav";

export function useCommandShortcut(open: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
      if (combo || slash) { e.preventDefault(); open(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

function Item({ value, onSelect, icon, children, hint }: { value: string; onSelect: () => void; icon: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <Command.Item value={value} onSelect={onSelect}
      className="flex h-11 cursor-pointer items-center gap-3 rounded-[8px] px-3 text-[14px] text-fg-2 data-[selected=true]:bg-surface-3 data-[selected=true]:text-fg md:h-10">
      <span aria-hidden className="text-fg-3">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint}
    </Command.Item>
  );
}

const PALETTE_HEAT = { alarm: "var(--danger)", check: "var(--color-heat-4)", neutral: "var(--mark)" } as const;

const GROUP = "px-1 pt-2 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3";

export function CommandPalette({ open, onOpenChange, groups, reserves, reserve, setReserve, allReserves, signOut }: {
  open: boolean; onOpenChange: (v: boolean) => void; groups: NavGroup[];
  reserves: Reserve[]; reserve: string; setReserve: (c: string) => void; allReserves: boolean; signOut: () => void;
}) {
  const navigate = useNavigate();
  const run = (fn: () => void) => { onOpenChange(false); fn(); };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_140ms_ease-out]" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[14px] border border-edge-strong bg-surface shadow-[var(--lift)] data-[state=open]:animate-[palette-in_180ms_cubic-bezier(0.16,1,0.3,1)]">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" loop className="flex max-h-[min(520px,70vh)] flex-col">
            <div className="flex items-center gap-2.5 border-b border-edge px-4 focus-within:border-edge-strong focus-within:bg-surface-2">
              <Search size={17} aria-hidden className="text-fg-3" />
              <Command.Input placeholder="Jump to a screen, queue, reserve or action…"
                className="h-14 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none md:text-[15px]" />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-8 text-center text-[14px] text-fg-3">Nothing matches.</Command.Empty>
              {groups.map((g) => (
                <Command.Group key={g.title} heading={g.title} className={GROUP}>
                  {g.items.map((it) => (
                    <Item key={it.to} value={`${it.label} ${it.keywords ?? ""}`} icon={<it.icon size={16} />}
                      onSelect={() => run(() => navigate(it.to))}
                      hint={it.count ? (
                        // The same per-queue heat as the rail: one queue never reads at two heats.
                        <span className="data flex items-center gap-1.5 text-[11px] text-fg">
                          <span aria-hidden className="size-1.5 rounded-full" style={{ background: it.heat ?? PALETTE_HEAT[it.tone ?? "neutral"] }} />
                          {it.count}
                        </span>
                      ) : undefined}>
                      {it.label}
                    </Item>
                  ))}
                </Command.Group>
              ))}
              {reserves.length > 1 && (
                <Command.Group heading="Reserve" className={GROUP}>
                  {allReserves && (
                    <Item value="reserve all reserves" icon={<MapPinned size={16} />} onSelect={() => run(() => setReserve(""))}
                      hint={reserve === "" ? <span className="text-[12px] text-fg-3">current</span> : undefined}>All reserves</Item>
                  )}
                  {reserves.map((r) => (
                    <Item key={r.code} value={`reserve ${r.name} ${r.code}`} icon={<MapPinned size={16} />} onSelect={() => run(() => setReserve(r.code))}
                      hint={reserve === r.code ? <span className="text-[12px] text-fg-3">current</span> : <span className="data text-[11px] text-fg-3">{r.code}</span>}>
                      {r.name}
                    </Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Appearance" className={GROUP}>
                <Item value="theme night dark" icon={<Moon size={16} />} onSelect={() => run(() => setTheme("dark"))}>Night theme</Item>
                <Item value="theme flash daylight light" icon={<Sun size={16} />} onSelect={() => run(() => setTheme("light"))}>Flash theme (daylight)</Item>
                <Item value="theme system" icon={<SunMoon size={16} />} onSelect={() => run(() => setTheme("system"))}>Follow the system</Item>
              </Command.Group>
              <Command.Group heading="Account" className={GROUP}>
                <Item value="sign out log out" icon={<LogOut size={16} />} onSelect={() => run(signOut)}>Sign out</Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
