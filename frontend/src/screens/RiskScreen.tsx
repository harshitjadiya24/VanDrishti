import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { api, type RiskEvent } from "../api";
import { BUTTON, CountNumber, EmptyState, PageHeader, Plate, Skeleton } from "../components/kit";
import { localTime } from "../components/FrameView";
import { RiskBadge, RiskReasons } from "../components/RiskBadge";
import { useSession } from "../context";
import { DURATION, EASE_BOARD } from "../motion/tokens";

const LEVELS = ["high", "medium", "low"] as const;
const LEVEL_RING = { high: "ring-alarm", medium: "ring-[var(--color-check)]", low: "ring-dim" } as const;

/** Section 6: people/vehicle events, most urgent first, each with its reasons. */
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
    <div className="grid gap-6">
      <PageHeader title="People, vehicles and poaching risk"
        actions={can("run") && (
          <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className={BUTTON}>
            {run.isPending ? "Scoring…" : "Re-score events"}
          </button>
        )}>
        Each burst with people or vehicles is one event. Its level comes from points with reasons. {s?.note}
      </PageHeader>

      {!s && !summary.error && <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {s && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Events by level">
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(level === l ? undefined : l)}
              className={clsx("rounded-[12px] bg-panel p-4 text-left shadow-[var(--shadow-plate)] transition hover:bg-raised",
                level === l && clsx("ring-2", LEVEL_RING[l]))}>
              <RiskBadge level={l} />
              <CountNumber value={s.levels[l]} className="mt-2 block text-[34px] leading-none font-semibold" />
              <span className="mt-1 block text-[14px] text-dim">{level === l ? "events, shown below (press again for all)" : "events"}</span>
            </button>
          ))}
        </section>
      )}
      {s && s.cameras.length > 0 && (
        <p className="text-[14px] text-dim">
          Most urgent cameras: {s.cameras.slice(0, 5).map((c) => `${c.camera} (${c.high} high, ${c.medium} medium)`).join("; ")}.
          {s.night_share !== null && ` ${Math.round(s.night_share * 100)}% of events were at night.`}
          {s.dismissed > 0 && ` ${s.dismissed} dismissed as false alarms.`}
        </p>
      )}
      <label className="flex items-center gap-2 text-[14px] text-dim">
        <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="size-4" />
        Show events dismissed as false alarms
      </label>

      {events.error && <p role="alert" className="text-alarm">{String(events.error)}</p>}
      {!events.data && !events.error && <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>}
      {events.data && events.data.length === 0 && (
        <EmptyState icon={<ShieldCheck size={20} />} title="No people or vehicle events here">
          Events appear when the detector finds people or vehicles; each is scored with its reasons.
        </EmptyState>
      )}
      <ul className="grid gap-3">
        {(events.data ?? []).map((e) => (
          <Plate as="li" key={e.event_id} className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <img src={api.displayUrl(e.image_ids[0])} alt={`Camera ${e.camera}, people blurred`} loading="lazy"
              className="aspect-[4/3] w-full rounded-[8px] bg-black object-cover" />
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={e.level} dismissed={e.dismissed} />
                <span className="text-[16px] font-semibold">Camera {e.camera}</span>
                {e.camera_sensitivity !== "normal" && (
                  <span className="rounded-[6px] border border-line px-2 py-0.5 text-[13px]">{e.camera_sensitivity} location</span>
                )}
                <span className="text-[14px] text-dim">{localTime(e.start_at, e.timezone)}</span>
              </div>
              {s?.thresholds && <PointStack e={e} thresholds={s.thresholds} />}
              <RiskReasons factors={e.factors} />
              <Link to="/app/review/people_vehicles" className="text-[14px] font-medium underline underline-offset-4">
                Review in the people &amp; vehicles queue
              </Link>
            </div>
          </Plate>
        ))}
      </ul>
    </div>
  );
}

const SEGMENT = ["bg-ink/80", "bg-ink/60", "bg-ink/45", "bg-ink/30"];

/** The reasons stacked as points along a scale with the MEDIUM and HIGH lines. */
function PointStack({ e, thresholds }: { e: RiskEvent; thresholds: { medium: number; high: number } }) {
  const reduce = useReducedMotion();
  const parts = e.factors.filter((f) => f.points > 0);
  const scale = Math.max(e.score, thresholds.high + 2);
  const byPoints = e.score >= thresholds.high ? "high" : e.score >= thresholds.medium ? "medium" : "low";
  const pct = (n: number) => `${(n / scale) * 100}%`;
  return (
    <figure className="grid gap-1">
      <div className="relative h-5 overflow-hidden rounded-[4px] bg-raised" role="img"
        aria-label={`${e.score} points; medium from ${thresholds.medium}, high from ${thresholds.high}`}>
        <div className="absolute inset-0 flex">
          {parts.map((f, i) => (
            <motion.span key={i} title={`+${f.points}: ${f.reason}`}
              className={clsx("h-full border-r-2 border-panel", SEGMENT[i % SEGMENT.length])}
              initial={reduce ? false : { width: 0 }} animate={{ width: pct(f.points) }}
              transition={{ duration: DURATION.board, ease: EASE_BOARD, delay: reduce ? 0 : i * 0.08 }} />
          ))}
        </div>
        {(["medium", "high"] as const).map((t) => (
          <span key={t} aria-hidden className={clsx("absolute inset-y-0 w-0.5", t === "high" ? "bg-alarm" : "bg-[var(--color-check)]")}
            style={{ left: pct(thresholds[t]) }} />
        ))}
      </div>
      <figcaption className="relative h-4 text-[12px] text-dim">
        <span className="tabular absolute left-0">{e.score} points</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(thresholds.medium) }}>medium {thresholds.medium}</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(thresholds.high) }}>high {thresholds.high}</span>
      </figcaption>
      {!e.dismissed && byPoints !== e.level && (
        <p className="text-[13px] text-dim">Points alone say {byPoints}; a rule or a reviewer's mark set the level to {e.level}.</p>
      )}
    </figure>
  );
}
