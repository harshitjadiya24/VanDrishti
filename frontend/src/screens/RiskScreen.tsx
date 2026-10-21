import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { localTime } from "../components/FrameView";
import { RiskBadge, RiskReasons } from "../components/RiskBadge";
import { useSession } from "../context";

const LEVELS = ["high", "medium", "low"] as const;

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
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[24px] font-semibold">People, vehicles and poaching risk</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-dim">
            Each burst with people or vehicles is one event. Its level comes from points with reasons. {s?.note}
          </p>
        </div>
        {can("run") && <button type="button" onClick={() => run.mutate()} disabled={run.isPending}
          className="h-9 rounded-md border border-line px-3 text-[14px] hover:bg-raised disabled:opacity-50">
          {run.isPending ? "Scoring…" : "Re-score events"}
        </button>}
      </header>

      {s && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Events by level">
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(level === l ? undefined : l)}
              className={clsx("rounded-md bg-panel p-4 text-left hover:bg-raised", level === l && "ring-2 ring-amber")}>
              <RiskBadge level={l} />
              <div className="mt-2 text-[28px] font-semibold tabular-nums">{s.levels[l]}</div>
              <div className="text-[13px] text-dim">events</div>
            </button>
          ))}
        </section>
      )}
      {s && s.cameras.length > 0 && (
        <p className="text-[13px] text-dim">
          Most urgent cameras: {s.cameras.slice(0, 5).map((c) => `${c.camera} (${c.high} high, ${c.medium} medium)`).join("; ")}.
          {s.night_share !== null && ` ${Math.round(s.night_share * 100)}% of events were at night.`}
          {s.dismissed > 0 && ` ${s.dismissed} dismissed as false alarms.`}
        </p>
      )}
      <label className="flex items-center gap-2 text-[13px] text-dim">
        <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
        Show events dismissed as false alarms
      </label>

      {events.error && <p role="alert" className="text-alarm">{String(events.error)}</p>}
      {events.data && events.data.length === 0 && <p className="text-dim">No people or vehicle events here.</p>}
      <ul className="grid gap-3">
        {(events.data ?? []).map((e) => (
          <li key={e.event_id} className="grid gap-4 rounded-md bg-panel p-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <img src={api.displayUrl(e.image_ids[0])} alt={`Camera ${e.camera}, blurred`} loading="lazy"
              className="aspect-[4/3] w-full bg-black object-cover" />
            <div className="grid content-start gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={e.level} dismissed={e.dismissed} />
                <span className="text-[14px] font-medium">Camera {e.camera}</span>
                {e.camera_sensitivity !== "normal" && <span className="text-[12px] text-amber">{e.camera_sensitivity} location</span>}
                <span className="text-[13px] text-dim">{localTime(e.start_at, e.timezone)}</span>
                <span className="text-[13px] text-dim">score {e.score}</span>
              </div>
              <RiskReasons factors={e.factors} />
              <Link to="/review/people_vehicles" className="text-[13px] text-amber underline-offset-4 hover:underline">
                Review in the people &amp; vehicles queue
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
