// Stage 5: risk is points with reasons, read as a triage order. As each reason arrives the
// level heats up along the thermal scale; the word always says the level.

import clsx from "clsx";
import { useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../scroll";
import { RISK_SAMPLE } from "../results";
import { Chapter, Synthetic } from "../ui";

const REASONS = [
  { text: "2 people in the frame (estimated count)", points: 2 },
  { text: "At night, after sunset at this camera", points: 3 },
  { text: "Camera in a core zone", points: 3 },
];
const HEAT = { LOW: "var(--color-heat-1)", MEDIUM: "var(--color-heat-4)", HIGH: "var(--danger)" } as const;

export function RiskChapter() {
  const root = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(prefersReducedMotion() ? REASONS.length : 0);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    REASONS.forEach((_, i) => {
      gsap.timeline({ scrollTrigger: { trigger: root.current, start: `top+=${160 + i * 110} 70%`, onEnter: () => setShown((n) => Math.max(n, i + 1)), onLeaveBack: () => setShown(i) } });
    });
  }, { scope: root });
  const total = REASONS.slice(0, shown).reduce((s, r) => s + r.points, 0);
  const level = total >= 8 ? "HIGH" : total >= 4 ? "MEDIUM" : "LOW";
  const heat = HEAT[level];

  return (
    <Chapter id="stage-5" variant="split" stage="5" strip="poaching risk" sectionRef={root} title="Poaching risk, with reasons"
      lede="When people or vehicles appear, each reason adds points. The level is a triage order for rangers, not a prediction, and a person's “false alarm” dismisses it.">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
        <ol className="grid content-start gap-3">
          {REASONS.map((r, i) => (
            <li key={r.text}
              className={clsx("flex items-center justify-between gap-4 rounded-[12px] border px-5 py-4 transition-[transform,border-color,background-color] duration-[var(--duration-slow)] ease-[var(--ease-out)]",
                i < shown ? "translate-x-0 border-edge-strong bg-surface" : "-translate-x-2 border-dashed border-edge bg-transparent")}>
              <span className={clsx("text-[15.5px]", i < shown ? "text-fg" : "text-fg-3")}>{r.text}</span>
              <span className={clsx("wide text-[24px]", i < shown ? "text-fg" : "text-fg-3")}>+{r.points}</span>
            </li>
          ))}
        </ol>
        <div className="relative self-start overflow-hidden rounded-[var(--radius-card)] border border-edge bg-surface p-6">
          {/* The card heats up as points arrive. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 transition-[background] duration-[900ms] ease-[var(--ease-out)]"
            style={{ background: `radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, ${heat} 32%, transparent), transparent 65%)` }} />
          <div className="relative">
            <p className="wide wide-max text-[clamp(3rem,7vw,4.8rem)] transition-colors duration-[var(--duration-slow)]" style={{ color: level === "LOW" ? "var(--fg)" : heat }}>{level}</p>
            <p className="data mt-1 text-[14px] text-fg">{total} points</p>
            <div className="mt-6 grid grid-cols-3 gap-1.5 text-[11.5px]">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((z, i) => (
                <span key={z} aria-current={z === level ? "true" : undefined} className={clsx(z === level ? "font-semibold text-fg" : "text-fg-3")}>
                  <span aria-hidden className="mb-1.5 block h-1 rounded-full" style={{ background: z === level ? HEAT[z] : "var(--surface-3)" }} />
                  {z} {["0–3", "4–7", "8+"][i]}
                </span>
              ))}
            </div>
            <p className="data mt-5 inline-flex items-center gap-2 rounded-[6px] bg-black px-2.5 py-1 text-[10.5px] tracking-[0.05em] text-ir uppercase">
              cam s-07 · 23:10 ist · {total} points
            </p>
            <Synthetic className="mt-3 block" />
            <p className="mt-2 text-[12.5px] text-fg-3">
              These rules have no ground truth yet, so there is no accuracy number. On the sample data they raised{" "}
              {RISK_SAMPLE.medium} MEDIUM events and {RISK_SAMPLE.high === 0 ? "no" : RISK_SAMPLE.high} HIGH.
            </p>
          </div>
        </div>
      </div>
    </Chapter>
  );
}
