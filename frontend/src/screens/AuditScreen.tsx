import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Link2, Lock, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api, type AuditEvent } from "../api";
import { PageHeader, Plate, Skeleton } from "../components/kit";
import { DURATION, EASE_BOARD, EASE_STAMP } from "../motion/tokens";

const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

/** The hash-chained audit trail and a button that recomputes every hash. */
export function AuditScreen() {
  const reduce = useReducedMotion();
  const events = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const verify = useMutation({ mutationFn: api.auditVerify });
  const v = verify.data;
  const items = events.data ?? [];
  return (
    <div className="grid gap-6">
      <PageHeader title="Audit trail"
        actions={
          <button type="button" onClick={() => verify.mutate()} disabled={verify.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-board px-3 text-[14px] font-semibold text-on-board hover:bg-board-deep disabled:opacity-60">
            <Lock size={15} aria-hidden />{verify.isPending ? "Recomputing every hash…" : "Verify the chain"}
          </button>
        }>
        Every review and undo, in order. Each entry's hash covers the one before it, so changing any entry breaks every
        link after it. The database refuses to edit or delete entries. Verifying recomputes every hash on the server.
      </PageHeader>

      <AnimatePresence mode="wait">
        {v && (
          <motion.div key={`${v.ok}-${v.events_checked}`} role="status"
            initial={reduce ? false : { opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_STAMP }}
            className={clsx("flex items-center gap-3 rounded-[12px] border-2 px-4 py-3 text-[16px] font-semibold",
              v.ok ? "border-ok text-ok" : "border-alarm bg-alarm text-white")}>
            {v.ok ? <Lock size={20} aria-hidden /> : <ShieldAlert size={20} aria-hidden />}
            {v.ok
              ? `Intact: all ${v.events_checked} entries recomputed and every link matches.`
              : `Broken at entry #${v.first_broken_seq} (after ${v.events_checked} good entries). Every entry after it is suspect.`}
          </motion.div>
        )}
      </AnimatePresence>
      {verify.error && <p role="alert" className="text-alarm">{String(verify.error)}</p>}
      {events.error && <p role="alert" className="text-alarm">{String(events.error)}</p>}
      {!events.data && !events.error && <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}

      {items.length > 0 && (
        <section aria-labelledby="chain-h" className="grid gap-3">
          <h2 id="chain-h" className="text-[18px] font-semibold">Newest {items.length} entries</h2>
          <ol className="grid">
            {items.map((e, i) => (
              <ChainLink key={e.seq} e={e} next={items[i + 1]} index={i}
                state={!v ? "idle" : v.ok || (v.first_broken_seq !== null && e.seq < v.first_broken_seq) ? "ok" : "broken"} />
            ))}
          </ol>
          <p className="text-[13px] text-dim">Times in UTC: the trail spans every reserve.</p>
        </section>
      )}
    </div>
  );
}

function ChainLink({ e, next, index, state }: { e: AuditEvent; next?: AuditEvent; index: number; state: "idle" | "ok" | "broken" }) {
  const reduce = useReducedMotion();
  const details = Object.entries(e.payload).filter(([, x]) => x !== null && x !== false).map(([k, x]) => `${k}: ${String(x)}`).join(", ");
  return (
    <li className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-3">
      {/* The chain itself: a link down to the entry this one's hash covers. */}
      {next && <span aria-hidden className="absolute top-10 bottom-0 left-[19px] w-0.5 bg-line" />}
      <span className={clsx("relative z-10 grid size-10 place-items-center rounded-full border-2 bg-panel",
        state === "ok" ? "border-ok text-ok" : state === "broken" ? "border-alarm text-alarm" : "border-line text-dim")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={state} initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: DURATION.base, ease: EASE_BOARD, delay: reduce ? 0 : Math.min(index * 0.03, 0.9) }}>
            {state === "ok" ? <Check size={18} aria-label="verified" /> : state === "broken" ? <X size={18} aria-label="not verified" /> : <Link2 size={16} aria-hidden />}
          </motion.span>
        </AnimatePresence>
      </span>
      <Plate className="grid gap-1 px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tabular text-[13px] text-dim">#{e.seq}</span>
          <span className="text-[15px] font-semibold">{e.action.replace(/_/g, " ")}</span>
          <span className="text-[14px]">{e.actor}</span>
          <span className="ml-auto text-[13px] text-dim">{utc(e.at)}</span>
        </div>
        {details && <p className="text-[13px] break-words text-dim">{details}</p>}
        <p className="flex flex-wrap gap-x-4 font-mono text-[12px] text-dim">
          <span title={e.hash}>hash {short(e.hash)}</span>
          <span title={e.prev_hash}>covers {next ? `#${next.seq}` : "the entry before"} · {short(e.prev_hash)}</span>
        </p>
      </Plate>
    </li>
  );
}
