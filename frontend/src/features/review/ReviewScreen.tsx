import { isPlainKey } from "../../lib/keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Inbox, Undo2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError, type Action, type QueueKind, type ReviewOut, type Severity, type Taxon } from "../../lib/api";
import { DecisionPanel } from "./DecisionPanel";
import { FrameView } from "./FrameView";
import { EmptyState, Plate, Skeleton, StageBadge, type Stage } from "../../design/kit";
import { TaxonPicker } from "./TaxonPicker";
import { useSession } from "../../lib/session";
import { DURATION, EASE_BOARD } from "../../motion/tokens";
import { QUEUES } from "../../console/nav";

const QUEUE_STAGE: Record<QueueKind, Stage> = {
  people_vehicles: "people", review: "review", uncertain: "uncertain", blank: "blank", quality: "quality",
};

// Keys: the first matching allowed action wins. Shown on every button.
const ACTIONS: { action: Action; label: string; key: string; tone: "primary" | "plain" | "danger" }[] = [
  { action: "confirm", label: "Confirm", key: "y", tone: "primary" },
  { action: "confirm_people", label: "Confirm people/vehicle", key: "y", tone: "danger" },
  { action: "quality_ok", label: "Usable after all", key: "y", tone: "primary" },
  { action: "correct", label: "Correct species…", key: "c", tone: "plain" },
  { action: "not_animal", label: "Not an animal", key: "n", tone: "plain" },
  { action: "false_alarm", label: "False alarm", key: "f", tone: "plain" },
  { action: "quality_bad", label: "Unusable", key: "n", tone: "plain" },
  { action: "skip", label: "Skip", key: "s", tone: "plain" },
];
const SEVERITY: Severity[] = ["low", "medium", "high"];

export function ReviewScreen() {
  const kind = (useParams().kind ?? "review") as QueueKind;
  const reduce = useReducedMotion();
  const { reserve, reviewer } = useSession();
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["queue", kind, reserve], queryFn: () => api.queue(kind, reserve || undefined) });
  const [index, setIndex] = useState(0);
  const [showMask, setShowMask] = useState(true);
  const [correcting, setCorrecting] = useState(false);
  const [poaching, setPoaching] = useState(false);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [notes, setNotes] = useState("");
  const [last, setLast] = useState<ReviewOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = queue.data ?? [];
  const item = items[Math.min(index, Math.max(items.length - 1, 0))];
  const title = QUEUES.find((q) => q.kind === kind)?.label ?? kind;

  const resetForm = () => { setCorrecting(false); setPoaching(false); setSeverity(null); setNotes(""); };

  const submit = useMutation({
    mutationFn: (v: { action: Action; taxon?: Taxon }) => api.review({
      image_id: item!.image_id,
      action: v.action,
      human_label: v.taxon?.common_name,
      human_taxon: v.taxon?.taxon,
      poaching_activity: poaching,
      severity,
      notes: notes || undefined,
    }),
    onSuccess: (r, v) => {
      setLast(r);
      setError(null);
      resetForm();
      if (v.action === "skip") setIndex((i) => i + 1);
      else qc.setQueryData(["queue", kind, reserve], (old: typeof items | undefined) => old?.filter((x) => x.image_id !== r.image_id));
      qc.invalidateQueries({ queryKey: ["counts"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
  });

  const undo = useMutation({
    mutationFn: () => api.undo(last!.id),
    onSuccess: () => {
      setLast(null);
      qc.invalidateQueries({ queryKey: ["queue", kind, reserve] });
      qc.invalidateQueries({ queryKey: ["counts"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
  });

  const act = useCallback((action: Action) => {
    if (!item || !reviewer || submit.isPending) return;
    if (action === "correct") { setCorrecting(true); return; }
    submit.mutate({ action });
  }, [item, reviewer, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e)) return;
      if (!item) return;
      const k = e.key.toLowerCase();
      if (k === "u" && last) { undo.mutate(); return; }
      if (k === "m") { setShowMask((v) => !v); return; }
      if (k === "p") { setPoaching((v) => !v); return; }
      if (["1", "2", "3"].includes(k)) { setSeverity(SEVERITY[Number(k) - 1]); return; }
      if (k === "j" || e.key === "ArrowRight") { setIndex((i) => Math.min(i + 1, items.length - 1)); return; }
      if (k === "k" || e.key === "ArrowLeft") { setIndex((i) => Math.max(i - 1, 0)); return; }
      const match = ACTIONS.find((a) => (a.key === k || (k === "enter" && a.key === "y")) && item.allowed_actions.includes(a.action));
      if (match) { e.preventDefault(); act(match.action); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, items.length, last, act, undo]);

  const position = items.length ? Math.min(index, items.length - 1) + 1 : 0;
  return (
    <div>
      <header className="mb-5 grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[26px] font-semibold">{title}</h1>
          <StageBadge stage={QUEUE_STAGE[kind]} />
          {items.length > 0 && <span className="tabular text-[15px] text-dim">{position} of {items.length} waiting</span>}
        </div>
        {items.length > 1 && (
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-raised">
            <motion.div className="h-full rounded-full bg-board" initial={false}
              animate={{ width: `${(position / items.length) * 100}%` }}
              transition={{ duration: reduce ? 0 : DURATION.board, ease: EASE_BOARD }} />
          </div>
        )}
      </header>

      {error && <p role="alert" className="mb-4 rounded-[10px] bg-alarm px-4 py-2.5 text-[15px] text-on-alarm">{error}</p>}
      {last && (
        <Plate role="status" className="mb-4 flex flex-wrap items-center gap-3 px-4 py-2.5 text-[15px]">
          <StageBadge stage="done">Saved</StageBadge>
          <span><b className="font-semibold">{last.action.replace(/_/g, " ")}</b>{last.human_label ? ` (${last.human_label})` : ""}</span>
          <button type="button" onClick={() => undo.mutate()} disabled={undo.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1 text-[14px] hover:bg-raised">
            <Undo2 size={15} aria-hidden /> Undo <kbd>U</kbd>
          </button>
        </Plate>
      )}

      {queue.isLoading ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]" aria-busy="true">
          <Skeleton className="aspect-[4/3]" /><Skeleton className="h-[480px]" />
        </div>
      ) : queue.error ? (
        <p role="alert" className="text-alarm">{String(queue.error)}</p>
      ) : !item ? (
        <EmptyState icon={<Inbox size={20} />} title="Nothing waiting here"
          action={<Link to="/app/pipeline" className="text-[15px] font-semibold text-ok underline">See the road, live</Link>}>
          New frames arrive here after they are ingested, screened and routed.
        </EmptyState>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {/* A new frame slides in like a board being hung; its boxes then draw themselves on. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={item.image_id}
                initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
                transition={{ duration: DURATION.board * 0.7, ease: EASE_BOARD }}>
                <FrameView item={item} showMask={showMask} />
              </motion.div>
            </AnimatePresence>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-dim pointer-coarse:hidden">
              <span><kbd>J</kbd> <kbd>K</kbd> next / previous</span>
              <span><kbd>M</kbd> {showMask ? "hide" : "show"} outline</span>
              <span><kbd>P</kbd> poaching activity</span>
              <span><kbd>1</kbd>–<kbd>3</kbd> severity</span>
            </p>
          </div>
          {/* Wide screens: the plate stays in view and scrolls inside; the actions dock at its foot. */}
          <Plate as="aside" rivets className="grid content-start gap-5 p-5 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
            <DecisionPanel item={item} />

            <div className="grid gap-3 border-t border-line pt-4">
              <label className="flex min-h-11 items-center gap-2.5 text-[15px] md:min-h-8">
                <input type="checkbox" checked={poaching} onChange={(e) => setPoaching(e.target.checked)} className="size-5 accent-[var(--alarm)]" />
                Mark poaching activity <kbd>P</kbd>
              </label>
              <div role="group" aria-label="Severity" className="flex flex-wrap items-center gap-1.5 text-[14px]">
                <span className="text-dim">Severity</span>
                {SEVERITY.map((s, i) => (
                  <button key={s} type="button" aria-pressed={severity === s} onClick={() => setSeverity(severity === s ? null : s)}
                    className={clsx("h-11 rounded-[8px] border px-3 capitalize md:h-8",
                      severity === s ? "border-ink bg-ink text-panel" : "border-line text-dim hover:text-ink")}>
                    {s} <kbd>{i + 1}</kbd>
                  </button>
                ))}
              </div>
              <label className="grid gap-1 text-[13px] text-dim">
                Notes for the record (optional)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="rounded-[8px] border border-line bg-base px-2.5 py-1.5 text-[15px] text-ink" />
              </label>
            </div>

            {correcting ? (
              <TaxonPicker reserve={reserve || undefined} onCancel={() => setCorrecting(false)}
                onPick={(t) => submit.mutate({ action: "correct", taxon: t })} />
            ) : (
              <div className="sticky -bottom-5 -mx-5 -mb-5 grid gap-2 border-t border-line bg-panel px-5 pt-3 pb-5">
                {ACTIONS.filter((a) => item.allowed_actions.includes(a.action)).map((a) => (
                  <button key={a.action} type="button" onClick={() => act(a.action)} disabled={!reviewer || submit.isPending}
                    className={clsx(
                      "flex h-11 items-center justify-between rounded-[10px] px-4 text-[15px] transition-transform duration-[var(--duration-quick)] active:translate-y-px disabled:opacity-40",
                      a.tone === "primary" && "bg-ok font-semibold text-on-ok shadow-[var(--shadow-plate)] hover:brightness-110",
                      a.tone === "danger" && "bg-alarm font-semibold text-on-alarm shadow-[var(--shadow-plate)] hover:brightness-110",
                      a.tone === "plain" && "border border-line bg-base hover:bg-raised",
                    )}>
                    {a.label} <kbd>{a.key === "y" ? "Y / Enter" : a.key.toUpperCase()}</kbd>
                  </button>
                ))}
              </div>
            )}
          </Plate>
        </div>
      )}
    </div>
  );
}
