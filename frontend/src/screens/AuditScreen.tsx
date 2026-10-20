import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../api";

/** The hash-chained audit trail and a button that recomputes every hash. */
export function AuditScreen() {
  const events = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const verify = useMutation({ mutationFn: api.auditVerify });
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[24px] font-semibold">Audit trail</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-dim">
            Every review and undo, in order. Each entry's hash covers the one before it, and the database refuses to edit or delete entries.
          </p>
        </div>
        <button type="button" onClick={() => verify.mutate()} disabled={verify.isPending}
          className="h-9 rounded-md border border-line px-3 text-[14px] hover:bg-raised disabled:opacity-50">
          Verify the chain
        </button>
      </header>
      {verify.data && (
        <p role="status" className={clsx("rounded-md px-3 py-2 text-[14px]", verify.data.ok ? "bg-ok/15 text-ok" : "bg-alarm/15 text-alarm")}>
          {verify.data.ok
            ? `Intact: ${verify.data.events_checked} entries checked.`
            : `Broken at entry #${verify.data.first_broken_seq} (after ${verify.data.events_checked} good entries).`}
        </p>
      )}
      {events.error && <p role="alert" className="text-alarm">{String(events.error)}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <thead className="text-[12px] text-dim">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">#</th><th className="py-2 pr-3 font-normal">When</th>
              <th className="py-2 pr-3 font-normal">Who</th><th className="py-2 pr-3 font-normal">What</th><th className="py-2 font-normal">Details</th>
            </tr>
          </thead>
          <tbody>
            {(events.data ?? []).map((e) => (
              <tr key={e.seq} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-3 tabular-nums text-dim">{e.seq}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(e.at).toLocaleString()}</td>
                <td className="py-1.5 pr-3">{e.actor}</td>
                <td className="py-1.5 pr-3">{e.action.replace(/_/g, " ")}</td>
                <td className="py-1.5 text-[12px] text-dim">
                  {Object.entries(e.payload).filter(([, v]) => v !== null && v !== false).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
