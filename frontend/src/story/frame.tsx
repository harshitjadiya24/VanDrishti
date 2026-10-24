// One synthetic night frame, shared by the story's hero, the pipeline plate and the sign-in
// page: a ground line, crisp grass and a striped body for the detector's box to find. It is
// stripe geometry inside a plain capsule, not a drawing of a tiger, and always labelled synthetic.
// No GSAP or Motion here, so the console can import it too.

import type { ReactNode } from "react";
import { stripeField } from "./stripes";

/** The frame's viewBox. */
export const FRAME = { w: 420, h: 190 } as const;
/** The striped body the detector finds (SAM outlines exactly this). */
export const BODY = { x: 150, y: 80, width: 160, height: 60, rx: 30 } as const;
/** The detector's box around it, with the margin a real detection has. */
export const BOX = { x: 134, y: 62, width: 192, height: 94 } as const;

const STRIPES = stripeField(23, 340, 170);

/** Grass as thin pointed blades, placed from a seed so every render is identical. */
function blades(seed: number, count: number, base: number, tall: number, colour: string) {
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: count }, (_, i) => {
    const x = (i + next() * 0.8) * (FRAME.w / count);
    const h = tall * (0.45 + next() * 0.55);
    const lean = (next() - 0.5) * 10;
    return <path key={i} d={`M${x - 2.2} ${base} L${x + lean} ${base - h} L${x + 2.2} ${base} Z`} fill={colour} />;
  });
}

/**
 * The frame as an SVG `<g>` set: callers wrap it in their own `<svg viewBox="0 0 420 190">` and
 * draw the box, outline and labels on top. `subjectClassName` lets the pipeline grey the body
 * out before the quality gate.
 */
export function NightFrame({ id, subjectClassName = "", children }: { id: string; subjectClassName?: string; children?: ReactNode }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3050" />
          <stop offset="1" stopColor="#1c2033" />
        </linearGradient>
        <linearGradient id={`${id}-flank`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d08a24" />
          <stop offset="0.7" stopColor="#c47a1c" />
          <stop offset="1" stopColor="#ead9b6" />
        </linearGradient>
        <clipPath id={`${id}-body`}><rect {...BODY} /></clipPath>
      </defs>
      <rect width={FRAME.w} height={FRAME.h} fill={`url(#${id}-sky)`} />
      {/* Far grass, then the ground the body stands on. */}
      <g>{blades(7, 46, 146, 30, "#3d4466")}</g>
      <path d="M0 146 C 120 140, 300 150, 420 143 L420 190 L0 190 Z" fill="#151a2c" />
      <g clipPath={`url(#${id}-body)`} className={subjectClassName}>
        <rect {...BODY} fill={`url(#${id}-flank)`} />
        <g transform={`translate(${BODY.x - 8} ${BODY.y - 6}) scale(0.52 0.44)`}>
          {STRIPES.map((s, i) => <path key={i} d={s.d} fill="#151515" />)}
        </g>
      </g>
      {/* Near grass crosses the body's lower edge, as it would in a real frame. */}
      <g>{blades(19, 34, 158, 26, "#0f1322")}</g>
      {children}
    </>
  );
}

/** The detector's label above its box. */
export function BoxLabel({ text, className = "" }: { text: string; className?: string }) {
  const w = 7 * text.length + 12;
  return (
    <g className={className}>
      <rect x={BOX.x - 1.5} y={BOX.y - 17} width={w} height={17} rx={2} fill="#ffb45e" />
      <text x={BOX.x + 5} y={BOX.y - 4.5} fontSize={12} fontWeight={600} fill="#121629" fontFamily="Mukta, sans-serif">{text}</text>
    </g>
  );
}
