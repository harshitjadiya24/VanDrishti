import { useQuery } from "@tanstack/react-query";
import { MessageSquareDashed } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../../lib/api";
import { EmptyState, PageHeader, Plate, Skeleton } from "../../design/kit";
import { useSession } from "../../lib/session";
import { DURATION, EASE_OUT } from "../../motion/tokens";

const BANDS = [
  { band: "high", title: "High confidence", range: "0.9 and above" },
  { band: "medium", title: "Medium confidence", range: "0.6 to 0.9" },
  { band: "low", title: "Low confidence", range: "below 0.6" },
] as const;

/** Section 8 feedback: how often people agreed with the model, per confidence band. */
export function FeedbackScreen() {
  const { reserve } = useSession();
  const reduce = useReducedMotion();
  const f = useQuery({ queryKey: ["feedback", reserve], queryFn: () => api.feedback(reserve || undefined) });
  const d = f.data;
  return (
    <div className="grid gap-6">
      <PageHeader title="Feedback">
        Every review is kept as feedback: what the model said and what a person said. This is how the confidence bands
        are checked in this reserve, and the data future model improvements learn from.
      </PageHeader>
      {f.error && <p role="alert" className="text-danger">{String(f.error)}</p>}
      {!d && !f.error && <Skeleton className="h-56" />}
      {d && (
        <>
          <section aria-labelledby="agree-h" className="grid gap-3">
            <h2 id="agree-h" className="text-[18px] font-semibold">How often people agreed, by band</h2>
            <Plate className="grid gap-5 p-5">
              {BANDS.map(({ band, title, range }, i) => {
                const row = d.by_band[band];
                const agreed = row?.agreed ?? 0, changed = row?.changed ?? 0, n = agreed + changed;
                return (
                  <div key={band} className="grid gap-1.5 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                    <div>
                      <p className="text-[15px] font-semibold">{title}</p>
                      <p className="text-[13px] text-fg-2">{range}</p>
                    </div>
                    {n ? (
                      <div className="flex h-6 overflow-hidden rounded-[4px] bg-surface-2" role="img"
                        aria-label={`${title}: people agreed ${agreed} times and changed the answer ${changed} times`}>
                        <motion.span className="h-full bg-settled" initial={reduce ? false : { width: 0 }} animate={{ width: `${(agreed / n) * 100}%` }}
                          transition={{ duration: DURATION.slow * 1.4, ease: EASE_OUT, delay: reduce ? 0 : i * 0.1 }} />
                        <motion.span className="h-full bg-heat-4" initial={reduce ? false : { width: 0 }} animate={{ width: `${(changed / n) * 100}%` }}
                          transition={{ duration: DURATION.slow * 1.4, ease: EASE_OUT, delay: reduce ? 0 : i * 0.1 + 0.15 }} />
                      </div>
                    ) : <p className="text-[14px] text-fg-2">No reviews in this band yet.</p>}
                    <p className="tabular text-[14px] sm:text-right">
                      {row ? <><span className="text-[22px] font-semibold">{Math.round(row.agreement * 100)}%</span> <span className="text-fg-2">agreed · {agreed} kept, {changed} changed</span></> : "—"}
                    </p>
                  </div>
                );
              })}
              <p className="flex flex-wrap gap-4 text-[13px] text-fg-2">
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-[2px] bg-settled" />Person kept the model's answer</span>
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-[2px] bg-heat-4" />Person changed it</span>
                <span>Small numbers say little: read the counts, not only the percentage.</span>
              </p>
            </Plate>
          </section>

          <section aria-labelledby="corr-h" className="grid gap-3">
            <h2 id="corr-h" className="text-[18px] font-semibold">Most common corrections</h2>
            {d.top_corrections.length === 0 ? (
              <EmptyState icon={<MessageSquareDashed size={20} />} title="No corrections yet">
                When a person changes the model's species, the pair shows here.
              </EmptyState>
            ) : (
              <Plate className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-left text-[14px]">
                  <thead className="text-[13px] text-fg-2">
                    <tr><th className="px-4 py-2.5 font-normal">Model said</th><th className="px-4 py-2.5 font-normal">Person said</th><th className="px-4 py-2.5 text-right font-normal">Times</th></tr>
                  </thead>
                  <tbody>
                    {d.top_corrections.map((c) => (
                      <tr key={c.model + c.human} className="border-t border-edge">
                        <td className="px-4 py-2 text-fg-2 line-through decoration-heat-4">{c.model}</td>
                        <td className="px-4 py-2 font-medium">{c.human}</td>
                        <td className="tabular px-4 py-2 text-right">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Plate>
            )}
          </section>
          <p className="text-[14px] text-fg-2">
            Actions: {Object.entries(d.actions).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ") || "none yet"}.
            {" "}Poaching activity marked {d.poaching_marked} time{d.poaching_marked === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </div>
  );
}
