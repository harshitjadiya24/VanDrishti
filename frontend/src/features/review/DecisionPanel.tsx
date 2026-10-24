import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { ConfidenceDial } from "../../design/kit";
import { heatFor } from "../../design/primitives";
import type { QueueItem } from "../../lib/api";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import { RiskBadge, RiskReasons } from "../risk/RiskBadge";

export function band(c: number | null): { word: string; tone: string } {
  if (c === null) return { word: "no score", tone: "text-fg-2" };
  if (c >= 0.9) return { word: "high", tone: "text-settled" };
  if (c >= 0.6) return { word: "medium", tone: "text-decide-fg" };
  return { word: "low", tone: "text-decide-fg" };
}

/** The answer and its explanation: what the models proposed and why it needs a person. */
export function DecisionPanel({ item }: { item: QueueItem }) {
  const ex = item.explanation;
  const b = band(item.confidence);
  const reduce = useReducedMotion();
  return (
    <section aria-label="Model decision" className="grid gap-5">
      <div>
        <h2 className="wide text-[clamp(1.7rem,2.4vw,2.2rem)]">{item.label ?? routeTitle(item.route)}</h2>
        {/* The answer is the model's proposal; a spot check means a person checks an auto-accepted one. */}
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-3">
          The model's proposal
          {item.spot_check && <span className="rounded-full bg-decide px-2 py-0.5 text-[11.5px] font-semibold text-on-decide">Spot check</span>}
        </p>
        {item.confidence !== null && (
          <div className="mt-3 flex items-end gap-4">
            <ConfidenceDial key={item.image_id} value={item.confidence} size={96} />
            <div className="pb-0.5">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: heatFor(item.confidence), boxShadow: `0 0 10px ${heatFor(item.confidence)}` }} />
                <span className="wide text-[30px]">{item.confidence.toFixed(2)}</span>
              </span>
              <span className="text-[12.5px] text-fg-2">Confidence: <span className={b.tone}>{b.word}</span></span>
            </div>
          </div>
        )}
        <p className="mt-3 text-[13px] text-fg-2">Why it is here: <span className="text-fg">{item.reason}</span></p>
      </div>

      {item.risk && (
        <div className="grid gap-2 rounded-[10px] border border-edge bg-surface-2 p-3">
          <div className="flex items-center gap-2 text-[13px]">
            <RiskBadge level={item.risk.level} dismissed={item.risk.dismissed} />
            <span className="data text-[11px] text-fg-3">score {item.risk.score}</span>
          </div>
          <RiskReasons factors={item.risk.factors} />
        </div>
      )}

      {ex?.summary && <p className="rounded-[10px] border border-edge bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-fg-2">{ex.summary}</p>}

      {ex?.factors && ex.factors.length > 0 && (
        <div>
          <h3 className="mb-2 text-[12px] font-medium text-fg-3">How the confidence was built</h3>
          <ul className="grid gap-2">
            {ex.factors.map((f, i) => (
              <motion.li key={`${item.image_id}-${f.name}`} className="flex items-start gap-2 text-[13px]"
                initial={reduce ? false : { opacity: 0.001, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT, delay: 0.05 * i }}>
                {f.factor === null ? <Info size={15} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
                  : f.factor < 1 ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-decide-fg" aria-hidden />
                    : <CircleCheck size={15} className="mt-0.5 shrink-0 text-settled" aria-hidden />}
                <span>
                  <span className="text-fg-2">{f.name}{f.factor !== null && f.factor < 1 ? ` (×${f.factor})` : ""}: </span>
                  {f.reason}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      {ex?.species_top && ex.species_top.length > 0 && (
        <Table title="SpeciesNet top guesses" rows={ex.species_top.map((s) => [s.label, s.score])} />
      )}
      {ex?.openclip_top && ex.openclip_top.length > 0 && (
        <Table title="OpenCLIP (information only)"
          rows={ex.openclip_top.map((s) => [s.label === "__nothing__" ? "empty scene" : s.label, s.probability])} />
      )}
    </section>
  );
}

function Table({ title, rows }: { title: string; rows: [string, number][] }) {
  const top = Math.max(...rows.slice(0, 5).map(([, v]) => v), 0.0001);
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-medium text-fg-3">{title}</h3>
      <ul className="grid gap-1.5 text-[12.5px]">
        {rows.slice(0, 5).map(([label, v]) => (
          <li key={label} className="grid grid-cols-[minmax(0,1fr)_72px_40px] items-center gap-2">
            <span className="truncate">{label}</span>
            <span aria-hidden className="h-1 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-fg-2" style={{ width: `${Math.max(2, (v / top) * 100)}%` }} />
            </span>
            <span className="data text-right text-[10.5px] text-fg-2">{v.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function routeTitle(route: string): string {
  return ({
    people_vehicles: "People or vehicles",
    likely_blank: "Likely blank",
    quality: "Quality problem",
    uncertain: "Not identified",
  } as Record<string, string>)[route] ?? route;
}
