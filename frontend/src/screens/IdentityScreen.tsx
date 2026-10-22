import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronDown, Fingerprint, PawPrint, Undo2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type IdentityDecision, type Proposal } from "../api";
import { localTime } from "../components/FrameView";
import { CountNumber, EmptyState, Plate, Skeleton, StageBadge } from "../components/kit";
import { useSession } from "../context";
import { DURATION, EASE_BOARD } from "../motion/tokens";

/** Section 10.5: the model proposes which tiger this is; a person decides. */
export function IdentityScreen() {
  const { reserve, can } = useSession();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
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
    // Undo targets the proposal that was decided, whatever is on screen when the answer lands.
    onSuccess: (_, { p, body }) => {
      setLast({ id: p.id, text: body.action === "same" ? "Sighting added to the tiger" : body.action === "new" ? `New tiger ${body.code} created` : "Marked not a tiger" });
      refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.undoIdentity(id),
    onSuccess: () => { setLast(null); refresh(); },
  });
  const matches = items.filter((p) => p.kind === "possible_match").length;

  // J / K move between proposals; typing in the form never triggers them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
      if (k === "k") setIndex((i) => Math.max(i - 1, 0));
      if (k === "u" && last) undo.mutate(last.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, last, undo]);

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[26px] font-semibold">Tiger identities</h1>
          {items.length > 0 && (
            <>
              <StageBadge stage="review">{matches} possible match{matches === 1 ? "" : "es"}</StageBadge>
              <StageBadge stage="blank">{items.length - matches} possibly new</StageBadge>
            </>
          )}
        </div>
        <p className="max-w-[72ch] text-[15px] text-dim">
          Stripe patterns are compared with tigers people have already named. The model only suggests: a sighting joins a
          tiger, or a new tiger is created, only when you decide. Every decision is recorded and can be undone.
        </p>
      </header>
      {!can("decide_identity") && <p className="text-dim">Your role can see identity checks but not decide them.</p>}
      {proposals.error && <p role="alert" className="text-alarm">{String(proposals.error)}</p>}
      {decide.error && <p role="alert" className="rounded-[10px] bg-alarm px-4 py-2.5 text-white">{String(decide.error)}</p>}
      {last && (
        <Plate role="status" className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[15px]">
          <StageBadge stage="done">Saved</StageBadge>
          <span>{last.text}</span>
          <button type="button" onClick={() => undo.mutate(last.id)} disabled={undo.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1 text-[14px] hover:bg-raised">
            <Undo2 size={15} aria-hidden /> Undo <kbd>U</kbd>
          </button>
        </Plate>
      )}
      {proposals.isLoading && <Skeleton className="h-[460px]" />}
      {proposals.data && items.length === 0 && (
        <EmptyState icon={<Fingerprint size={20} />} title="No identity checks waiting">
          New checks appear after tiger frames are settled and compared: <code className="kbd">vandrishti reid embed</code>, then{" "}
          <code className="kbd">reid match</code>.
        </EmptyState>
      )}
      {current && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-dim">
            <span className="tabular">{Math.min(index, items.length - 1) + 1} of {items.length}</span>
            <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
              className="rounded-[8px] border border-line px-3 py-1 hover:bg-raised disabled:opacity-40">Previous <kbd>K</kbd></button>
            <button type="button" onClick={() => setIndex(Math.min(items.length - 1, index + 1))} disabled={index >= items.length - 1}
              className="rounded-[8px] border border-line px-3 py-1 hover:bg-raised disabled:opacity-40">Next <kbd>J</kbd></button>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={current.id}
              initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: DURATION.board * 0.7, ease: EASE_BOARD }}>
              <ProposalCard p={current} busy={decide.isPending || !can("decide_identity")}
                onDecide={(body) => decide.mutate({ p: current, body })} />
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

function ProposalCard({ p, busy, onDecide }: { p: Proposal; busy: boolean; onDecide: (b: IdentityDecision) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(0);
  const likely = p.kind === "possible_match";
  const candidate = p.candidates[picked];
  return (
    <Plate as="article" rivets className="grid gap-5 p-5" aria-label="Identity check">
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        <StageBadge stage={likely ? "review" : "blank"}>{likely ? "Possible match" : "Possibly a new tiger"}</StageBadge>
        <span className="font-semibold">Camera {p.camera}</span>
        <span className="text-dim">{localTime(p.captured_at, p.timezone)}</span>
        <span className="text-dim">
          {p.best_similarity === null ? "No named tigers to compare with yet"
            : `Best similarity ${p.best_similarity.toFixed(2)}, suggestion line ${p.threshold.toFixed(2)}`}
        </span>
      </div>

      {candidate ? (
        <Compare sighting={p.embedding_id} candidate={candidate.example_embedding_id} code={candidate.code} />
      ) : (
        <figure className="grid gap-1">
          <img src={api.cropUrl(p.embedding_id)} alt="This sighting" className="max-h-96 w-full rounded-[8px] bg-black object-contain" />
          <figcaption className="text-[13px] text-dim">This sighting. Nobody has named a tiger in this reserve yet.</figcaption>
        </figure>
      )}

      {p.candidates.length > 0 && (
        <div className="grid gap-2">
          <p className="text-[14px] font-semibold">Closest named tigers</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {p.candidates.map((c, i) => (
              <li key={c.individual_id}>
                <div className={clsx("flex h-full items-center gap-3 rounded-[10px] border-2 bg-base p-2",
                  i === picked ? "border-ink" : "border-transparent")}>
                  <button type="button" onClick={() => setPicked(i)} aria-pressed={i === picked}
                    className="shrink-0 rounded-[6px]" aria-label={`Compare with ${c.code}`}>
                    <img src={api.cropUrl(c.example_embedding_id)} alt="" loading="lazy" className="h-16 w-24 rounded-[6px] bg-black object-contain" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="board-title text-[22px] text-ink">{c.code}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                        <span className="block h-full rounded-full bg-board" style={{ width: `${Math.max(0, c.similarity) * 100}%` }} />
                      </span>
                      <span className="tabular text-[13px] text-dim">{c.similarity.toFixed(2)}</span>
                    </div>
                    <button type="button" disabled={busy} onClick={() => onDecide({ action: "same", individual_id: c.individual_id })}
                      className={clsx("mt-2 rounded-[8px] px-3 py-1 text-[14px] font-semibold disabled:opacity-40",
                        i === 0 && likely ? "bg-ok text-white hover:brightness-110" : "border border-line hover:bg-raised")}>
                      Same tiger as {c.code}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
        onSubmit={(e) => { e.preventDefault(); if (code.trim()) onDecide({ action: "new", code: code.trim(), name: name.trim() || undefined }); }}>
        <label className="grid gap-1 text-[13px] text-dim">
          New tiger code
          <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 32))} placeholder="e.g. T-12"
            className="h-10 w-32 rounded-[8px] border border-line bg-base px-2.5 text-[15px] text-ink" />
        </label>
        <label className="grid gap-1 text-[13px] text-dim">
          Name (optional)
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 100))}
            className="h-10 w-44 rounded-[8px] border border-line bg-base px-2.5 text-[15px] text-ink" />
        </label>
        <button type="submit" disabled={busy || !code.trim()}
          className="h-10 rounded-[10px] border border-line bg-base px-4 text-[15px] font-semibold hover:bg-raised disabled:opacity-40">
          Create new tiger
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide({ action: "not_tiger" })}
          className="ml-auto h-10 rounded-[10px] px-4 text-[15px] text-dim underline hover:text-ink disabled:opacity-40">
          Not a tiger, or cannot tell
        </button>
      </form>
    </Plate>
  );
}

/** Side by side, plus a slider that sweeps from this sighting to the candidate's closest one. */
function Compare({ sighting, candidate, code }: { sighting: string; candidate: string; code: string }) {
  const [pos, setPos] = useState(50);
  const [mode, setMode] = useState<"side" | "sweep">("side");
  return (
    <div className="grid gap-2">
      <div role="group" aria-label="Comparison view" className="flex gap-1 text-[14px]">
        {(["side", "sweep"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={clsx("rounded-[8px] px-3 py-1", mode === m ? "bg-ink font-semibold text-base" : "border border-line hover:bg-raised")}>
            {m === "side" ? "Side by side" : "Sweep"}
          </button>
        ))}
      </div>
      {mode === "side" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[[sighting, "This sighting"], [candidate, `${code}: closest named sighting`]].map(([id, label]) => (
            <figure key={id} className="grid gap-1">
              <img src={api.cropUrl(id)} alt={label} className="aspect-[4/3] w-full rounded-[8px] bg-black object-contain" />
              <figcaption className="text-[13px] text-dim">{label}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <figure className="grid gap-2">
          <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] bg-black">
            <img src={api.cropUrl(candidate)} alt={`${code}: closest named sighting`} className="absolute inset-0 h-full w-full object-contain" />
            <img src={api.cropUrl(sighting)} alt="This sighting" className="absolute inset-0 h-full w-full object-contain"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
            <span aria-hidden className="absolute inset-y-0 w-0.5 bg-check" style={{ left: `${pos}%` }} />
          </div>
          <label className="flex items-center gap-3 text-[13px] text-dim">
            This sighting
            <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
              aria-label={`Sweep between this sighting and ${code}`} className="flex-1 accent-[var(--color-board)]" />
            {code}
          </label>
        </figure>
      )}
    </div>
  );
}

/** Named tigers: the register. Only sightings a person confirmed. */
export function TigersScreen() {
  const { reserve } = useSession();
  const inds = useQuery({ queryKey: ["individuals", reserve], queryFn: () => api.individuals(reserve || undefined) });
  const similar = useQuery({ queryKey: ["similar", reserve], queryFn: () => api.similarTigers(reserve || undefined) });
  const [open, setOpen] = useState<string | null>(null);
  const reduce = useReducedMotion();
  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <h1 className="text-[26px] font-semibold">Named tigers</h1>
        <p className="max-w-[72ch] text-[15px] text-dim">
          The register of tigers people have named, with only the sightings a person confirmed. First and last seen use
          camera or manifest times, never a file's date.
        </p>
      </header>
      {similar.data && similar.data.length > 0 && (
        <Plate role="status" className="border-2 border-check px-4 py-3 text-[15px]">
          <b>Check these pairs:</b> they look very alike, so one tiger may have been named twice:{" "}
          {similar.data.map((s) => `${s.a} and ${s.b} (${s.similarity.toFixed(2)})`).join("; ")}.
        </Plate>
      )}
      {inds.isLoading && <Skeleton className="h-40" />}
      {inds.data && inds.data.length === 0 && (
        <EmptyState icon={<PawPrint size={20} />} title="No tigers named yet">
          Tigers are named by people from the identity checks.
        </EmptyState>
      )}
      <ul className="grid gap-3">
        {(inds.data ?? []).map((t) => (
          <li key={t.id}>
            <Plate rivets className="overflow-hidden">
              <button type="button" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 text-left hover:bg-raised/60">
                <span className="board-title text-[34px] text-ink">{t.code}</span>
                <span className="grid gap-0.5">
                  {t.name && <span className="text-[16px] font-semibold">{t.name}</span>}
                  <span className="text-[14px] text-dim">
                    <CountNumber value={t.sightings} /> sighting{t.sightings === 1 ? "" : "s"} at {t.cameras} camera{t.cameras === 1 ? "" : "s"}
                    {" · "}{t.first_seen ? `first ${t.first_seen.slice(0, 10)}, last ${t.last_seen?.slice(0, 10)}` : "no reliable dates"}
                  </span>
                  <span className="text-[13px] text-dim">named by {t.created_by}</span>
                </span>
                <ChevronDown size={20} aria-hidden className={clsx("text-dim transition-transform duration-[var(--duration-base)]", open === t.id && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {open === t.id && (
                  <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: DURATION.board * 0.7, ease: EASE_BOARD }}>
                    <Sightings id={t.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Plate>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A tiger's sightings as a timeline of crops, newest first. */
function Sightings({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["sightings", id], queryFn: () => api.sightings(id) });
  return (
    <ol className="flex gap-3 overflow-x-auto border-t border-line px-5 py-4">
      {(q.data ?? []).map((s) => (
        <li key={s.embedding_id} className="w-40 shrink-0">
          <img src={api.cropUrl(s.embedding_id)} alt={`Sighting at camera ${s.camera}`} loading="lazy"
            className="aspect-[4/3] w-full rounded-[8px] bg-black object-contain" />
          <p className="mt-1 text-[13px]"><b className="font-semibold">{s.camera}</b></p>
          <p className="text-[12px] text-dim">{s.captured_at ? s.captured_at.slice(0, 10) : "date not reliable"}{s.assigned_by ? ` · by ${s.assigned_by}` : ""}</p>
        </li>
      ))}
      {q.isLoading && <Skeleton className="h-28 w-40" />}
    </ol>
  );
}
