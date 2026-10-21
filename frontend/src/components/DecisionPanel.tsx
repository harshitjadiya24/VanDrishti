import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { QueueItem } from "../api";
import { DURATION, EASE_BOARD } from "../motion/tokens";
import { ConfidenceDial } from "./kit";
import { RiskBadge, RiskReasons } from "./RiskBadge";

export function band(c: number | null): { word: string; tone: string } {
  if (c === null) return { word: "no score", tone: "text-dim" };
  if (c >= 0.9) return { word: "high", tone: "text-ok" };
  if (c >= 0.6) return { word: "medium", tone: "text-amber" };
  return { word: "low", tone: "text-alarm" };
}

/** 5.6 answer and 5.7 explanation: what the models said and why it needs a person. */
export function DecisionPanel({ item }: { item: QueueItem }) {
  const ex = item.explanation;
  const b = band(item.confidence);
  const reduce = useReducedMotion();
  return (
    <section aria-label="Model decision" className="grid gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-dim">
          <span>Model says</span>
          {item.spot_check && <span className="rounded-full border border-sky px-2 text-sky">spot check</span>}
        </div>
        <div className="mt-0.5 text-[26px] font-semibold leading-tight">{item.label ?? routeTitle(item.route)}</div>
        {item.confidence !== null && (
          <div className="mt-2 flex items-end gap-3">
            <ConfidenceDial key={item.image_id} value={item.confidence} size={104} />
            <div className="pb-1">
              <span className="tabular block text-[28px] leading-none font-semibold">{item.confidence.toFixed(2)}</span>
              <span className="text-[13px] text-dim">Confidence: <span className={b.tone}>{b.word}</span></span>
            </div>
          </div>
        )}
        <p className="mt-2 text-[13px] text-dim">Why it is here: <span className="text-ink">{item.reason}</span></p>
      </div>

      {item.risk && (
        <div className="grid gap-2 rounded-md border border-line p-3">
          <div className="flex items-center gap-2 text-[13px]">
            <RiskBadge level={item.risk.level} dismissed={item.risk.dismissed} />
            <span className="text-dim">score {item.risk.score}</span>
          </div>
          <RiskReasons factors={item.risk.factors} />
        </div>
      )}

      {ex?.summary && <p className="rounded-md bg-base px-3 py-2 text-[13px] leading-relaxed">{ex.summary}</p>}

      {ex?.factors && ex.factors.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[12px] font-normal text-dim">How the confidence was built</h3>
          <ul className="grid gap-1.5">
            {ex.factors.map((f, i) => (
              <motion.li key={`${item.image_id}-${f.name}`} className="flex items-start gap-2 text-[13px]"
                initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_BOARD, delay: 0.05 * i }}>
                {f.factor === null ? <Info size={15} className="mt-0.5 shrink-0 text-dim" aria-hidden />
                  : f.factor < 1 ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-amber" aria-hidden />
                    : <CircleCheck size={15} className="mt-0.5 shrink-0 text-ok" aria-hidden />}
                <span>
                  <span className="text-dim">{f.name}{f.factor !== null && f.factor < 1 ? ` (×${f.factor})` : ""}: </span>
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
  return (
    <div>
      <h3 className="mb-1 text-[12px] font-normal text-dim">{title}</h3>
      <ul className="grid gap-0.5 text-[13px]">
        {rows.slice(0, 5).map(([label, v]) => (
          <li key={label} className="flex justify-between gap-3 border-b border-line/60 py-0.5">
            <span className="truncate">{label}</span>
            <span className="tabular-nums text-dim">{v.toFixed(2)}</span>
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
