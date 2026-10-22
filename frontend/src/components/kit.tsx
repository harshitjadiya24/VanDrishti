// The console's shared parts in the Forest Board world: enamel plates, counts that roll like
// milestone digits, route badges that always carry a word, toasts with undo, skeletons and
// empty states. Every motion here has a reduced-motion path that shows the final state.

import clsx from "clsx";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DURATION, EASE_BOARD, EASE_STAMP } from "../motion/tokens";

/** An enamel plate: the console's card. Rivets mark plates that hold a record or decision. */
export function Plate({ children, className, rivets = false, as: As = "div", ...rest }:
  { children: ReactNode; className?: string; rivets?: boolean; as?: "div" | "section" | "article" | "aside" | "li" } & Record<string, unknown>) {
  return (
    <As className={clsx("relative rounded-[12px] bg-panel shadow-[var(--shadow-plate)]", className)} {...rest}>
      {rivets && ["left-2 top-2", "right-2 top-2", "left-2 bottom-2", "right-2 bottom-2"].map((p) => (
        <span key={p} aria-hidden className={`absolute size-1.5 rounded-full bg-line ${p}`} />
      ))}
      {children}
    </As>
  );
}

/** A number that rolls to its new value like a milestone being repainted. */
export function CountNumber({ value, className, format = (n: number) => Math.round(n).toLocaleString() }:
  { value: number; className?: string; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  const first = useRef(true);
  useEffect(() => {
    if (reduce || first.current) { mv.set(value); first.current = false; return; }
    const controls = animate(mv, value, { duration: DURATION.board * 1.4, ease: EASE_BOARD });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span className={clsx("tabular", className)}>{text}</motion.span>;
}

/** A count pill that pops when its number changes (new items waiting for a person). */
export function CountBadge({ n, tone = "neutral", label }: { n: number; tone?: "neutral" | "check" | "alarm"; label?: string }) {
  const reduce = useReducedMotion();
  if (!n) return null;
  const tones = {
    neutral: "bg-on-board/15 text-on-board",
    check: "bg-check text-on-check",
    alarm: "bg-[#c8372d] text-white",
  } as const;
  return (
    <motion.span key={n} aria-label={label ? `${n} ${label}` : undefined}
      initial={reduce ? false : { scale: 1.35 }} animate={{ scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE_STAMP }}
      className={clsx("tabular inline-grid min-w-6 place-items-center rounded-full px-1.5 text-[12px] leading-5 font-semibold", tones[tone])}>
      {n}
    </motion.span>
  );
}

/** Where an item is on the road. A word always comes with the colour. */
export type Stage = "auto" | "review" | "uncertain" | "people" | "blank" | "quality" | "done";
const STAGE: Record<Stage, { word: string; cls: string }> = {
  auto: { word: "Auto-accepted", cls: "bg-ok text-on-ok" },
  review: { word: "Needs a person", cls: "bg-check text-on-check" },
  uncertain: { word: "Uncertain", cls: "bg-check text-on-check" },
  people: { word: "People or vehicles", cls: "bg-alarm text-on-alarm" },
  blank: { word: "Likely blank", cls: "bg-raised text-ink" },
  quality: { word: "Quality problem", cls: "bg-raised text-ink" },
  done: { word: "Decided by a person", cls: "border-2 border-ok text-ok" },
};
export function StageBadge({ stage, children }: { stage: Stage; children?: ReactNode }) {
  const s = STAGE[stage];
  return <span className={clsx("inline-flex items-center rounded-[6px] px-2 py-0.5 text-[13px] font-semibold", s.cls)}>{children ?? s.word}</span>;
}

/** A half dial with marks at the routing thresholds 0.6 and 0.9. */
export function ConfidenceDial({ value, size = 120 }: { value: number | null; size?: number }) {
  const reduce = useReducedMotion();
  const v = value ?? 0;
  const tick = (t: number) => {
    const a = Math.PI * (1 - t);
    return { x1: 60 + 44 * Math.cos(a), y1: 60 - 44 * Math.sin(a), x2: 60 + 55 * Math.cos(a), y2: 60 - 55 * Math.sin(a) };
  };
  const tone = v >= 0.9 ? "var(--ok)" : v >= 0.6 ? "var(--color-check)" : "var(--alarm)";
  return (
    <svg viewBox="0 0 120 66" width={size} role="img"
      aria-label={value === null ? "No confidence score" : `Confidence ${v.toFixed(2)}: ${v >= 0.9 ? "auto-accept band" : v >= 0.6 ? "review band" : "uncertain band"}`}>
      <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke="var(--line)" strokeWidth="9" />
      <motion.path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke={tone} strokeWidth="9" pathLength={1}
        strokeDasharray="1" initial={reduce ? false : { strokeDashoffset: 1 }} animate={{ strokeDashoffset: 1 - v }}
        transition={{ duration: DURATION.board * 1.8, ease: EASE_BOARD }} />
      {[0.6, 0.9].map((t) => <line key={t} {...tick(t)} stroke="var(--ink)" strokeWidth="2" />)}
    </svg>
  );
}

/** Loading placeholder with a slow sheen; flat under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton rounded-[8px] bg-raised", className)} />;
}

/** An empty state as a small forest sign: what is (not) here and what to do next. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Plate className="grid justify-items-start gap-2 px-5 py-6">
      {icon && <span aria-hidden className="grid size-10 place-items-center rounded-full bg-raised text-dim">{icon}</span>}
      <p className="text-[18px] font-semibold">{title}</p>
      {children && <div className="max-w-[60ch] text-[15px] text-dim">{children}</div>}
      {action}
    </Plate>
  );
}

/** A labelled number on a plate: the dashboard's reading at a glance. */
export function StatTile({ label, value, note, tone }: { label: string; value: number; note?: ReactNode; tone?: "alarm" | "check" }) {
  return (
    <Plate className="px-4 py-4">
      <p className="text-[14px] text-dim">{label}</p>
      <CountNumber value={value} className={clsx("mt-1 block text-[34px] leading-none font-semibold",
        tone === "alarm" && value > 0 && "text-alarm", tone === "check" && value > 0 && "text-amber")} />
      {note && <p className="mt-2 text-[13px] text-dim">{note}</p>}
    </Plate>
  );
}

/** The console's secondary button: an outlined plate. */
export const BUTTON = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[8px] border border-line px-3 text-[14px] hover:bg-raised disabled:opacity-40 md:h-9";
/** A form field on a plate. */
export const FIELD = "h-11 rounded-[8px] border border-line bg-base px-2.5 text-[16px] text-ink md:h-9 md:text-[14px]";

/** A screen's title, its state badges, one paragraph of plain explanation and its actions. */
export function PageHeader({ title, badges, children, actions }: { title: string; badges?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[26px] font-semibold">{title}</h1>
          {badges}
        </div>
        {children && <div className="max-w-[72ch] text-[15px] text-dim">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** A small choice of views or filters; the dark plate slides to the chosen one. */
export function Segmented<T extends string>({ label, options, value, onChange }:
  { label: string; options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-[10px] border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={clsx("relative h-10 rounded-[8px] px-3 text-[14px] md:h-8", value === o.value ? "text-panel" : "text-dim hover:text-ink")}>
          {value === o.value && (
            <motion.span layoutId={id} aria-hidden className="absolute inset-0 rounded-[8px] bg-ink"
              transition={reduce ? { duration: 0 } : { duration: DURATION.base, ease: EASE_BOARD }} />
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
    // way back. Plain confirmations fade on their own.
    if (!t.action) window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-50 grid justify-items-end gap-2 md:inset-x-6 md:bottom-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div key={t.id} layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: DURATION.quick } }}
              transition={{ duration: DURATION.base, ease: EASE_BOARD }}
              className={clsx("pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[12px] px-4 py-3 text-[15px] shadow-[var(--shadow-plate)]",
                t.tone === "alarm" ? "bg-alarm text-on-alarm" : "bg-board text-on-board")}>
              <span className="flex-1">{t.message}</span>
              {t.action && (
                <button type="button" onClick={() => { t.action?.run(); dismiss(t.id); }}
                  className="rounded-[8px] bg-on-board px-3 py-1 text-[14px] font-semibold text-board hover:bg-white">
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-[18px] leading-none opacity-70 hover:opacity-100">×</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = (): ToastApi => useContext(ToastCtx);
