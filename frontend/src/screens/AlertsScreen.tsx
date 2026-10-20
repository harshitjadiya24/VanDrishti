import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { api, type AlertItem, type AlertState } from "../api";
import { localTime } from "../components/FrameView";
import { useSession } from "../context";

const KIND_LABEL: Record<AlertItem["kind"], string> = {
  tiger_sighting: "Tiger sighting",
  poaching_risk: "Poaching risk",
  unusual_activity: "Unusual activity",
  camera_failure: "Camera problem",
};
const SEVERITY_TONE: Record<AlertItem["severity"], string> = {
  critical: "border-alarm bg-alarm/15 text-alarm",
  warning: "border-amber text-amber",
  info: "border-line text-dim",
};

/** Section 11: alerts for a person to acknowledge and resolve. */
export function AlertsScreen() {
  const { reserve, reviewer } = useSession();
  const qc = useQueryClient();
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
      api.actAlert(id, action, reviewer, note),
    onSuccess: refresh,
  });
  const webhook = run.data?.webhook;
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[24px] font-semibold">Alerts</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-dim">
            Each alert is a prompt for a person, not a confirmed finding. Acknowledge when you are acting on it,
            resolve when done; a resolved alert can be reopened. Alerts never contain coordinates.
          </p>
        </div>
        <button type="button" onClick={() => run.mutate()} disabled={run.isPending}
          className="h-9 rounded-md border border-line px-3 text-[14px] hover:bg-raised disabled:opacity-50">
          {run.isPending ? "Checking…" : "Check rules now"}
        </button>
      </header>
      {!reviewer && <p role="alert" className="text-amber">Enter your name in the sidebar first: actions are signed with it.</p>}
      {run.data && (
        <p role="status" className="text-[13px] text-dim">
          New or changed: {Object.entries(run.data.rules).map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`).join(", ") || "nothing"}.
          {" "}Webhook: {webhook && "skipped_no_webhook" in webhook ? "not configured" : JSON.stringify(webhook)}.
        </p>
      )}
      {(run.error || act.error) && <p role="alert" className="text-alarm">{String(run.error ?? act.error)}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="State" className="flex gap-1">
          {(["open", "acknowledged", "resolved"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)}
              className={clsx("h-8 rounded-md border px-3 text-[13px] capitalize", state === s ? "border-amber text-ink" : "border-line text-dim")}>
              {s}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-dim">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="h-8 rounded-md border border-line bg-base px-2 text-[13px] text-ink">
            <option value="">All</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      {alerts.data && alerts.data.length === 0 && <p className="text-dim">No {state} alerts.</p>}
      <ul className="grid gap-2">
        {(alerts.data ?? []).map((a) => (
          <AlertRow key={a.id} a={a} busy={act.isPending || !reviewer}
            onAct={(action, note) => act.mutate({ id: a.id, action, note })} />
        ))}
      </ul>
    </div>
  );
}

function AlertRow({ a, busy, onAct }: { a: AlertItem; busy: boolean; onAct: (action: "acknowledge" | "resolve" | "reopen", note?: string) => void }) {
  const [note, setNote] = useState("");
  const firstImage = a.kind === "tiger_sighting" ? a.detail.image_ids?.[0] : undefined;
  return (
    <li className="grid gap-3 rounded-md bg-panel p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid content-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx("rounded-full border px-2 text-[12px]", SEVERITY_TONE[a.severity])}>{a.severity}</span>
          <span className="text-[12px] text-dim">{KIND_LABEL[a.kind]}</span>
          <span className="text-[14px] font-medium">{a.title}</span>
        </div>
        <div className="text-[13px] text-dim">
          {a.occurred_at ? localTime(a.occurred_at, a.timezone) : "time not reliable"}; raised {localTime(a.created_at, a.timezone)}
          {a.webhook && `; webhook ${a.webhook.replace("_", " ")}`}
        </div>
        {a.detail.reasons && (
          <ul className="list-disc pl-5 text-[13px]">
            {a.detail.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {a.acted_by && (
          <div className="text-[12px] text-dim">
            {a.state} by {a.acted_by}{a.acted_at ? ` at ${localTime(a.acted_at, a.timezone)}` : ""}{a.note ? `: ${a.note}` : ""}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:w-72 sm:flex-col sm:items-stretch">
        {firstImage && (
          <a href={api.displayUrl(firstImage)} target="_blank" rel="noreferrer" className="text-[13px] text-amber underline-offset-4 hover:underline">
            View frame
          </a>
        )}
        {a.state !== "resolved" && (
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} placeholder="Note (optional)"
            aria-label="Note" className="h-8 rounded-md border border-line bg-base px-2 text-[13px] text-ink" />
        )}
        <div className="flex gap-2">
          {a.state === "open" && (
            <button type="button" disabled={busy} onClick={() => onAct("acknowledge", note)}
              className="h-8 flex-1 rounded-md border border-line px-3 text-[13px] hover:bg-raised disabled:opacity-40">Acknowledge</button>
          )}
          {a.state !== "resolved" && (
            <button type="button" disabled={busy} onClick={() => onAct("resolve", note)}
              className="h-8 flex-1 rounded-md border border-line px-3 text-[13px] hover:bg-raised disabled:opacity-40">Resolve</button>
          )}
          {a.state !== "open" && (
            <button type="button" disabled={busy} onClick={() => onAct("reopen")}
              className="h-8 flex-1 rounded-md border border-line px-3 text-[13px] hover:bg-raised disabled:opacity-40">Reopen</button>
          )}
        </div>
      </div>
    </li>
  );
}
