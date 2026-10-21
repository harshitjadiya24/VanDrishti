import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { api, ApiError, type Action, type QueueKind, type ReviewOut, type Severity, type Taxon } from "../api";
import { DecisionPanel } from "../components/DecisionPanel";
import { FrameView } from "../components/FrameView";
import { TaxonPicker } from "../components/TaxonPicker";
import { useSession } from "../context";
import { QUEUES } from "../Shell";

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
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
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

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[24px] font-semibold">{title}</h1>
        <span className="text-[13px] text-dim">
          {items.length ? `${Math.min(index, items.length - 1) + 1} of ${items.length} waiting` : ""}
        </span>
      </header>

      {error && <p role="alert" className="mb-4 rounded-md border border-alarm/60 px-3 py-2 text-[14px] text-alarm">{error}</p>}
      {last && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-panel px-3 py-2 text-[14px]">
          <span>Saved: <b className="font-medium">{last.action.replace(/_/g, " ")}</b>{last.human_label ? ` (${last.human_label})` : ""}.</span>
          <button type="button" onClick={() => undo.mutate()} disabled={undo.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[13px] hover:bg-raised">
            <Undo2 size={14} aria-hidden /> Undo <kbd>U</kbd>
          </button>
        </div>
      )}

      {queue.isLoading ? (
        <div className="h-[60vh] animate-pulse rounded-md bg-panel" aria-busy="true" />
      ) : queue.error ? (
        <p role="alert" className="text-alarm">{String(queue.error)}</p>
      ) : !item ? (
        <div className="grid place-items-center rounded-md bg-panel px-6 py-20 text-center">
          <p className="text-[18px]">Nothing waiting here.</p>
          <p className="mt-1 text-[14px] text-dim">New images appear after they are ingested, screened and routed.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <FrameView item={item} showMask={showMask} />
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim pointer-coarse:hidden">
              <span><kbd>J</kbd> <kbd>K</kbd> next / previous</span>
              <span><kbd>M</kbd> {showMask ? "hide" : "show"} outline</span>
              <span><kbd>P</kbd> poaching activity</span>
              <span><kbd>1</kbd>–<kbd>3</kbd> severity</span>
            </p>
          </div>
          <aside className="grid content-start gap-5 rounded-md bg-panel p-4">
            <DecisionPanel item={item} />

            <div className="grid gap-2 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={poaching} onChange={(e) => setPoaching(e.target.checked)} className="accent-alarm" />
                Mark poaching activity <kbd>P</kbd>
              </label>
              <div role="group" aria-label="Severity" className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="text-dim">Severity</span>
                {SEVERITY.map((s, i) => (
                  <button key={s} type="button" aria-pressed={severity === s} onClick={() => setSeverity(severity === s ? null : s)}
                    className={clsx("rounded-full border px-2.5 py-0.5",
                      severity === s ? "border-amber text-ink" : "border-line text-dim hover:text-ink")}>
                    {s} <kbd>{i + 1}</kbd>
                  </button>
                ))}
              </div>
              <label className="grid gap-1 text-[12px] text-dim">
                Notes for the record (optional)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="rounded-md border border-line bg-base px-2 py-1.5 text-[14px] text-ink" />
              </label>
            </div>

            {correcting ? (
              <TaxonPicker reserve={reserve || undefined} onCancel={() => setCorrecting(false)}
                onPick={(t) => submit.mutate({ action: "correct", taxon: t })} />
            ) : (
              <div className="grid gap-2">
                {ACTIONS.filter((a) => item.allowed_actions.includes(a.action)).map((a) => (
                  <button key={a.action} type="button" onClick={() => act(a.action)} disabled={!reviewer || submit.isPending}
                    className={clsx(
                      "flex h-10 items-center justify-between rounded-md border px-3 text-[14px] disabled:opacity-40",
                      a.tone === "primary" && "border-ok bg-ok/15 font-medium hover:bg-ok/25",
                      a.tone === "danger" && "border-alarm bg-alarm/15 font-medium hover:bg-alarm/25",
                      a.tone === "plain" && "border-line hover:bg-raised",
                    )}>
                    {a.label} <kbd>{a.key === "y" ? "Y / Enter" : a.key.toUpperCase()}</kbd>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
