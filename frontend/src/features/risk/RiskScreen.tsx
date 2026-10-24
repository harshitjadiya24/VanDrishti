import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { CountNumber, EmptyState, PageHeader, Plate, Skeleton } from "../../design/kit";
import { Button } from "../../design/primitives";
import { TrapStrip } from "../../design/TrapStrip";
import { api, type RiskEvent } from "../../lib/api";
import { useSession } from "../../lib/session";
import { localTime, stripTime } from "../../lib/time";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import { RiskBadge, RiskReasons } from "./RiskBadge";

const LEVELS = ["high", "medium", "low"] as const;
const HEAT = { high: "var(--danger)", medium: "var(--color-heat-4)", low: "var(--mark)" } as const;

/** People/vehicle events, most urgent first, each with its reasons. */
export function RiskScreen() {
  const { reserve, can } = useSession();
  const qc = useQueryClient();
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [showDismissed, setShowDismissed] = useState(false);
  const summary = useQuery({ queryKey: ["risk-summary", reserve], queryFn: () => api.riskSummary(reserve || undefined) });
  const events = useQuery({
    queryKey: ["risk-events", reserve, level, showDismissed],
    queryFn: () => api.riskEvents(reserve || undefined, level, showDismissed),
  });
  const run = useMutation({
    mutationFn: () => api.runRisk(reserve || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["risk-summary"] }); qc.invalidateQueries({ queryKey: ["risk-events"] }); },
  });
  const s = summary.data;
  return (
    <div className="grid gap-7">
      <PageHeader title="People, vehicles and poaching risk"
        actions={can("run") && (
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw size={15} aria-hidden className={run.isPending ? "animate-spin" : undefined} />{run.isPending ? "Scoring…" : "Re-score events"}
          </Button>
        )}>
        Each burst with people or vehicles is one event. Its level comes from points with reasons: a triage order for
        rangers, not a prediction. {s?.note}
      </PageHeader>

      {!s && !summary.error && <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
      {s && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Events by level">
          {LEVELS.map((l) => {
            const on = level === l;
            return (
              <button key={l} type="button" aria-pressed={on} onClick={() => setLevel(on ? undefined : l)}
                className={clsx("relative overflow-hidden rounded-[var(--radius-card)] border bg-surface p-5 text-left transition-[border-color,background-color] duration-[var(--duration-base)] hover:bg-surface-2",
                  on ? "border-edge-strong" : "border-edge")}>
                {/* The hotter the level, the warmer the card's corner. */}
                <span aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
                  style={{ background: `radial-gradient(90% 80% at 100% 0%, color-mix(in srgb, ${HEAT[l]} ${s.levels[l] ? 22 : 0}%, transparent), transparent 70%)` }} />
                <span className="relative grid justify-items-start gap-3">
                  <RiskBadge level={l} />
                  <CountNumber value={s.levels[l]} className="wide block text-[40px]" />
                  <span className="text-[12.5px] text-fg-2">{on ? "events, shown below (press again for all)" : "events"}</span>
                </span>
              </button>
            );
          })}
        </section>
      )}
      {s && s.cameras.length > 0 && (
        <p className="max-w-[90ch] text-[13.5px] text-fg-2">
          Most urgent cameras: {s.cameras.slice(0, 5).map((c) => `${c.camera} (${c.high} high, ${c.medium} medium)`).join("; ")}.
          {s.night_share !== null && ` ${Math.round(s.night_share * 100)}% of events were at night.`}
          {s.dismissed > 0 && ` ${s.dismissed} dismissed as false alarms.`}
        </p>
      )}
      <label className="flex min-h-11 w-fit items-center gap-2.5 text-[13.5px] text-fg-2 md:min-h-8">
        <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="size-[18px] accent-[var(--decide)]" />
        Show events dismissed as false alarms
      </label>

      {events.error && <p role="alert" className="text-danger">{String(events.error)}</p>}
      {!events.data && !events.error && <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>}
      {events.data && events.data.length === 0 && (
        <EmptyState icon={<ShieldCheck size={20} />} title="No people or vehicle events here">
          Events appear when the detector finds people or vehicles; each is scored with its reasons.
        </EmptyState>
      )}
      <ul className="grid gap-3">
        {(events.data ?? []).map((e) => (
          <Plate as="li" key={e.event_id}
            className={clsx("grid gap-5 overflow-hidden p-4 sm:grid-cols-[240px_minmax(0,1fr)]", e.level === "high" && !e.dismissed && "border-danger/50 shadow-[0_18px_40px_-26px_rgb(255_90_104/0.6)]")}>
            <figure className="overflow-hidden rounded-[10px] border border-edge bg-black">
              <img src={api.displayUrl(e.image_ids[0])} alt={`Camera ${e.camera}, people blurred`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              <TrapStrip camera={`CAM ${e.camera}`} time={stripTime(e.start_at, e.timezone)} />
            </figure>
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={e.level} dismissed={e.dismissed} />
                <span className="text-[16px] font-semibold">Camera {e.camera}</span>
                {e.camera_sensitivity !== "normal" && (
                  <span className="rounded-full border border-edge px-2.5 py-0.5 text-[12px] text-fg-2">{e.camera_sensitivity} location</span>
                )}
                <span className="text-[12.5px] text-fg-3">{localTime(e.start_at, e.timezone)}</span>
              </div>
              {s?.thresholds && <PointStack e={e} thresholds={s.thresholds} />}
              <RiskReasons factors={e.factors} />
              <Link to="/app/review/people_vehicles" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-fg underline decoration-edge-strong underline-offset-4 hover:decoration-fg md:min-h-7">
                Review in the people &amp; vehicles queue <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </Plate>
        ))}
      </ul>
    </div>
  );
}

// Each reason's points heat the bar a step further along the thermal ramp.
const SEGMENT = ["var(--color-heat-2)", "var(--color-heat-3)", "var(--color-heat-4)", "var(--color-heat-5)"];

/** The reasons stacked as points along a scale with the MEDIUM and HIGH lines. */
function PointStack({ e, thresholds }: { e: RiskEvent; thresholds: { medium: number; high: number } }) {
  const reduce = useReducedMotion();
  const parts = e.factors.filter((f) => f.points > 0);
  const scale = Math.max(e.score, thresholds.high + 2);
  const byPoints = e.score >= thresholds.high ? "high" : e.score >= thresholds.medium ? "medium" : "low";
  const pct = (n: number) => `${(n / scale) * 100}%`;
  return (
    <figure className="grid gap-1.5">
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-3" role="img"
        aria-label={`${e.score} points; medium from ${thresholds.medium}, high from ${thresholds.high}`}>
        <div className="absolute inset-0 flex gap-px">
          {parts.map((f, i) => (
            <motion.span key={i} title={`+${f.points}: ${f.reason}`} className="h-full"
              style={{ background: SEGMENT[Math.min(i, SEGMENT.length - 1)] }}
              initial={reduce ? false : { width: 0 }} animate={{ width: pct(f.points) }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: reduce ? 0 : i * 0.08 }} />
          ))}
        </div>
        {(["medium", "high"] as const).map((t) => (
          <span key={t} aria-hidden className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: pct(thresholds[t]) }} />
        ))}
      </div>
      <figcaption className="data relative h-4 text-[10.5px] text-fg-3">
        <span className="absolute left-0 text-fg">{e.score} points</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(thresholds.medium) }}>medium {thresholds.medium}</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(thresholds.high) }}>high {thresholds.high}</span>
      </figcaption>
      {!e.dismissed && byPoints !== e.level && (
        <p className="text-[12.5px] text-fg-2">Points alone say {byPoints}; a rule or a reviewer's mark set the level to {e.level}.</p>
      )}
    </figure>
  );
}
