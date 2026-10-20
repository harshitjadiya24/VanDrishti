import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useSession } from "../context";

/** Section 8 feedback: how often people agreed with the model, per confidence band. */
export function FeedbackScreen() {
  const { reserve } = useSession();
  const f = useQuery({ queryKey: ["feedback", reserve], queryFn: () => api.feedback(reserve || undefined) });
  const d = f.data;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-[24px] font-semibold">Feedback</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-dim">
          Every review is kept as feedback: what the model said and what a person said. This is how the
          confidence bands are checked in this reserve, and the data future model improvements learn from.
        </p>
      </header>
      {f.error && <p role="alert" className="text-alarm">{String(f.error)}</p>}
      {d && (
        <>
          <section className="grid gap-3 md:grid-cols-3" aria-label="Agreement by band">
            {(["high", "medium", "low"] as const).map((b) => {
              const row = d.by_band[b];
              return (
                <div key={b} className="rounded-md bg-panel p-4">
                  <div className="text-[13px] text-dim">{b} confidence</div>
                  <div className="mt-1 text-[28px] font-semibold tabular-nums">
                    {row ? `${Math.round(row.agreement * 100)}%` : "—"}
                  </div>
                  <div className="text-[13px] text-dim">
                    {row ? `people agreed ${row.agreed ?? 0}, changed ${row.changed ?? 0}` : "no reviews yet"}
                  </div>
                </div>
              );
            })}
          </section>
          <section>
            <h2 className="mb-2 text-[16px] font-semibold">Most common corrections</h2>
            {d.top_corrections.length === 0 ? (
              <p className="text-[14px] text-dim">No corrections yet.</p>
            ) : (
              <table className="w-full max-w-2xl text-left text-[14px]">
                <thead className="text-[12px] text-dim">
                  <tr className="border-b border-line"><th className="py-2 font-normal">Model said</th><th className="py-2 font-normal">Person said</th><th className="py-2 text-right font-normal">Times</th></tr>
                </thead>
                <tbody>
                  {d.top_corrections.map((c) => (
                    <tr key={c.model + c.human} className="border-b border-line/60">
                      <td className="py-1.5">{c.model}</td><td className="py-1.5">{c.human}</td><td className="py-1.5 text-right tabular-nums">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <p className="text-[13px] text-dim">
            Actions: {Object.entries(d.actions).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ") || "none yet"}.
            {" "}Poaching activity marked {d.poaching_marked} time{d.poaching_marked === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </div>
  );
}
