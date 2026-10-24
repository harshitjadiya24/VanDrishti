import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Flag, Inbox, PenLine, ShieldAlert, SkipForward, ThumbsDown, ThumbsUp, Undo2, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { QUEUES } from "../../console/nav";
import { EmptyState, Skeleton, StageBadge, type Stage } from "../../design/kit";
import { Button, heatFor, Kbd } from "../../design/primitives";
import { api, ApiError, type Action, type QueueItem, type QueueKind, type ReviewOut, type Severity, type Taxon } from "../../lib/api";
import { isControlActivation, isPlainKey } from "../../lib/keys";
import { useSession } from "../../lib/session";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import { DecisionPanel } from "./DecisionPanel";
import { FrameView } from "./FrameView";
import { TaxonPicker } from "./TaxonPicker";

const QUEUE_STAGE: Record<QueueKind, Stage> = {
  people_vehicles: "people", review: "review", uncertain: "uncertain", blank: "blank", quality: "quality",
};

// Keys: the first matching allowed action wins. Shown on every button.
const ACTIONS: { action: Action; label: string; key: string; tone: "primary" | "plain" | "danger"; icon: LucideIcon }[] = [
  { action: "confirm", label: "Confirm", key: "y", tone: "primary", icon: Check },
  { action: "confirm_people", label: "Confirm people/vehicle", key: "y", tone: "danger", icon: ShieldAlert },
  { action: "quality_ok", label: "Usable after all", key: "y", tone: "primary", icon: ThumbsUp },
  { action: "correct", label: "Correct species…", key: "c", tone: "plain", icon: PenLine },
  { action: "not_animal", label: "Not an animal", key: "n", tone: "plain", icon: X },
  { action: "false_alarm", label: "False alarm", key: "f", tone: "plain", icon: Flag },
  { action: "quality_bad", label: "Unusable", key: "n", tone: "plain", icon: ThumbsDown },
  { action: "skip", label: "Skip", key: "s", tone: "plain", icon: SkipForward },
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
  const current = Math.min(index, Math.max(items.length - 1, 0));
  const item = items[current];
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
      if (!isPlainKey(e) || isControlActivation(e)) return;
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

  const position = items.length ? current + 1 : 0;
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <h1 className="wide text-[clamp(1.6rem,2.6vw,2.1rem)]">{title}</h1>
        <StageBadge stage={QUEUE_STAGE[kind]} />
        {items.length > 0 && <span className="data pb-1 text-[12px] text-fg-2">{position} of {items.length} waiting</span>}
        <span className="ml-auto hidden flex-wrap gap-x-4 gap-y-1 pb-1 text-[12px] text-fg-3 lg:flex pointer-coarse:hidden">
          <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
          <span><Kbd>M</Kbd> outline</span>
          <span><Kbd>P</Kbd> poaching</span>
          <span><Kbd>1</Kbd>–<Kbd>3</Kbd> severity</span>
        </span>
      </header>

      {items.length > 1 && <Filmstrip items={items} current={current} onPick={setIndex} showImages={kind !== "people_vehicles"} />}

      {error && <p role="alert" className="rounded-[10px] border border-danger/50 bg-danger/10 px-4 py-2.5 text-[14px] text-danger">{error}</p>}
      <AnimatePresence initial={false}>
        {last && (
          <motion.div role="status" key={last.id}
            initial={reduce ? false : { opacity: 0.001, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="flex flex-wrap items-center gap-3 rounded-[12px] border border-settled/40 bg-surface px-4 py-2.5 text-[14px]">
            <StageBadge stage="done">Saved</StageBadge>
            <span><b className="font-semibold">{last.action.replace(/_/g, " ")}</b>{last.human_label ? ` (${last.human_label})` : ""}</span>
            <Button tone="quiet" size="sm" onClick={() => undo.mutate()} disabled={undo.isPending} className="ml-auto">
              <Undo2 size={15} aria-hidden /> Undo <Kbd>U</Kbd>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {queue.isLoading ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]" aria-busy="true">
          <Skeleton className="aspect-[4/3]" /><Skeleton className="h-[480px]" />
        </div>
      ) : queue.error ? (
        <p role="alert" className="text-danger">{String(queue.error)}</p>
      ) : !item ? (
        <EmptyState icon={<Inbox size={20} />} title="Nothing waiting here"
          action={<Link to="/app/pipeline" className="text-[14px] font-medium text-settled underline underline-offset-4">See the road, live</Link>}>
          New frames arrive here after they are ingested, screened and routed.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {/* The next frame slides in; its boxes then draw themselves on. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={item.image_id}
                initial={reduce ? false : { opacity: 0.001, x: 20, filter: "blur(4px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: DURATION.slow * 0.8, ease: EASE_OUT }}>
                <FrameView item={item} showMask={showMask} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Wide screens: the panel stays in view and scrolls inside; the actions dock at its foot. */}
          <aside className="grid content-start gap-5 rounded-[var(--radius-card)] border border-edge bg-surface p-5 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
            <DecisionPanel item={item} />

            <div className="grid gap-3 border-t border-edge pt-4">
              <label className="flex min-h-11 items-center gap-2.5 text-[14px] md:min-h-8">
                <input type="checkbox" checked={poaching} onChange={(e) => setPoaching(e.target.checked)} className="size-[18px] accent-[var(--danger)]" />
                Mark poaching activity <Kbd>P</Kbd>
              </label>
              <div role="group" aria-label="Severity" className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="mr-1 text-fg-2">Severity</span>
                {SEVERITY.map((s, i) => (
                  <button key={s} type="button" aria-pressed={severity === s} onClick={() => setSeverity(severity === s ? null : s)}
                    className={clsx("inline-flex h-11 items-center gap-1.5 rounded-[8px] border px-3 capitalize transition-colors duration-[var(--duration-fast)] md:h-8",
                      severity === s ? "border-fg bg-fg text-canvas" : "border-edge text-fg-2 hover:text-fg")}>
                    {s} <Kbd>{i + 1}</Kbd>
                  </button>
                ))}
              </div>
              <label className="grid gap-1.5 text-[12.5px] text-fg-2">
                Notes for the record (optional)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="rounded-[8px] border border-edge bg-canvas px-2.5 py-2 text-[16px] text-fg md:text-[14px]" />
              </label>
            </div>

            {correcting ? (
              <TaxonPicker reserve={reserve || undefined} onCancel={() => setCorrecting(false)}
                onPick={(t) => submit.mutate({ action: "correct", taxon: t })} />
            ) : (
              <div className="-mx-5 -mb-5 grid gap-2 border-t border-edge bg-surface/95 px-5 pt-3 pb-5 xl:sticky xl:-bottom-5 xl:backdrop-blur">
                {ACTIONS.filter((a) => item.allowed_actions.includes(a.action)).map((a) => (
                  <Button key={a.action} onClick={() => act(a.action)} disabled={!reviewer || submit.isPending}
                    tone={a.tone === "primary" ? "decide" : a.tone === "danger" ? "danger" : "quiet"}
                    className="justify-between">
                    <span className="flex items-center gap-2"><a.icon size={16} aria-hidden />{a.label}</span>
                    <Kbd className={a.tone === "plain" ? undefined : "border-black/25 bg-black/10 text-current"}>{a.key === "y" ? "Y / Enter" : a.key.toUpperCase()}</Kbd>
                  </Button>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** The queue as a strip of frames, warm to hot by how unsure the model was. Shows a window
 * around the current frame so a long queue stays light. */
function Filmstrip({ items, current, onPick, showImages }: { items: QueueItem[]; current: number; onPick: (i: number) => void; showImages: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const start = Math.max(0, current - 6);
  const shown = items.slice(start, start + 16);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-current='true']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <nav aria-label="Queue" className="min-w-0">
      <ol ref={list} className="flex gap-2 overflow-x-auto pb-1">
        {shown.map((f, i) => {
          const at = start + i;
          const active = at === current;
          return (
            <li key={f.image_id} className="shrink-0">
              <button type="button" onClick={() => onPick(at)} aria-current={active}
                aria-label={`Frame ${at + 1}: camera ${f.camera}${f.confidence !== null ? `, confidence ${f.confidence.toFixed(2)}` : ""}`}
                className={clsx("block w-[116px] overflow-hidden rounded-[8px] border bg-black text-left transition-[border-color,transform] duration-[var(--duration-fast)]",
                  active ? "-translate-y-0.5 border-decide shadow-[0_8px_20px_-10px_rgb(255_138_61/0.6)]" : "border-edge hover:border-edge-strong")}>
                {/* Opening a people/vehicle frame is an audited view: the strip never loads those
                    frames as thumbnails, so the record only holds frames a person opened. */}
                {showImages
                  ? <img src={api.displayUrl(f.image_id)} alt="" loading="lazy" className={clsx("block aspect-[4/3] w-full object-cover", !active && "brightness-75")} />
                  : <span aria-hidden className="grid aspect-[4/3] w-full place-items-center bg-surface-2 text-danger"><ShieldAlert size={22} /></span>}
                <span className="data flex justify-between bg-black px-1.5 py-1 text-[9.5px] text-ir">
                  <span className="truncate">{f.camera}</span>
                  {f.confidence !== null && <span style={{ color: heatFor(f.confidence) }}>{f.confidence.toFixed(2)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
