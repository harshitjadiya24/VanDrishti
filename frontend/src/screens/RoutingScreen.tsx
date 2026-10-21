import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Link } from "react-router";
import { api, type RouteCount } from "../api";
import { useSession } from "../context";

const BANDS = [
  { route: "auto_accept", title: "High confidence", range: "≥ 90%", outcome: "Auto-accept: saved and counted. 5% drawn as spot checks.", tone: "border-ok", queue: "review" },
  { route: "review", title: "Medium confidence", range: "60–90%", outcome: "Human review: a person confirms or corrects.", tone: "border-amber", queue: "review" },
  { route: "uncertain", title: "Low confidence", range: "< 60%", outcome: "Uncertain: a person decides, maybe more data.", tone: "border-alarm", queue: "uncertain" },
] as const;
const OTHER = [
  { route: "people_vehicles", title: "People & vehicles", outcome: "Always a person, whatever any score says.", queue: "people_vehicles" },
  { route: "likely_blank", title: "Likely blank", outcome: "No object found; 10% sampled for a check.", queue: "blank" },
  { route: "quality", title: "Quality", outcome: "Failed the quality gate; a person looks.", queue: "quality" },
] as const;

/** Section 7: where every screened image went, and why. */
export function RoutingScreen() {
  const { reserve, can } = useSession();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ["routing", reserve], queryFn: () => api.routingSummary(reserve || undefined) });
  const run = useMutation({
    mutationFn: () => api.runRouting(reserve || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["routing"] }); qc.invalidateQueries({ queryKey: ["counts"] }); },
  });
  const rows = summary.data ?? [];
  const count = (route: string, state?: string) =>
    rows.filter((r: RouteCount) => r.route === route && (!state || r.state === state)).reduce((a, r) => a + r.count, 0);
  const total = rows.reduce((a, r) => a + r.count, 0);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[24px] font-semibold">Confidence-based routing</h1>
          <p className="mt-1 text-[14px] text-dim">
            {total ? `${total} screened images.` : "No routed images yet."} AI proposes; people decide anything uncertain or consequential.
          </p>
        </div>
        {can("run") && <button type="button" onClick={() => run.mutate()} disabled={run.isPending}
          className="h-9 rounded-md border border-line px-3 text-[14px] hover:bg-raised disabled:opacity-50">
          {run.isPending ? "Routing…" : "Re-run routing"}
        </button>}
      </header>
      {run.isSuccess && <p role="status" className="text-[13px] text-dim">Routing updated. Images a person already reviewed keep their route.</p>}
      {summary.error && <p role="alert" className="text-alarm">{String(summary.error)}</p>}

      <section aria-label="Confidence bands" className="grid gap-3 md:grid-cols-3">
        {BANDS.map((b) => (
          <Link key={b.route} to={`/app/review/${b.queue}`} className={clsx("rounded-md border-t-4 bg-panel p-4 hover:bg-raised", b.tone)}>
            <div className="text-[13px] text-dim">{b.title} <span className="text-ink">{b.range}</span></div>
            <div className="mt-1 text-[32px] font-semibold tabular-nums">{count(b.route)}</div>
            <div className="text-[13px] text-dim">{b.outcome}</div>
            <div className="mt-2 text-[13px]">
              {count(b.route, "open")} waiting for a person
              {b.route === "auto_accept" ? `, ${count(b.route, "done")} accepted` : ""}
            </div>
          </Link>
        ))}
      </section>
      <section aria-label="Other routes" className="grid gap-3 md:grid-cols-3">
        {OTHER.map((o) => (
          <Link key={o.route} to={`/app/review/${o.queue}`} className="rounded-md bg-panel p-4 hover:bg-raised">
            <div className="text-[13px] text-dim">{o.title}</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums">{count(o.route)}</div>
            <div className="text-[13px] text-dim">{o.outcome}</div>
            <div className="mt-2 text-[13px]">{count(o.route, "open")} waiting</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
