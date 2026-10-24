// A synthetic infrared camera-trap frame (420 × 190): greyscale like a real IR capture, with a
// striped body for the detector to find. Stripe geometry in a capsule, never a drawing of a
// tiger, and always labelled synthetic. The detector's marks sit above the IR layer in colour.

import type { ReactNode } from "react";
import { stripeField } from "../story/stripes";

export const FRAME = { w: 420, h: 190 } as const;
export const BODY = { x: 150, y: 80, width: 160, height: 60, rx: 30 } as const;
export const BOX = { x: 134, y: 62, width: 192, height: 94 } as const;

const STRIPES = stripeField(23, 340, 170);

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

/** The IR layer only. Callers wrap it in `<svg viewBox="0 0 420 190">` and add marks on top. */
export function IRScene({ id, eyeshine = true }: { id: string; eyeshine?: boolean }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-flash`} cx="0.5" cy="0.55" r="0.75">
          <stop offset="0" stopColor="#8d9299" />
          <stop offset="0.55" stopColor="#3b3f45" />
          <stop offset="1" stopColor="#101215" />
        </radialGradient>
        <linearGradient id={`${id}-flank`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9ccd1" />
          <stop offset="0.7" stopColor="#b3b7bd" />
          <stop offset="1" stopColor="#e9ebee" />
        </linearGradient>
        <clipPath id={`${id}-body`}><rect {...BODY} /></clipPath>
      </defs>
      <rect width={FRAME.w} height={FRAME.h} fill={`url(#${id}-flash)`} />
      {/* Trunks at the flash's edge, then far grass. */}
      <g fill="#1b1e22">
        <rect x="22" y="0" width="16" height="150" />
        <rect x="64" y="0" width="9" height="148" opacity="0.7" />
        <rect x="372" y="0" width="20" height="152" />
        <rect x="346" y="0" width="7" height="146" opacity="0.6" />
      </g>
      <g>{blades(7, 46, 146, 30, "#6e737b")}</g>
      <path d="M0 146 C 120 140, 300 150, 420 143 L420 190 L0 190 Z" fill="#2a2d32" />
      <g clipPath={`url(#${id}-body)`}>
        <rect {...BODY} fill={`url(#${id}-flank)`} />
        <g transform={`translate(${BODY.x - 8} ${BODY.y - 6}) scale(0.52 0.44)`}>
          {STRIPES.map((s, i) => <path key={i} d={s.d} fill="#141518" />)}
        </g>
      </g>
      {eyeshine && (
        <g>
          <circle cx={BODY.x + 12} cy={BODY.y + 18} r="2.6" fill="#f4fff2" />
          <circle cx={BODY.x + 22} cy={BODY.y + 17} r="2.6" fill="#f4fff2" />
        </g>
      )}
      <g>{blades(19, 34, 158, 26, "#45494f")}</g>
    </g>
  );
}

/** The detector's box and label, in the warm colour of a proposal waiting to be judged. */
export function DetectorBox({ label, colour = "var(--color-heat-5)" }: { label?: string; colour?: string }) {
  const w = label ? 7.2 * label.length + 12 : 0;
  return (
    <g>
      <rect {...BOX} fill="none" stroke={colour} strokeWidth="2.5" />
      {label && (
        <g>
          <rect x={BOX.x - 1.25} y={BOX.y - 16} width={w} height={16} fill={colour} />
          <text x={BOX.x + 5} y={BOX.y - 4.5} fontSize={10.5} fontWeight={600} fill="#160a02" fontFamily="Martian Mono Variable, monospace"
            textLength={w - 10} lengthAdjust="spacingAndGlyphs">{label}</text>
        </g>
      )}
    </g>
  );
}

/** A complete frame: IR layer, marks and its data strip. */
export function IRFrame({ id, label = "animal 0.94", strip, className, children }:
  { id: string; label?: string; strip?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} className="block w-full" role="img"
        aria-label="Synthetic infrared frame: the detector's box around a striped body in the grass">
        <IRScene id={id} />
        <DetectorBox label={label} />
        {children}
      </svg>
      {strip}
    </figure>
  );
}
