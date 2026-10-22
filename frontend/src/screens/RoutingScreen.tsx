import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { api, type RouteCount } from "../api";
import { BUTTON, CountNumber, PageHeader, Plate, Skeleton } from "../components/kit";
import { useSession } from "../context";
import { DURATION, EASE_BOARD } from "../motion/tokens";

const BANDS = [
  { route: "auto_accept", title: "High confidence", range: "≥ 0.9", outcome: "Auto-accept: saved and counted. 5% drawn as spot checks.", fill: "bg-ok", queue: "review" },
  { route: "review", title: "Medium confidence", range: "0.6 to 0.9", outcome: "Human review: a person confirms or corrects.", fill: "bg-check", queue: "review" },
  { route: "uncertain", title: "Low confidence", range: "< 0.6", outcome: "Uncertain: a person decides, maybe more data.", fill: "bg-check/60", queue: "uncertain" },
] as const;
const OTHER = [
  { route: "people_vehicles", title: "People & vehicles", outcome: "Always a person, whatever any score says.", fill: "bg-alarm", queue: "people_vehicles" },
  { route: "likely_blank", title: "Likely blank", outcome: "No object found; 10% sampled for a check.", fill: "bg-line", queue: "blank" },
  { route: "quality", title: "Quality", outcome: "Failed the quality gate; a person looks.", fill: "bg-dim", queue: "quality" },
] as const;

/** Section 7: where every screened image went, and why. */
export function RoutingScreen() {
  const { reserve, can } = useSession();
  const reduce = useReducedMotion();
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
  const all = [...BANDS, ...OTHER];

  const card = (b: (typeof all)[number], big: boolean) => (
    <Link key={b.route} to={`/app/review/${b.queue}`} className="group block rounded-[12px]">
      <Plate className="grid h-full gap-2 p-4 transition group-hover:bg-raised">
        <div className="flex items-center gap-2 text-[14px]">
          <span aria-hidden className={clsx("size-3 rounded-[3px]", b.fill)} />
          <span className="font-semibold">{b.title}</span>
          {"range" in b && <span className="text-dim">{b.range}</span>}
          <ArrowRight size={16} aria-hidden className="ml-auto text-dim transition group-hover:translate-x-0.5 group-hover:text-ink" />
        </div>
        <CountNumber value={count(b.route)} className={clsx("block leading-none font-semibold", big ? "text-[38px]" : "text-[28px]")} />
        <p className="text-[14px] text-dim">{b.outcome}</p>
        <p className="text-[14px] font-medium">
          {count(b.route, "open")} waiting for a person
          {b.route === "auto_accept" ? `, ${count(b.route, "done")} accepted` : ""}
        </p>
      </Plate>
    </Link>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title="Confidence-based routing"
        actions={can("run") && (
          <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className={BUTTON}>
            {run.isPending ? "Routing…" : "Re-run routing"}
          </button>
        )}>
        {total ? `${total} screened images.` : "No routed images yet."} AI proposes; people decide anything uncertain or consequential.
      </PageHeader>
      {run.isSuccess && <p role="status" className="text-[14px] text-dim">Routing updated. Images a person already reviewed keep their route.</p>}
      {summary.error && <p role="alert" className="text-alarm">{String(summary.error)}</p>}
      {!summary.data && !summary.error && <Skeleton className="h-64" />}

      {total > 0 && (
        // One strip for the whole sample: where each screened image went.
        <figure className="grid gap-2">
          <div className="flex h-4 overflow-hidden rounded-[4px] bg-raised" role="img"
            aria-label={all.map((b) => `${b.title} ${count(b.route)}`).join(", ")}>
            {all.map((b, i) => count(b.route) > 0 && (
              <motion.span key={b.route} title={`${b.title}: ${count(b.route)}`} className={clsx("h-full border-r-2 border-base last:border-r-0", b.fill)}
                initial={reduce ? false : { width: 0 }} animate={{ width: `${(count(b.route) / total) * 100}%` }}
                transition={{ duration: DURATION.board * 1.4, ease: EASE_BOARD, delay: reduce ? 0 : i * 0.06 }} />
            ))}
          </div>
          <figcaption className="text-[13px] text-dim">Every screened image has exactly one route; the strip is their share.</figcaption>
        </figure>
      )}

      {summary.data && (
        <>
          <section aria-label="Confidence bands" className="grid gap-3 md:grid-cols-3">{BANDS.map((b) => card(b, true))}</section>
          <section aria-label="Other routes" className="grid gap-3 md:grid-cols-3">{OTHER.map((b) => card(b, false))}</section>
        </>
      )}
    </div>
  );
}
