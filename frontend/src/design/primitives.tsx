// Shared primitives for the story and the console. No GSAP, Motion or console imports here:
// both chunks may use this file.

import * as RadixTooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Tone = "decide" | "solid" | "quiet" | "ghost" | "danger";

const TONES: Record<Tone, string> = {
  // A person decides here: the hot end of the ramp.
  decide: "bg-decide text-on-decide hover:brightness-110 shadow-[0_8px_24px_-10px_rgb(255_138_61/0.65)]",
  solid: "bg-fg text-canvas hover:opacity-90",
  quiet: "bg-surface-2 text-fg border border-edge hover:bg-surface-3",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-on-danger hover:brightness-110",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}

/** Every clickable action. Phone targets are 44 px; desks get the compact size from `md`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = "quiet", size = "md", className, type = "button", ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-ctl)] font-medium",
        "transition-[background-color,color,filter,opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "h-11 px-3 text-[13px] md:h-8",
        size === "md" && "h-11 px-4 text-[14px] md:h-9",
        size === "lg" && "h-12 px-6 text-[16px]",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
});

/** A keyboard key, as printed beside the action it triggers. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={clsx("data inline-grid h-5 min-w-5 place-items-center rounded-[5px] border border-edge-strong bg-surface-2 px-1 text-[10.5px] leading-none text-fg-2", className)}>
      {children}
    </kbd>
  );
}

/** Where a frame stands, on the thermal scale: cold is settled, hot needs a person. */
export type Stage = "auto" | "blank" | "quality" | "review" | "uncertain" | "people" | "done";

export const STAGE: Record<Stage, { word: string; heat: string; hot: boolean }> = {
  auto: { word: "Auto-accepted", heat: "var(--settled)", hot: false },
  done: { word: "Decided by a person", heat: "var(--settled)", hot: false },
  blank: { word: "Likely blank", heat: "var(--mark)", hot: false },
  quality: { word: "Quality problem", heat: "var(--color-heat-3)", hot: true },
  review: { word: "Needs a person", heat: "var(--color-heat-4)", hot: true },
  uncertain: { word: "Uncertain", heat: "var(--color-heat-5)", hot: true },
  people: { word: "People or vehicles", heat: "var(--danger)", hot: true },
};

/** The stage as a word with its heat dot. Colour is never the only cue. */
export function StageBadge({ stage, children, className }: { stage: Stage; children?: ReactNode; className?: string }) {
  const s = STAGE[stage];
  return (
    <span className={clsx("inline-flex h-6 items-center gap-1.5 rounded-full border border-edge bg-surface-2 pr-2.5 pl-2 text-[12px] font-medium text-fg", className)}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: s.heat, boxShadow: s.hot ? `0 0 8px 0 ${s.heat}` : undefined }} />
      {children ?? s.word}
    </span>
  );
}

/** Confidence read on the thermal scale: below 0.6 hot, 0.6–0.9 warm, 0.9 and above cold. */
export function heatFor(confidence: number): string {
  if (confidence >= 0.9) return "var(--settled)";
  if (confidence >= 0.6) return "var(--color-heat-4)";
  return "var(--color-heat-5)";
}

/** A short hint on hover or focus. */
export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content sideOffset={6}
            className="z-50 rounded-[6px] border border-edge bg-surface-3 px-2 py-1 text-[12px] text-fg shadow-[var(--lift)]">
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
