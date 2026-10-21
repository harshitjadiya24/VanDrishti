import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { api, type IdentityDecision, type Proposal } from "../api";
import { localTime } from "../components/FrameView";
import { useSession } from "../context";

/** Section 10.5: the model proposes which tiger this is; a person decides. */
export function IdentityScreen() {
  const { reserve, can } = useSession();
  const qc = useQueryClient();
  const proposals = useQuery({ queryKey: ["proposals", reserve], queryFn: () => api.proposals(reserve || undefined) });
  const [index, setIndex] = useState(0);
  const [last, setLast] = useState<{ id: string; text: string } | null>(null);
  const items = proposals.data ?? [];
  const current = items[Math.min(index, Math.max(items.length - 1, 0))];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["proposals"] });
    qc.invalidateQueries({ queryKey: ["individuals"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const decide = useMutation({
    mutationFn: ({ p, body }: { p: Proposal; body: IdentityDecision }) => api.decideIdentity(p.id, body),
    onSuccess: (_, { body }) => {
      setLast({ id: current.id, text: body.action === "same" ? "Sighting added" : body.action === "new" ? `New tiger ${body.code} created` : "Marked not a tiger" });
      refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.undoIdentity(id),
    onSuccess: () => { setLast(null); refresh(); },
  });
  const matches = items.filter((p) => p.kind === "possible_match").length;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-[24px] font-semibold">Tiger identities</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-dim">
          Stripe patterns are compared with tigers people have already named. The model only suggests: a sighting
          joins a tiger, or a new tiger is created, only when you decide. Every decision is in the audit trail and can be undone.
        </p>
      </header>
      {!can("decide_identity") && <p className="text-dim">Your role can see identity checks but not decide them.</p>}
      {proposals.error && <p role="alert" className="text-alarm">{String(proposals.error)}</p>}
      {decide.error && <p role="alert" className="text-alarm">{String(decide.error)}</p>}
      {last && (
        <p role="status" className="flex flex-wrap items-center gap-3 text-[14px]">
          {last.text}.
          <button type="button" onClick={() => undo.mutate(last.id)} disabled={undo.isPending}
            className="h-8 rounded-md border border-line px-3 text-[13px] hover:bg-raised">Undo</button>
        </p>
      )}
      {proposals.data && items.length === 0 && (
        <p className="text-dim">No identity checks waiting. Run <code className="kbd">vandrishti reid embed</code> then <code className="kbd">reid match</code> after new tiger frames are settled.</p>
      )}
      {current && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-dim">
            <span>{items.length} waiting: {matches} possible matches, {items.length - matches} possibly new tigers.</span>
            <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
              className="h-8 rounded-md border border-line px-3 hover:bg-raised disabled:opacity-40">Previous</button>
            <button type="button" onClick={() => setIndex(Math.min(items.length - 1, index + 1))} disabled={index >= items.length - 1}
              className="h-8 rounded-md border border-line px-3 hover:bg-raised disabled:opacity-40">Next</button>
          </div>
          <ProposalCard key={current.id} p={current} busy={decide.isPending || !can("decide_identity")}
            onDecide={(body) => decide.mutate({ p: current, body })} />
        </>
      )}
    </div>
  );
}

function ProposalCard({ p, busy, onDecide }: { p: Proposal; busy: boolean; onDecide: (b: IdentityDecision) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const likely = p.kind === "possible_match";
  return (
    <article className="grid gap-4 rounded-md bg-panel p-4" aria-label="Identity check">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className={clsx("rounded-full border px-2 text-[12px]", likely ? "border-amber text-amber" : "border-line text-dim")}>
          {likely ? "Possible match" : "Possibly a new tiger"}
        </span>
        <span>Camera {p.camera}</span>
        <span className="text-dim">{localTime(p.captured_at, p.timezone)}</span>
        <span className="text-dim">
          {p.best_similarity === null ? "no named tigers to compare with yet" : `best similarity ${p.best_similarity.toFixed(2)} (suggestion line ${p.threshold.toFixed(2)})`}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <figure className="grid gap-1">
          <img src={api.cropUrl(p.embedding_id)} alt="This sighting" className="max-h-80 w-full rounded bg-black object-contain" />
          <figcaption className="text-[12px] text-dim">This sighting. <a href={api.displayUrl(p.image_id)} target="_blank" rel="noreferrer" className="text-amber">Whole frame</a></figcaption>
        </figure>
        <div className="grid content-start gap-2">
          {p.candidates.length === 0 && <p className="text-[14px] text-dim">Nobody has named a tiger in this reserve yet.</p>}
          {p.candidates.map((c, i) => (
            <div key={c.individual_id} className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 rounded bg-base p-2">
              <img src={api.cropUrl(c.example_embedding_id)} alt={`Closest sighting of ${c.code}`} loading="lazy" className="h-20 w-full rounded bg-black object-contain" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.code}</span>
                <span className="text-[13px] tabular-nums text-dim">similarity {c.similarity.toFixed(2)}</span>
                <button type="button" disabled={busy} onClick={() => onDecide({ action: "same", individual_id: c.individual_id })}
                  className={clsx("ml-auto h-8 rounded-md border px-3 text-[13px] disabled:opacity-40",
                    i === 0 && likely ? "border-amber text-ink hover:bg-amber/15" : "border-line hover:bg-raised")}>
                  Same tiger as {c.code}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <form className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
        onSubmit={(e) => { e.preventDefault(); if (code.trim()) onDecide({ action: "new", code: code.trim(), name: name.trim() || undefined }); }}>
        <label className="grid gap-1 text-[12px] text-dim">
          New tiger code
          <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 32))} placeholder="e.g. T-12"
            className="h-9 w-32 rounded-md border border-line bg-base px-2 text-[14px] text-ink" />
        </label>
        <label className="grid gap-1 text-[12px] text-dim">
          Name (optional)
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 100))}
            className="h-9 w-40 rounded-md border border-line bg-base px-2 text-[14px] text-ink" />
        </label>
        <button type="submit" disabled={busy || !code.trim()} className="h-9 rounded-md border border-line px-3 text-[14px] hover:bg-raised disabled:opacity-40">
          Create new tiger
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide({ action: "not_tiger" })}
          className="ml-auto h-9 rounded-md border border-line px-3 text-[14px] text-dim hover:bg-raised disabled:opacity-40">
          Not a tiger / cannot tell
        </button>
      </form>
    </article>
  );
}

/** Named tigers and pairs that look alike (maybe one tiger named twice). */
export function TigersScreen() {
  const { reserve } = useSession();
  const inds = useQuery({ queryKey: ["individuals", reserve], queryFn: () => api.individuals(reserve || undefined) });
  const similar = useQuery({ queryKey: ["similar", reserve], queryFn: () => api.similarTigers(reserve || undefined) });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-[24px] font-semibold">Named tigers</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-dim">Only sightings a person confirmed. First and last seen use camera or manifest times only.</p>
      </header>
      {similar.data && similar.data.length > 0 && (
        <p role="status" className="rounded-md border border-amber/50 p-3 text-[14px]">
          These named tigers look very alike; check whether one tiger was named twice:{" "}
          {similar.data.map((s) => `${s.a} and ${s.b} (${s.similarity.toFixed(2)})`).join("; ")}.
        </p>
      )}
      {inds.data && inds.data.length === 0 && <p className="text-dim">No tigers named yet. Name them from the identity checks.</p>}
      <ul className="grid gap-2">
        {(inds.data ?? []).map((t) => (
          <li key={t.id} className="rounded-md bg-panel">
            <button type="button" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}
              className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-raised">
              <span className="font-medium">{t.code}</span>
              {t.name && <span>{t.name}</span>}
              <span className="text-[13px] text-dim">{t.sightings} sighting{t.sightings === 1 ? "" : "s"} at {t.cameras} camera{t.cameras === 1 ? "" : "s"}</span>
              <span className="text-[13px] text-dim">
                {t.first_seen ? `first ${t.first_seen.slice(0, 10)}, last ${t.last_seen?.slice(0, 10)}` : "no reliable dates"}
              </span>
              <span className="ml-auto text-[12px] text-dim">named by {t.created_by}</span>
            </button>
            {open === t.id && <Sightings id={t.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sightings({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["sightings", id], queryFn: () => api.sightings(id) });
  return (
    <div className="flex flex-wrap gap-2 border-t border-line p-3">
      {(q.data ?? []).map((s) => (
        <figure key={s.embedding_id} className="grid w-36 gap-1">
          <img src={api.cropUrl(s.embedding_id)} alt={`Sighting at camera ${s.camera}`} loading="lazy" className="h-24 w-full rounded bg-black object-contain" />
          <figcaption className="text-[11px] text-dim">{s.camera}{s.assigned_by ? `, by ${s.assigned_by}` : ""}</figcaption>
        </figure>
      ))}
    </div>
  );
}
