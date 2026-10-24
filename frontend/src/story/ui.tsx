// The story's parts in the night-vision world. Every chapter is a stage the frame passes; the
// fixed data strip (StoryStrip) reads the chapter's stage and name from its data attributes.

import clsx from "clsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { stripeField } from "./stripes";

export interface ChapterProps {
  id: string;
  /** Stage on the camera's strip, e.g. "3" or "4.1"; omitted for the engineering appendix. */
  stage?: string;
  /** Lower-case name for the strip, e.g. "the check-post". */
  strip: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
  sectionRef?: React.Ref<HTMLElement>;
}

/** One chapter: a title in expanded lettering, one paragraph, then the demonstration. */
export function Chapter({ id, stage, strip, title, lede, children, className, sectionRef }: ChapterProps) {
  return (
    <section id={id} ref={sectionRef} data-chapter={stage ?? ""} data-chapter-name={strip} aria-labelledby={`${id}-title`}
      className={clsx("scroll-mt-6 px-5 py-24 md:px-10 md:py-32", className)}>
      <div className="mx-auto max-w-[1280px]">
        <h2 id={`${id}-title`} className="wide max-w-[18ch] text-[clamp(2.4rem,5.6vw,4.6rem)]">{title}</h2>
        {lede && <p className="mt-5 max-w-[60ch] text-[clamp(1.02rem,1.4vw,1.2rem)] leading-relaxed text-fg-2">{lede}</p>}
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}

/** A surface for one thing a visitor reads closely. */
export function Card({ children, className, tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "hot" | "danger" }) {
  return (
    <div className={clsx("relative rounded-[var(--radius-card)] border p-5",
      tone === "plain" && "border-edge bg-surface",
      tone === "hot" && "border-heat-4/60 bg-surface shadow-[0_18px_40px_-22px_rgb(247_147_30/0.55)]",
      tone === "danger" && "border-danger/60 bg-surface shadow-[0_18px_40px_-22px_rgb(255_90_104/0.5)]",
      className)}>
      {children}
    </div>
  );
}

/** Marks illustrative content so nobody mistakes it for real data. */
export function Synthetic({ className = "" }: { className?: string }) {
  return <span className={clsx("data text-[10.5px] tracking-[0.08em] text-fg-3 uppercase", className)}>synthetic example</span>;
}

/** A small synthetic IR crop of a striped flank (stripe geometry, not a drawing of a tiger). */
export function StripeFrame({ seed, label, tilt = 0, className }: { seed: number; label: string; tilt?: number; className?: string }) {
  const stripes = useMemo(() => stripeField(seed, 300, 150), [seed]);
  return (
    <svg viewBox="0 0 300 150" className={clsx("block w-full", className)} role="img" aria-label={label}>
      <defs>
        <radialGradient id={`sf${seed}`} cx="0.5" cy="0.45" r="0.8">
          <stop offset="0" stopColor="#d3d6db" /><stop offset="0.7" stopColor="#a7abb2" /><stop offset="1" stopColor="#6c7078" />
        </radialGradient>
      </defs>
      <rect width="300" height="150" fill={`url(#sf${seed})`} />
      <g transform={`rotate(${tilt} 150 75) translate(10 0)`}>{stripes.map((s, i) => <path key={i} d={s.d} fill="#121316" />)}</g>
    </svg>
  );
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A real SHA-256 of a text, so a fingerprint on the page is genuine. */
export function useSha256(text: string): string {
  const [hex, setHex] = useState("");
  useEffect(() => {
    let live = true;
    void sha256(text).then((h) => { if (live) setHex(h); });
    return () => { live = false; };
  }, [text]);
  return hex;
}
