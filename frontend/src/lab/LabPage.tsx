// Development-only look-test for the redesign (R0): the story's first viewport and the
// console's Review desk, both in the new system. Synthetic data throughout. Not routed in
// production builds.

import clsx from "clsx";
import {
  Activity, Bell, Command, FileText, Fingerprint, Flag, LayoutGrid, Moon, PawPrint, Search, ShieldAlert,
  SkipForward, Sun, Undo2, Workflow, X, Check, PenLine,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { BOX, DetectorBox, FRAME, IRScene } from "../design/IRFrame";
import { Button, heatFor, Kbd, StageBadge, type Stage } from "../design/primitives";
import { TrapStrip } from "../design/TrapStrip";
import { Hero } from "../story/chapters/Hero";

type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean; strokeWidth?: number }>;

const QUEUES: { label: string; n: number; stage: Stage; icon: Icon }[] = [
  { label: "People & vehicles", n: 66, stage: "people", icon: ShieldAlert },
  { label: "Needs a person", n: 27, stage: "review", icon: PawPrint },
  { label: "Uncertain", n: 12, stage: "uncertain", icon: Activity },
  { label: "Likely blank", n: 7, stage: "blank", icon: LayoutGrid },
];

const STRIP = [
  { cam: "S-07", t: "22:41", c: 0.71, stage: "review" as Stage },
  { cam: "S-07", t: "22:43", c: 0.66, stage: "review" as Stage },
  { cam: "N-02", t: "23:10", c: 0.83, stage: "review" as Stage },
  { cam: "N-02", t: "23:58", c: 0.62, stage: "review" as Stage },
  { cam: "E-11", t: "01:22", c: 0.78, stage: "review" as Stage },
  { cam: "E-11", t: "02:05", c: 0.88, stage: "review" as Stage },
  { cam: "W-04", t: "04:47", c: 0.61, stage: "review" as Stage },
  { cam: "W-04", t: "05:12", c: 0.74, stage: "review" as Stage },
];

const FACTORS = [
  { name: "SpeciesNet score", value: "0.71", note: "leopard, next: tiger 0.18" },
  { name: "On this reserve's species list", value: "× 1.00", note: "leopard is listed" },
  { name: "Active at 22:41 (night)", value: "× 1.00", note: "nocturnal" },
  { name: "Clear detection (0.94)", value: "× 1.00", note: "box well inside the frame" },
];

function useTheme(): ["dark" | "light", (t: "dark" | "light") => void] {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }, [theme]);
  return [theme, setTheme];
}

function MiniFrame({ id, active }: { id: string; active?: boolean }) {
  return (
    <svg viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} className={clsx("block w-full transition-[filter] duration-[var(--duration-base)]", !active && "brightness-[0.82]")} aria-hidden>
      <IRScene id={id} eyeshine={false} />
      <rect {...BOX} fill="none" stroke="var(--color-heat-4)" strokeWidth="5" />
    </svg>
  );
}

function Rail() {
  const nav: { label: string; icon: Icon; n?: number; stage?: Stage }[] = [
    { label: "Overview", icon: LayoutGrid },
    { label: "Alerts", icon: Bell, n: 2, stage: "people" },
    { label: "Identity", icon: Fingerprint, n: 4, stage: "review" },
    { label: "Pipeline", icon: Workflow },
    { label: "Reports", icon: FileText },
  ];
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-edge bg-surface lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <span className="wide wide-max text-[17px]">VanDrishti</span>
        <span lang="hi" className="hindi text-[13px] text-fg-3">वनदृष्टि</span>
      </div>
      <nav aria-label="Console" className="flex flex-col gap-6 px-3 pt-3 text-[13.5px]">
        <div>
          <p className="px-2 pb-1.5 text-[12px] font-medium text-fg-3">Review queues</p>
          {QUEUES.map((q, i) => (
            <a key={q.label} href="#review" aria-current={i === 1 ? "page" : undefined}
              className={clsx("group flex h-9 items-center gap-2.5 rounded-[7px] px-2 text-fg-2 hover:bg-surface-2 hover:text-fg",
                i === 1 && "bg-surface-2 text-fg")}>
              <q.icon size={16} aria-hidden strokeWidth={1.8} />
              <span className="flex-1">{q.label}</span>
              <span className="data inline-flex items-center gap-1.5 text-[11px] text-fg">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: heatOf(q.stage), boxShadow: `0 0 6px ${heatOf(q.stage)}` }} />
                {q.n}
              </span>
            </a>
          ))}
        </div>
        <div>
          <p className="px-2 pb-1.5 text-[12px] font-medium text-fg-3">Reserve</p>
          {nav.map((n) => (
            <a key={n.label} href="#review" className="flex h-9 items-center gap-2.5 rounded-[7px] px-2 text-fg-2 hover:bg-surface-2 hover:text-fg">
              <n.icon size={16} aria-hidden strokeWidth={1.8} />
              <span className="flex-1">{n.label}</span>
              {n.n !== undefined && n.stage && <span className="data text-[11px]" style={{ color: n.stage === "people" ? "var(--danger)" : "var(--decide-fg)" }}>{n.n}</span>}
            </a>
          ))}
        </div>
      </nav>
      <div className="mt-auto border-t border-edge p-4 text-[12.5px]">
        <p className="text-fg">demo.reviewer</p>
        <p className="text-fg-3">Reviewer · LILA-TEST (synthetic)</p>
      </div>
    </aside>
  );
}

const heatOf = (s: Stage) => ({ people: "var(--danger)", review: "var(--color-heat-4)", uncertain: "var(--color-heat-5)", blank: "var(--mark)", auto: "var(--settled)", done: "var(--settled)", quality: "var(--color-heat-3)" })[s];

function ReviewDesk({ theme, setTheme }: { theme: "dark" | "light"; setTheme: (t: "dark" | "light") => void }) {
  const [active, setActive] = useState(0);
  return (
    <div id="review" className="flex min-h-dvh bg-canvas font-[family-name:var(--font-ui)] text-fg">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-edge bg-canvas/80 px-4 backdrop-blur-xl md:px-6">
          <h2 className="text-[14px] font-medium">Review <span className="text-fg-3">/</span> Needs a person</h2>
          <button type="button" className="ml-auto flex h-11 w-full max-w-[340px] items-center gap-2 rounded-[var(--radius-ctl)] border border-edge bg-surface px-3 text-[13px] text-fg-3 hover:border-edge-strong md:h-9">
            <Search size={15} aria-hidden /> Jump to a screen, queue or camera
            <span className="ml-auto flex gap-1"><Kbd><Command size={10} aria-hidden /></Kbd><Kbd>K</Kbd></span>
          </button>
          <Button tone="ghost" size="sm" aria-label={theme === "dark" ? "Switch to Flash (daylight)" : "Switch to Night"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </Button>
        </header>

        {/* Filmstrip queue */}
        <div className="border-b border-edge bg-surface px-4 py-3 md:px-6">
          <div className="flex items-baseline justify-between">
            <p className="text-[12.5px] text-fg-2"><span className="data text-fg">27</span> frames need a person · confidence 0.6 to 0.9</p>
            <p className="text-[12px] text-fg-3"><Kbd>J</Kbd> <Kbd>K</Kbd> to move</p>
          </div>
          <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {STRIP.map((f, i) => (
              <li key={i} className="shrink-0">
                <button type="button" onClick={() => setActive(i)} aria-current={i === active}
                  className={clsx("block w-[132px] overflow-hidden rounded-[8px] border text-left transition-[border-color,transform] duration-[var(--duration-fast)]",
                    i === active ? "border-heat-4 -translate-y-0.5 shadow-[0_8px_20px_-10px_rgb(247_147_30/0.6)]" : "border-edge hover:border-edge-strong")}>
                  <MiniFrame id={`mini-${i}`} active={i === active} />
                  <span className="data flex justify-between bg-black/85 px-1.5 py-1 text-[9.5px] text-ir">
                    <span>{f.cam} {f.t}</span><span style={{ color: heatFor(f.c) }}>{f.c.toFixed(2)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* Stage + decision */}
        <div className="grid flex-1 items-start gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <figure className="overflow-hidden rounded-[var(--radius-card)] border border-edge bg-black">
            <svg viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} className="block w-full" role="img" aria-label="Synthetic infrared frame with the detector's box around a striped body">
              <IRScene id="stage" />
              <DetectorBox label="animal 0.94" />
            </svg>
            <TrapStrip camera="CAM S-07" time={`24.10.2026 ${STRIP[active].t}:07 IST`} extra="MDv6-c 0.94 · SpeciesNet 4.0.3a · synthetic" />
          </figure>

          <section aria-labelledby="verdict" className="flex flex-col gap-4">
            <div className="rounded-[var(--radius-card)] border border-edge bg-surface p-5">
              <StageBadge stage="review" />
              <h3 id="verdict" className="wide mt-4 text-[34px]">Leopard?</h3>
              <p className="mt-1 text-[14px] text-fg-2">
                <span className="data text-decide-fg">0.71</span> · the species model leans leopard, with tiger next at <span className="data">0.18</span>.
                Between 0.6 and 0.9, so a person checks.
              </p>
              <ul className="mt-5 divide-y divide-edge border-y border-edge">
                {FACTORS.map((f) => (
                  <li key={f.name} className="flex items-baseline gap-3 py-2.5 text-[13px]">
                    <span className="flex-1"><span className="text-fg">{f.name}</span><span className="block text-[12px] text-fg-3">{f.note}</span></span>
                    <span className="data text-[12px] text-fg">{f.value}</span>
                  </li>
                ))}
              </ul>
              <p className="data mt-4 text-[10.5px] leading-relaxed text-fg-3">decision-engine v1 · config 9f2c41a0 · 22:41:09 IST</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button tone="decide" className="justify-between"><span className="flex items-center gap-2"><Check size={16} aria-hidden />Accept leopard</span><Kbd className="border-black/25 bg-black/10 text-[#160a02]">Y</Kbd></Button>
              <Button tone="quiet" className="justify-between"><span className="flex items-center gap-2"><PenLine size={16} aria-hidden />Correct</span><Kbd>C</Kbd></Button>
              <Button tone="quiet" className="justify-between"><span className="flex items-center gap-2"><X size={16} aria-hidden />Not an animal</span><Kbd>N</Kbd></Button>
              <Button tone="quiet" className="justify-between"><span className="flex items-center gap-2"><Flag size={16} aria-hidden />Flag</span><Kbd>F</Kbd></Button>
              <Button tone="ghost" className="justify-between"><span className="flex items-center gap-2"><SkipForward size={16} aria-hidden />Skip</span><Kbd>S</Kbd></Button>
              <Button tone="ghost" className="justify-between"><span className="flex items-center gap-2"><Undo2 size={16} aria-hidden />Undo</span><Kbd>U</Kbd></Button>
            </div>
            <p className="text-[12px] text-fg-3">Synthetic example. Every decision is added to the audit trail; undo is a new entry.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function LabPage() {
  const [theme, setTheme] = useTheme();
  return (
    <main className="font-[family-name:var(--font-ui)]">
      <Hero onSeeHow={() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth" })} />
      <ReviewDesk theme={theme} setTheme={setTheme} />
    </main>
  );
}
