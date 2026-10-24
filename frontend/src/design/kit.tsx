// The console's shared parts: cards, rolling counts, heat badges that always carry a word,
// the confidence gauge, toasts with undo, skeletons and empty states. Every motion here has a
// reduced-motion path that shows the final state.

import clsx from "clsx";
import { X } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DURATION, EASE_OUT } from "../motion/tokens";
import { heatFor } from "./primitives";

export { StageBadge, type Stage } from "./primitives";

/** A card: one surface with a hairline edge. `rivets` is accepted for older callers and ignored. */
export function Plate({ children, className, rivets: _rivets = false, as: As = "div", ...rest }:
  { children: ReactNode; className?: string; rivets?: boolean; as?: "div" | "section" | "article" | "aside" | "li" } & Record<string, unknown>) {
  return (
    <As className={clsx("relative rounded-[var(--radius-card)] border border-edge bg-surface", className)} {...rest}>
      {children}
    </As>
  );
}

/** A number that rolls to its new value. */
export function CountNumber({ value, className, format = (n: number) => Math.round(n).toLocaleString() }:
  { value: number; className?: string; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  const first = useRef(true);
  useEffect(() => {
    if (reduce || first.current) { mv.set(value); first.current = false; return; }
    const controls = animate(mv, value, { duration: DURATION.slow * 1.6, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span className={clsx("tabular", className)}>{text}</motion.span>;
}

/** A count that pops when it changes. Hot tones mean a person is needed. */
export function CountBadge({ n, tone = "neutral", label }: { n: number; tone?: "neutral" | "check" | "alarm"; label?: string }) {
  const reduce = useReducedMotion();
  if (!n) return null;
  const tones = {
    neutral: "bg-surface-3 text-fg",
    check: "bg-decide text-on-decide",
    alarm: "bg-danger text-on-danger",
  } as const;
  return (
    <motion.span key={n} aria-label={label ? `${n} ${label}` : undefined}
      initial={reduce ? false : { scale: 1.3 }} animate={{ scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      className={clsx("data inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-semibold", tones[tone])}>
      {n}
    </motion.span>
  );
}

/** Confidence on the thermal scale: a half gauge with marks at the routing lines 0.6 and 0.9. */
export function ConfidenceDial({ value, size = 120 }: { value: number | null; size?: number }) {
  const reduce = useReducedMotion();
  const v = value ?? 0;
  const tick = (t: number) => {
    const a = Math.PI * (1 - t);
    return { x1: 60 + 43 * Math.cos(a), y1: 60 - 43 * Math.sin(a), x2: 60 + 57 * Math.cos(a), y2: 60 - 57 * Math.sin(a) };
  };
  return (
    <svg viewBox="0 0 120 66" width={size} role="img"
      aria-label={value === null ? "No confidence score" : `Confidence ${v.toFixed(2)}: ${v >= 0.9 ? "auto-accept band" : v >= 0.6 ? "review band" : "uncertain band"}`}>
      <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke="var(--surface-3)" strokeWidth="8" strokeLinecap="round" />
      <motion.path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke={heatFor(v)} strokeWidth="8" strokeLinecap="round" pathLength={1}
        strokeDasharray="1" initial={reduce ? false : { strokeDashoffset: 1 }} animate={{ strokeDashoffset: 1 - v }}
        transition={{ duration: DURATION.slow * 2, ease: EASE_OUT }} />
      {[0.6, 0.9].map((t) => <line key={t} {...tick(t)} stroke="var(--fg-2)" strokeWidth="1.5" />)}
    </svg>
  );
}

/** Loading placeholder with a slow sheen; flat under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton rounded-[8px] bg-surface-2", className)} />;
}

/** What is (not) here and what to do next. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Plate className="grid justify-items-start gap-2 px-6 py-7">
      {icon && <span aria-hidden className="grid size-10 place-items-center rounded-full border border-edge bg-surface-2 text-fg-2">{icon}</span>}
      <p className="text-[17px] font-semibold">{title}</p>
      {children && <div className="max-w-[60ch] text-[14px] text-fg-2">{children}</div>}
      {action}
    </Plate>
  );
}

/** A labelled number: a reading at a glance. Hot tones only when the number is above zero. */
export function StatTile({ label, value, note, tone }: { label: string; value: number; note?: ReactNode; tone?: "alarm" | "check" }) {
  return (
    <Plate className="px-5 py-4">
      <p className="text-[13px] text-fg-2">{label}</p>
      <CountNumber value={value} className={clsx("wide mt-2 block text-[38px]",
        tone === "alarm" && value > 0 && "text-danger", tone === "check" && value > 0 && "text-decide-fg")} />
      {note && <p className="mt-2 text-[12.5px] text-fg-3">{note}</p>}
    </Plate>
  );
}

/** Secondary button as a class string (for links and older callers). */
export const BUTTON = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius-ctl)] border border-edge bg-surface-2 px-3 text-[13.5px] font-medium text-fg transition-colors duration-[var(--duration-fast)] hover:bg-surface-3 disabled:opacity-45 md:h-9";
/** A form field. 16px on phones so iOS does not zoom. */
export const FIELD = "h-11 rounded-[var(--radius-ctl)] border border-edge bg-surface px-2.5 text-[16px] text-fg placeholder:text-fg-3 hover:border-edge-strong md:h-9 md:text-[13.5px]";

/** A screen's title, its state badges, one paragraph of plain explanation and its actions. */
export function PageHeader({ title, badges, children, actions }: { title: string; badges?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="grid min-w-0 flex-1 gap-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="wide text-[clamp(1.6rem,2.6vw,2.1rem)]">{title}</h1>
          {badges}
        </div>
        {children && <div className="max-w-[72ch] text-[14px] text-fg-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** A small choice of views or filters; the raised plate slides to the chosen one. */
export function Segmented<T extends string>({ label, options, value, onChange }:
  { label: string; options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] border border-edge bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={clsx("relative h-11 rounded-[8px] px-3 text-[13px] font-medium md:h-8", value === o.value ? "text-fg" : "text-fg-2 hover:text-fg")}>
          {value === o.value && (
            <motion.span layoutId={id} aria-hidden className="absolute inset-0 rounded-[8px] border border-edge-strong bg-surface-3"
              transition={reduce ? { duration: 0 } : { duration: DURATION.base, ease: EASE_OUT }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------- toasts

interface Toast { id: number; message: string; tone: "info" | "ok" | "alarm"; action?: { label: string; run: () => void } }
interface ToastApi { show: (t: Omit<Toast, "id">) => void }
const ToastCtx = createContext<ToastApi>({ show: () => {} });

/** Short confirmations at the bottom of the screen; consequential ones offer Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useReducedMotion();
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    // A toast that offers Undo stays until it is dismissed or replaced: no time limit on a
    // way back (WCAG timing). Plain confirmations fade on their own.
    if (!t.action) window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-50 grid justify-items-end gap-2 md:inset-x-6 md:bottom-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div key={t.id} layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: DURATION.fast } }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
              className={clsx("pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[12px] border py-2.5 pr-2 pl-4 text-[14px] shadow-[var(--lift)]",
                t.tone === "alarm" ? "border-transparent bg-danger text-on-danger" : "border-edge-strong bg-surface-3 text-fg")}>
              {t.tone === "ok" && <span aria-hidden className="size-2 shrink-0 rounded-full bg-settled" />}
              <span className="flex-1">{t.message}</span>
              {t.action && (
                <button type="button" onClick={() => { t.action?.run(); dismiss(t.id); }}
                  className="min-h-11 rounded-[8px] bg-fg px-3.5 text-[13px] font-semibold text-canvas hover:opacity-90 md:min-h-8">
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}
                className="grid size-11 shrink-0 place-items-center rounded-[8px] opacity-80 hover:bg-black/10 hover:opacity-100 md:size-8">
                <X size={16} aria-hidden />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = (): ToastApi => useContext(ToastCtx);
