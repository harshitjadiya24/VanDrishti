import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useReducedMotion } from "motion/react";
import { useNavigate } from "react-router";
import { api, type Pipeline } from "../../lib/api";
import { CountNumber, EmptyState, Plate, Skeleton } from "../../design/kit";
import { useSession } from "../../lib/session";

type Tone = "neutral" | "ok" | "check" | "alarm" | "blank";

interface Node {
  id: string;
  x: number; // centre, in the 1200 x 600 diagram
  y: number;
  label: string;
  value: number;
  note?: string;
  tone: Tone;
  to?: string; // where a click goes
  perm?: string;
}
interface Edge { from: string; to: string; n: number; tone: Tone }

const W = 1200;
const H = 600;
const NODE_W = 150;
const STROKE: Record<Tone, string> = {
  neutral: "var(--color-board-line)",
  ok: "var(--ok)",
  check: "var(--color-check)",
  alarm: "var(--alarm)",
  blank: "var(--line)",
};

/** Lay the road out from the counts. Every number is an exact count from the database. */
function layout(p: Pipeline): { nodes: Node[]; edges: Edge[] } {
  const r = p.routes;
  const waiting = r.auto_accept.waiting + r.review.waiting + r.uncertain.waiting + r.people_vehicles.waiting
    + r.likely_blank.waiting + r.quality.waiting;
  const nodes: Node[] = [
    { id: "ingest", x: 85, y: 300, label: "Frames stored", value: p.ingest.images, note: p.ingest.corrupt ? `${p.ingest.corrupt} corrupt` : "originals locked", tone: "neutral" },
    { id: "quality", x: 265, y: 300, label: "Quality gate", value: p.quality.pass, note: p.quality.fail ? `${p.quality.fail} failed` : "all usable", tone: p.quality.fail ? "check" : "neutral", to: "/app/review/quality", perm: "review_species" },
    { id: "animal", x: 455, y: 150, label: "Animal found", value: p.detect.animal, tone: "neutral" },
    { id: "people", x: 455, y: 330, label: "People or vehicles", value: p.detect.people_vehicles, note: "blurred", tone: "alarm" },
    { id: "blank", x: 455, y: 500, label: "Likely blank", value: p.detect.blank, tone: "blank" },
    { id: "decided", x: 645, y: 150, label: "Species decided", value: p.decided, note: "with reasons", tone: "neutral" },
    { id: "auto", x: 835, y: 55, label: "Auto-accepted", value: r.auto_accept.total, note: `${r.auto_accept.waiting} spot checks`, tone: "ok", to: "/app/routing" },
    { id: "review", x: 835, y: 160, label: "Review band", value: r.review.total, note: "0.6–0.9", tone: "check", to: "/app/review/review", perm: "review_species" },
    { id: "uncertain", x: 835, y: 265, label: "Uncertain", value: r.uncertain.total, note: "below 0.6", tone: "check", to: "/app/review/uncertain", perm: "review_species" },
    { id: "pv", x: 835, y: 370, label: "People & vehicles", value: r.people_vehicles.total, note: "always a person", tone: "alarm", to: "/app/review/people_vehicles", perm: "review_people" },
    { id: "blankr", x: 835, y: 500, label: "Set aside", value: r.likely_blank.total, note: `${r.likely_blank.waiting} sampled`, tone: "blank", to: "/app/review/blank", perm: "review_species" },
    { id: "person", x: 1080, y: 290, label: "Waiting for a person", value: waiting, note: `${p.reviews_done} decided so far`, tone: "check" },
  ];
  const edges: Edge[] = [
    { from: "ingest", to: "quality", n: p.ingest.images - p.ingest.corrupt, tone: "neutral" },
    { from: "quality", to: "animal", n: p.detect.animal, tone: "neutral" },
    { from: "quality", to: "people", n: p.detect.people_vehicles, tone: "alarm" },
    { from: "quality", to: "blank", n: p.detect.blank, tone: "blank" },
    { from: "animal", to: "decided", n: p.decided, tone: "neutral" },
    { from: "decided", to: "auto", n: r.auto_accept.total, tone: "ok" },
    { from: "decided", to: "review", n: r.review.total, tone: "check" },
    { from: "decided", to: "uncertain", n: r.uncertain.total, tone: "check" },
    { from: "people", to: "pv", n: r.people_vehicles.total, tone: "alarm" },
    { from: "blank", to: "blankr", n: r.likely_blank.total, tone: "blank" },
    { from: "auto", to: "person", n: r.auto_accept.waiting, tone: "check" },
    { from: "review", to: "person", n: r.review.waiting, tone: "check" },
    { from: "uncertain", to: "person", n: r.uncertain.waiting, tone: "check" },
    { from: "pv", to: "person", n: r.people_vehicles.waiting, tone: "alarm" },
    { from: "blankr", to: "person", n: r.likely_blank.waiting, tone: "check" },
  ];
  return { nodes, edges: edges.filter((e) => e.n > 0) };
}

/** Section 7 as a living diagram: what the models did, and what now waits for a person. */
export function PipelineScreen() {
  const { reserve } = useSession();
  const q = useQuery({
    queryKey: ["pipeline", reserve],
    queryFn: () => api.pipeline(reserve || undefined),
    refetchInterval: 30_000,
  });
  const p = q.data;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-[26px] font-semibold">The road, live</h1>
        <p className="mt-1 max-w-[70ch] text-[15px] text-dim">
          Every frame's path from the camera to a person, as exact counts. Road widths follow the counts; the
          moving dots only show direction. Select a stage to open its queue.
        </p>
      </header>
      {q.error && <p role="alert" className="text-alarm">{String(q.error)}</p>}
      {!p && !q.error && <Skeleton className="h-[420px]" />}
      {p && p.ingest.images === 0 && (
        <EmptyState title="No frames in this reserve yet">Upload or ingest camera-trap images, then run detection and routing.</EmptyState>
      )}
      {p && p.ingest.images > 0 && (
        <>
          <RoadDiagram p={p} />
          <RoadList p={p} />
          <Outcomes p={p} />
        </>
      )}
    </div>
  );
}

function edgePath(a: Node, b: Node): string {
  const x1 = a.x + NODE_W / 2;
  const x2 = b.x - NODE_W / 2;
  const mid = (x1 + x2) / 2;
  return `M${x1},${a.y} C${mid},${a.y} ${mid},${b.y} ${x2},${b.y}`;
}

/** Desktop: the road as a flow diagram. Plates are HTML (accessible, clickable) over an SVG road. */
function RoadDiagram({ p }: { p: Pipeline }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { can } = useSession();
  const { nodes, edges } = layout(p);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const max = Math.max(...edges.map((e) => e.n), 1);
  const width = (n: number) => 3 + 30 * Math.sqrt(n / max);
  return (
    <Plate className="hidden overflow-hidden p-3 lg:block">
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {edges.map((e) => {
            const d = edgePath(byId[e.from], byId[e.to]);
            const dots = Math.min(5, Math.max(1, Math.round((e.n / max) * 5)));
            return (
              <g key={`${e.from}-${e.to}`}>
                <path d={d} fill="none" stroke={STROKE[e.tone]} strokeOpacity={0.35} strokeWidth={width(e.n)} strokeLinecap="round" />
                <path d={d} fill="none" stroke={STROKE[e.tone]} strokeWidth={1.5} strokeDasharray="6 8" />
                {!reduce && Array.from({ length: dots }, (_, i) => (
                  <circle key={i} r={3.5} fill={STROKE[e.tone]}>
                    <animateMotion dur={`${3.2 + (e.n % 5) * 0.2}s`} begin={`${(i * 3.2) / dots}s`} repeatCount="indefinite" path={d} />
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => {
          const clickable = Boolean(n.to && (!n.perm || can(n.perm)));
          const body = (
            <>
              <span className="block text-[13px] leading-tight text-dim">{n.label}</span>
              <CountNumber value={n.value} className="block text-[24px] leading-tight font-semibold" />
              {n.note && <span className="block truncate text-[12px] text-dim">{n.note}</span>}
            </>
          );
          const cls = clsx("absolute -translate-x-1/2 -translate-y-1/2 rounded-[10px] border-2 bg-panel px-3 py-1.5 text-left shadow-[var(--shadow-plate)]",
            n.id === "person" ? "border-check" : n.tone === "alarm" ? "border-alarm" : n.tone === "ok" ? "border-ok" : n.tone === "check" ? "border-check" : "border-line",
            clickable && "transition-transform duration-[var(--duration-base)] ease-[var(--ease-board)] hover:-translate-y-[calc(50%+2px)]");
          const w = n.id === "person" ? NODE_W + 24 : NODE_W;
          const style = { left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%`, width: `${(w / W) * 100}%` };
          return clickable ? (
            <button key={n.id} type="button" className={cls} style={style} onClick={() => navigate(n.to!)}>{body}</button>
          ) : (
            <div key={n.id} className={cls} style={style}>{body}</div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[13px] text-dim">
        Green: accepted without a person. Orange: a person decides. Red: people or vehicles, always a person. Grey: set
        aside as likely blank, with a random sample checked.
      </p>
    </Plate>
  );
}

/** Phones and narrow windows: the same road, top to bottom. */
function RoadList({ p }: { p: Pipeline }) {
  const { nodes } = layout(p);
  const navigate = useNavigate();
  const { can } = useSession();
  const order = ["ingest", "quality", "animal", "people", "blank", "decided", "auto", "review", "uncertain", "pv", "blankr", "person"];
  const tone: Record<Tone, string> = {
    neutral: "bg-board-line", ok: "bg-ok", check: "bg-check", alarm: "bg-alarm", blank: "bg-line",
  };
  return (
    <ol className="grid gap-2 lg:hidden">
      {order.map((id) => {
        const n = nodes.find((x) => x.id === id)!;
        const clickable = Boolean(n.to && (!n.perm || can(n.perm)));
        return (
          <li key={id}>
            <Plate className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[14px] text-dim">
                  <span aria-hidden className={clsx("size-2.5 shrink-0 rounded-full", tone[n.tone])} />
                  {n.label}{n.note ? ` · ${n.note}` : ""}
                </span>
                <CountNumber value={n.value} className="text-[22px] font-semibold" />
              </span>
              {clickable && (
                <button type="button" onClick={() => navigate(n.to!)} className="rounded-[8px] border border-line px-3 py-1.5 text-[14px] hover:bg-raised">
                  Open
                </button>
              )}
            </Plate>
          </li>
        );
      })}
    </ol>
  );
}

/** What the road turns into: alerts, risk, identities. */
function Outcomes({ p }: { p: Pipeline }) {
  const open = p.alerts_open.critical + p.alerts_open.warning + p.alerts_open.info;
  return (
    <section aria-labelledby="outcomes-h" className="grid gap-3">
      <h2 id="outcomes-h" className="text-[18px] font-semibold">What it turns into</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Plate className="px-4 py-3">
          <p className="text-[14px] text-dim">Open alerts</p>
          <CountNumber value={open} className="block text-[28px] font-semibold" />
          <p className="text-[13px] text-dim">{p.alerts_open.critical} critical, {p.alerts_open.warning} warning</p>
        </Plate>
        <Plate className="px-4 py-3">
          <p className="text-[14px] text-dim">People/vehicle events</p>
          <CountNumber value={p.risk.high + p.risk.medium + p.risk.low} className="block text-[28px] font-semibold" />
          <p className="text-[13px] text-dim">{p.risk.high} high, {p.risk.medium} medium, {p.risk.low} low risk</p>
        </Plate>
        <Plate className="px-4 py-3">
          <p className="text-[14px] text-dim">Tiger identities waiting</p>
          <CountNumber value={p.identity.proposals_open} className="block text-[28px] font-semibold" />
          <p className="text-[13px] text-dim">{p.identity.named_tigers} named tigers, {p.identity.embedded} stripe records</p>
        </Plate>
      </div>
    </section>
  );
}
