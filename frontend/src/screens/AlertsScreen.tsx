import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { BellOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { api, type AlertItem, type AlertState } from "../api";
import { localTime } from "../components/FrameView";
import { BUTTON, CountBadge, EmptyState, FIELD, PageHeader, Plate, Segmented, Skeleton, useToast } from "../components/kit";
import { useSession } from "../context";
import { DURATION, EASE_BOARD } from "../motion/tokens";

const KIND_LABEL: Record<AlertItem["kind"], string> = {
  tiger_sighting: "Tiger sighting",
  poaching_risk: "Poaching risk",
  unusual_activity: "Unusual activity",
  camera_failure: "Camera problem",
};
const SEVERITY = {
  critical: { word: "Critical", heading: "Critical: act first", badge: "bg-alarm text-on-alarm" },
  warning: { word: "Warning", heading: "Warnings", badge: "bg-check text-on-check" },
  info: { word: "Information", heading: "For information", badge: "bg-raised text-ink" },
} as const;
const ORDER = ["critical", "warning", "info"] as const;

/** Section 11: alerts for a person to acknowledge and resolve. */
export function AlertsScreen() {
  const { reserve, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<AlertState>("open");
  const [kind, setKind] = useState<string>("");
  const alerts = useQuery({
    queryKey: ["alerts", reserve, state, kind],
    queryFn: () => api.alerts(reserve || undefined, state, kind || undefined),
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["alerts"] }); qc.invalidateQueries({ queryKey: ["alert-counts"] }); };
  const run = useMutation({ mutationFn: () => api.runAlerts(reserve || undefined), onSuccess: refresh });
  const act = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "acknowledge" | "resolve" | "reopen"; note?: string }) =>
      api.actAlert(id, action, note),
    onSuccess: (a, v) => {
      refresh();
      if (v.action === "reopen") { toast.show({ message: "Alert reopened.", tone: "info" }); return; }
      // Undo reopens the alert: a new, audited action, never an erased one.
      toast.show({
        message: v.action === "acknowledge" ? `Acknowledged: ${a.title}` : `Resolved: ${a.title}`,
        tone: "ok",
        action: { label: "Undo", run: () => act.mutate({ id: v.id, action: "reopen" }) },
      });
    },
  });
  const webhook = run.data?.webhook;
  const items = alerts.data ?? [];
  return (
    <div className="grid gap-6">
      <PageHeader title="Alerts"
        badges={state === "open" && items.length > 0 && <CountBadge n={items.length} tone="alarm" label="open alerts" />}
        actions={can("run") && (
          <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className={BUTTON}>
            {run.isPending ? "Checking…" : "Check rules now"}
          </button>
        )}>
        Each alert is a prompt for a person, not a confirmed finding. Acknowledge when you are acting on it, resolve
        when done; a resolved alert can be reopened. Alerts never contain coordinates.
      </PageHeader>
      {run.data && (
        <p role="status" className="text-[14px] text-dim">
          New or changed: {Object.entries(run.data.rules).map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`).join(", ") || "nothing"}.
          {" "}Webhook: {webhook && "skipped_no_webhook" in webhook ? "not configured" : JSON.stringify(webhook)}.
        </p>
      )}
      {(run.error || act.error) && <p role="alert" className="rounded-[10px] bg-alarm px-4 py-2.5 text-on-alarm">{String(run.error ?? act.error)}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="State" value={state} onChange={setState}
          options={[{ value: "open", label: "Open" }, { value: "acknowledged", label: "Acknowledged" }, { value: "resolved", label: "Resolved" }]} />
        <label className="ml-auto flex items-center gap-2 text-[14px] text-dim">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>
            <option value="">All</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      {alerts.error && <p role="alert" className="text-alarm">{String(alerts.error)}</p>}
      {!alerts.data && !alerts.error && <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {alerts.data && items.length === 0 && (
        <EmptyState icon={<BellOff size={20} />} title={`No ${state} alerts`}>
          {state === "open" ? "Nothing is waiting for a person here. Rules run after each pipeline step, or with “Check rules now”." : "Choose another state to see the rest."}
        </EmptyState>
      )}
      {ORDER.map((sev) => {
        const group = items.filter((a) => a.severity === sev);
        if (group.length === 0) return null;
        return (
          <section key={sev} aria-labelledby={`sev-${sev}`} className="grid gap-3">
            <h2 id={`sev-${sev}`} className="flex items-center gap-2 text-[18px] font-semibold">
              {SEVERITY[sev].heading} <span className="tabular text-[15px] font-normal text-dim">{group.length}</span>
            </h2>
            <ul className="grid gap-3">
              <AnimatePresence initial={false}>
                {group.map((a) => (
                  <AlertRow key={a.id} a={a} busy={act.isPending || !can("act_alerts")}
                    onAct={(action, note) => act.mutate({ id: a.id, action, note })} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AlertRow({ a, busy, onAct }: { a: AlertItem; busy: boolean; onAct: (action: "acknowledge" | "resolve" | "reopen", note?: string) => void }) {
  const reduce = useReducedMotion();
  const [note, setNote] = useState("");
  const firstImage = a.kind === "tiger_sighting" ? a.detail.image_ids?.[0] : undefined;
  const sev = SEVERITY[a.severity];
  return (
    <motion.li layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: DURATION.base } }}
      transition={{ duration: DURATION.base, ease: EASE_BOARD }}>
      {/* Severity is the chip's word; a critical alert also gets a red keyline round the whole plate. */}
      <Plate className={clsx("grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto]", a.severity === "critical" && "ring-2 ring-alarm")}>
        <div className="grid content-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("rounded-[6px] px-2 py-0.5 text-[13px] font-semibold", sev.badge)}>{sev.word}</span>
            <span className="text-[13px] text-dim">{KIND_LABEL[a.kind]}</span>
          </div>
          <p className="text-[17px] font-semibold">{a.title}</p>
          <p className="text-[14px] text-dim">
            {a.occurred_at ? localTime(a.occurred_at, a.timezone) : "time not reliable"}; raised {localTime(a.created_at, a.timezone)}
            {a.webhook && `; webhook ${a.webhook.replace("_", " ")}`}
          </p>
          {a.detail.reasons && (
            <ul className="grid gap-1 text-[14px]">
              {a.detail.reasons.map((r, i) => (
                <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-dim" />{r}</li>
              ))}
            </ul>
          )}
          {a.acted_by && (
            <p className="text-[13px] text-dim">
              {a.state} by {a.acted_by}{a.acted_at ? ` at ${localTime(a.acted_at, a.timezone)}` : ""}{a.note ? `: ${a.note}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:w-72 sm:flex-col sm:items-stretch">
          {firstImage && (
            <a href={api.displayUrl(firstImage)} target="_blank" rel="noreferrer" className="text-[14px] font-medium underline underline-offset-4">
              View frame
            </a>
          )}
          {a.state !== "resolved" && (
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} placeholder="Note (optional)"
              aria-label="Note" className={FIELD} />
          )}
          <div className="flex gap-2">
            {a.state === "open" && (
              <button type="button" disabled={busy} onClick={() => onAct("acknowledge", note)}
                className="h-11 flex-1 rounded-[8px] bg-board md:h-9 px-3 text-[14px] font-semibold text-on-board hover:bg-board-deep disabled:opacity-40">
                Acknowledge
              </button>
            )}
            {a.state !== "resolved" && (
              <button type="button" disabled={busy} onClick={() => onAct("resolve", note)} className={clsx(BUTTON, "flex-1")}>Resolve</button>
            )}
            {a.state !== "open" && (
              <button type="button" disabled={busy} onClick={() => onAct("reopen")} className={clsx(BUTTON, "flex-1")}>Reopen</button>
            )}
          </div>
        </div>
      </Plate>
    </motion.li>
  );
}
