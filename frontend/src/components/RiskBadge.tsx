import clsx from "clsx";
import type { RiskFactor } from "../api";

const TONE = {
  high: "border-alarm bg-alarm/15 text-alarm",
  medium: "border-amber bg-amber/15 text-amber",
  low: "border-line text-dim",
} as const;

/** A risk level as a word and a colour (never colour alone). */
export function RiskBadge({ level, dismissed }: { level: keyof typeof TONE; dismissed?: boolean }) {
  if (dismissed) return <span className="rounded-full border border-line px-2 text-[12px] text-dim">dismissed</span>;
  return (
    <span className={clsx("rounded-full border px-2 text-[12px] font-medium uppercase tracking-wide", TONE[level])}>
      {level} risk
    </span>
  );
}

export function RiskReasons({ factors }: { factors: RiskFactor[] }) {
  return (
    <ul className="grid gap-1 text-[13px]">
      {factors.map((f, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-8 shrink-0 text-right tabular-nums text-dim">{f.points ? `+${f.points}` : "·"}</span>
          <span>{f.reason}</span>
        </li>
      ))}
    </ul>
  );
}
