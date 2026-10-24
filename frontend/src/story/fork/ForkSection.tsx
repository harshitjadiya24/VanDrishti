import { useEffect, useRef, useState } from "react";
import { NEEDS_A_PERSON, ROUTING, SAMPLE } from "../results";
import { Plate, StageTitle } from "../parts";
import { ScrollTrigger, prefersReducedMotion } from "../scroll";
import type { ForkScene, LaneSpec } from "./ForkScene";
import { hasWebGL } from "./webgl";

const COLOR: Record<string, string> = {
  auto: "#4cc38a",
  blank: "#8b90a8",
  review: "#f28c28",
  uncertain: "#ffb45e",
  people: "#ff6b6e",
};
// Left-to-right lane order in the scene: free-flowing lanes first, then the check-post lanes.
const ORDER = ["auto", "blank", "review", "uncertain", "people"] as const;
const LANES = ORDER.map((id) => ROUTING.find((r) => r.id === id)!);

/** Section 7: the check-post. Frames that need a person wait until a person lifts the boom. */
export function ForkSection() {
  const wrap = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const scene = useRef<ForkScene | null>(null);
  const [mode, setMode] = useState<"3d" | "static">(() => (hasWebGL() ? "3d" : "static"));
  const [passed, setPassed] = useState(0);
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const box = wrap.current;
    const sec = section.current;
    if (!box || !sec || mode !== "3d") return;
    // Each mount gets its own canvas (and so its own WebGL context); cleanup removes it.
    const el = document.createElement("canvas");
    el.className = "block h-full w-full";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Frames travel down a forest road and split into five lanes; three lanes stop at a check-post boom.");
    box.prepend(el);
    const reduce = prefersReducedMotion();
    const specs: LaneSpec[] = LANES.map((l) => ({
      id: l.id, weight: l.frames, color: COLOR[l.id], needsPerson: ["review", "uncertain", "people"].includes(l.id),
    }));
    // three.js (its own chunk) loads only when this section comes within about a screen.
    let s: ForkScene | null = null;
    let st: ScrollTrigger | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    let onVisibility = () => {};
    const load = () => void import("./ForkScene").then(({ ForkScene: Scene }) => {
      if (cancelled) return;
      let fork: ForkScene;
      try {
        fork = new Scene(el, specs);
      } catch {
        setMode("static"); // the WebGL context failed after all: show the diagram
        return;
      }
      s = fork;
      scene.current = fork;
      fork.onPassed = (n) => setPassed(n);
      const size = () => fork.resize(box.clientWidth, box.clientHeight);
      size();
      ro = new ResizeObserver(size);
      ro.observe(box);
      const run = (active: boolean) => {
        if (reduce) { fork.renderStill(); return; }
        if (active && !document.hidden) fork.start(); else fork.stop();
      };
      onVisibility = () => run(!document.hidden && Boolean(st?.isActive));
      document.addEventListener("visibilitychange", onVisibility);
      st = ScrollTrigger.create({
        trigger: sec, start: "top bottom", end: "bottom top", scrub: !reduce,
        onUpdate: (self) => fork.setProgress(self.progress),
        onToggle: (self) => run(self.isActive),
      });
      run(st.isActive);
    });

    const near = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { near.disconnect(); load(); }
    }, { rootMargin: "100% 0px" });
    near.observe(box);

    return () => {
      cancelled = true;
      near.disconnect();
      st?.kill();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      s?.dispose();
      el.remove();
      scene.current = null;
    };
  }, [mode]);

  const review = () => {
    scene.current?.review();
    setLifted(true);
    window.setTimeout(() => setLifted(false), 2600);
  };

  // The R key works while this section is on screen and focus is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const r = section.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      review();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section id="stage-3" ref={section} aria-labelledby="fork-title" className="px-4 py-20 md:px-10 md:py-28">
      <StageTitle id="fork-title" milestone="3" word="Decide">The check-post</StageTitle>
      <p className="mt-4 max-w-[62ch] text-[18px] text-on-board-dim">
        Every frame takes one of five roads. Confident answers go straight on, and likely-blank frames are set aside.
        Frames in the review band, uncertain frames, and any frame with people or vehicles stop at the check-post,
        and only a person lifts the boom.
      </p>

      <div className="mt-10 overflow-hidden rounded-[14px] bg-board p-3 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7)]">
        <div ref={wrap} className="relative aspect-[4/5] overflow-hidden rounded-[8px] bg-[#080c1a] md:aspect-auto md:h-[min(68vh,620px)] md:min-h-[340px]">
          {mode === "static" && <StaticFork />}
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={review} disabled={mode !== "3d" || lifted}
              className="rounded-[10px] glow-check bg-check px-4 py-2 text-[16px] font-semibold text-on-check transition-transform duration-[var(--duration-quick)] active:translate-y-0.5 disabled:opacity-60">
              {lifted ? "Boom up: frames passing" : "Review (R): lift the boom"}
            </button>
            {passed > 0 && (
              <span role="status" className="rounded-md bg-black/60 px-2 py-1 text-[14px] text-on-board">
                {passed} frame{passed === 1 ? "" : "s"} passed by a person's decision
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LANES.map((l) => (
          <Plate key={l.id} className="!px-4 !py-3">
            <span aria-hidden className="mb-2 block h-1.5 w-10 rounded-full" style={{ background: COLOR[l.id] }} />
            <p className="text-[15px] font-semibold leading-tight">{l.label}</p>
            <p className="tabular mt-1 text-[26px] leading-none font-semibold">{l.frames}</p>
            <p className="mt-1 text-[13px] text-[#585e78]">{l.note}</p>
          </Plate>
        ))}
      </div>
      <p className="mt-4 max-w-[80ch] text-[14px] text-on-board-dim">
        Counts measured on {SAMPLE.frames} test frames: {NEEDS_A_PERSON} of {SAMPLE.frames} needed a person. The sample
        was drawn to include vehicles and empty frames, so these shares are not a reserve's real stream. The moving frames
        above are an illustration in those proportions.
      </p>
    </section>
  );
}

/** Without WebGL: the same five roads as a plain diagram. */
function StaticFork() {
  return (
    <svg viewBox="0 0 600 340" className="h-full w-full" role="img" aria-label="One road splits into five lanes; three stop at a check-post">
      <rect width="600" height="340" fill="#080c1a" />
      <path d="M300 20 L300 120" stroke="#1d2340" strokeWidth="26" />
      {ORDER.map((id, i) => {
        const x = 70 + i * 115;
        return (
          <g key={id}>
            <path d={`M300 120 C300 170 ${x} 170 ${x} 230 L${x} 330`} stroke="#1d2340" strokeWidth="22" fill="none" />
            <path d={`M300 120 C300 170 ${x} 170 ${x} 230 L${x} 330`} stroke={COLOR[id]} strokeWidth="2" fill="none" />
          </g>
        );
      })}
      <line x1="275" y1="251" x2="595" y2="251" stroke="#cc3640" strokeWidth="10" />
      <line x1="275" y1="251" x2="595" y2="251" stroke="#f6f3ee" strokeWidth="10" strokeDasharray="20 20" />
    </svg>
  );
}
