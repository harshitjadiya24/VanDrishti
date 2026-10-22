import clsx from "clsx";
import type { RiskFactor } from "../api";

const TONE = {
  high: "bg-alarm text-on-alarm",
  medium: "bg-check text-on-check",
  low: "bg-raised text-ink",
} as const;
const WORD = { high: "High risk", medium: "Medium risk", low: "Low risk" } as const;

/** A risk level as a word and a colour (never colour alone). */
export function RiskBadge({ level, dismissed }: { level: keyof typeof TONE; dismissed?: boolean }) {
  if (dismissed) return <span className="rounded-[6px] border border-line px-2 py-0.5 text-[13px] text-dim">Dismissed</span>;
  return (
    <span className={clsx("inline-flex rounded-[6px] px-2 py-0.5 text-[13px] font-semibold", TONE[level])}>
      {WORD[level]}
    </span>
  );
}

export function RiskReasons({ factors }: { factors: RiskFactor[] }) {
  return (
    <ul className="grid gap-1 text-[13px]">
      {factors.map((f, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{f.points ? `+${f.points}` : "·"}</span>
          <span>{f.reason}</span>
        </li>
      ))}
    </ul>
  );
}
