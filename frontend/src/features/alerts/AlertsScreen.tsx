import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { BellOff, Camera, Image, PawPrint, RefreshCw, Siren, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CountBadge, EmptyState, FIELD, PageHeader, Plate, Segmented, Skeleton, useToast } from "../../design/kit";
import { Button } from "../../design/primitives";
import { api, type AlertItem, type AlertState } from "../../lib/api";
import { useSession } from "../../lib/session";
import { localTime } from "../../lib/time";
import { DURATION, EASE_OUT } from "../../motion/tokens";

const KIND: Record<AlertItem["kind"], { label: string; icon: LucideIcon }> = {
  tiger_sighting: { label: "Tiger sighting", icon: PawPrint },
  poaching_risk: { label: "Poaching risk", icon: Siren },
  unusual_activity: { label: "Unusual activity", icon: Image },
  camera_failure: { label: "Camera problem", icon: Camera },
};
const SEVERITY = {
  critical: { word: "Critical", heading: "Critical: act first", heat: "var(--danger)" },
  warning: { word: "Warning", heading: "Warnings", heat: "var(--color-heat-4)" },
  info: { word: "Information", heading: "For information", heat: "var(--mark)" },
} as const;
const ORDER = ["critical", "warning", "info"] as const;

/** Alerts for a person to acknowledge and resolve. */
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
    <div className="grid gap-7">
      <PageHeader title="Alerts"
        badges={state === "open" && items.length > 0 && <CountBadge n={items.length} tone="alarm" label="open alerts" />}
        actions={can("run") && (
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw size={15} aria-hidden className={run.isPending ? "animate-spin" : undefined} />{run.isPending ? "Checking…" : "Check rules now"}
          </Button>
        )}>
        Each alert is a prompt for a person, not a confirmed finding. Acknowledge when you are acting on it, resolve
        when done; a resolved alert can be reopened. Alerts never contain coordinates.
      </PageHeader>
      {run.data && (
        <p role="status" className="text-[13.5px] text-fg-2">
          New or changed: {Object.entries(run.data.rules).map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`).join(", ") || "nothing"}.
          {" "}Webhook: {webhook && "skipped_no_webhook" in webhook ? "not configured" : JSON.stringify(webhook)}.
        </p>
      )}
      {(run.error || act.error) && <p role="alert" className="rounded-[10px] border border-danger/50 bg-danger/10 px-4 py-2.5 text-[14px] text-danger">{String(run.error ?? act.error)}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="State" value={state} onChange={setState}
          options={[{ value: "open", label: "Open" }, { value: "acknowledged", label: "Acknowledged" }, { value: "resolved", label: "Resolved" }]} />
        <label className="ml-auto flex items-center gap-2 text-[13px] text-fg-2">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>
            <option value="">All</option>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      {alerts.error && <p role="alert" className="text-danger">{String(alerts.error)}</p>}
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
            <h2 id={`sev-${sev}`} className="flex items-center gap-2.5 text-[16px] font-semibold">
              <span aria-hidden className="size-2 rounded-full" style={{ background: SEVERITY[sev].heat, boxShadow: sev === "info" ? undefined : `0 0 8px ${SEVERITY[sev].heat}` }} />
              {SEVERITY[sev].heading} <span className="data text-[12px] font-normal text-fg-3">{group.length}</span>
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
  const Icon = KIND[a.kind].icon;
  return (
    <motion.li layout={!reduce} initial={reduce ? false : { opacity: 0.001, y: 10 }} animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: DURATION.base } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}>
      {/* Severity is the chip's word; a critical alert also glows crimson round the whole card. */}
      <Plate className={clsx("grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]",
        a.severity === "critical" && "border-danger/60 shadow-[0_18px_40px_-24px_rgb(255_90_104/0.6)]")}>
        <div className="grid content-start gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-edge bg-surface-2 pr-2.5 pl-2 text-[12px] font-medium">
              <span aria-hidden className="size-2 rounded-full" style={{ background: sev.heat }} />{sev.word}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-2"><Icon size={14} aria-hidden />{KIND[a.kind].label}</span>
          </div>
          <p className="text-[16.5px] font-semibold">{a.title}</p>
          <p className="text-[12.5px] text-fg-3">
            {a.occurred_at ? localTime(a.occurred_at, a.timezone) : "time not reliable"}; raised {localTime(a.created_at, a.timezone)}
            {a.webhook && `; webhook ${a.webhook.replace("_", " ")}`}
          </p>
          {a.detail.reasons && (
            <ul className="grid gap-1 text-[13.5px] text-fg-2">
              {a.detail.reasons.map((r, i) => (
                <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-3" />{r}</li>
              ))}
            </ul>
          )}
          {a.acted_by && (
            <p className="text-[12.5px] text-fg-3">
              {a.state} by {a.acted_by}{a.acted_at ? ` at ${localTime(a.acted_at, a.timezone)}` : ""}{a.note ? `: ${a.note}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:w-72 sm:flex-col sm:items-stretch">
          {firstImage && (
            <a href={api.displayUrl(firstImage)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[13.5px] font-medium underline underline-offset-4 md:min-h-8">
              View frame
            </a>
          )}
          {a.state !== "resolved" && (
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} placeholder="Note (optional)"
              aria-label="Note" className={FIELD} />
          )}
          <div className="flex gap-2">
            {a.state === "open" && (
              <Button tone="decide" disabled={busy} onClick={() => onAct("acknowledge", note)} className="flex-1">Acknowledge</Button>
            )}
            {a.state !== "resolved" && (
              <Button disabled={busy} onClick={() => onAct("resolve", note)} className="flex-1">Resolve</Button>
            )}
            {a.state !== "open" && (
              <Button disabled={busy} onClick={() => onAct("reopen")} className="flex-1">Reopen</Button>
            )}
          </div>
        </div>
      </Plate>
    </motion.li>
  );
}
