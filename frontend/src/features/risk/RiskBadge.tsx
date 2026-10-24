import type { RiskFactor } from "../../lib/api";

const HEAT = { high: "var(--danger)", medium: "var(--color-heat-4)", low: "var(--mark)" } as const;
const WORD = { high: "High risk", medium: "Medium risk", low: "Low risk" } as const;

/** A risk level as a word with its heat dot (never colour alone). */
export function RiskBadge({ level, dismissed }: { level: keyof typeof HEAT; dismissed?: boolean }) {
  if (dismissed) {
    return <span className="inline-flex h-6 items-center rounded-full border border-edge px-2.5 text-[12px] text-fg-2">Dismissed</span>;
  }
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-edge bg-surface-2 pr-2.5 pl-2 text-[12px] font-medium text-fg">
      <span aria-hidden className="size-2 rounded-full" style={{ background: HEAT[level], boxShadow: level === "low" ? undefined : `0 0 8px ${HEAT[level]}` }} />
      {WORD[level]}
    </span>
  );
}

export function RiskReasons({ factors }: { factors: RiskFactor[] }) {
  return (
    <ul className="grid gap-1.5 text-[13px]">
      {factors.map((f, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="data w-8 shrink-0 text-right text-[11.5px] text-fg">{f.points ? `+${f.points}` : "·"}</span>
          <span className="text-fg-2">{f.reason}</span>
        </li>
      ))}
    </ul>
  );
}
