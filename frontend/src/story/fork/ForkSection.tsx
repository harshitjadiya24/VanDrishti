import { useEffect, useRef, useState } from "react";
import { NEEDS_A_PERSON, ROUTING, SAMPLE } from "../results";
import { isPlainKey } from "../../lib/keys";
import { Button, Kbd } from "../../design/primitives";
import { Chapter } from "../ui";
import { ScrollTrigger, prefersReducedMotion } from "../scroll";
import type { ForkScene, LaneSpec } from "./ForkScene";
import { hasWebGL } from "./webgl";

// On the thermal scale: settled lanes run cold, lanes that need a person run hot.
const COLOR: Record<string, string> = {
  auto: "#7cc7e8",
  blank: "#9aa3b5",
  review: "#f7931e",
  uncertain: "#ffc94a",
  people: "#ff5a68",
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
  const [stillMode] = useState(prefersReducedMotion);
  const still = useRef(stillMode);
  const liftTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(liftTimer.current), []);

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
    const fork = scene.current;
    if (!fork) return; // no WebGL scene: there is no boom to lift
    if (still.current) fork.reviewStill(); else fork.review();
    setLifted(true);
    window.clearTimeout(liftTimer.current);
    liftTimer.current = window.setTimeout(() => setLifted(false), 2600);
  };

  // The R key works while this section is on screen and focus is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || !isPlainKey(e)) return;
      const r = section.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      review();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Chapter id="stage-3" stage="3" strip="the check-post" sectionRef={section} title="The check-post"
      lede="Every frame takes one of five roads. Confident answers go straight on, and likely-blank frames are set aside. Frames in the review band, uncertain frames, and any frame with people or vehicles stop at the check-post, and only a person lifts the boom.">
      <div ref={wrap} className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] border border-edge bg-[#0a0b0d] md:aspect-auto md:h-[min(70vh,640px)] md:min-h-[360px]">
        {mode === "static" && <StaticFork />}
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 md:inset-x-5 md:bottom-5">
          <Button tone="decide" size="lg" onClick={review} disabled={mode !== "3d" || lifted}>
            {lifted ? (stillMode ? "Boom up" : "Boom up: frames passing") : <>Review: lift the boom <Kbd className="border-black/25 bg-black/10 text-[#160a02]">R</Kbd></>}
          </Button>
          {passed > 0 && (
            <span role="status" className="data rounded-[6px] bg-black/70 px-2.5 py-1.5 text-[11px] text-ir uppercase">
              {passed} frame{passed === 1 ? "" : "s"} passed by a person's decision
            </span>
          )}
        </div>
      </div>

      <ul className="mt-6 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-5">
        {LANES.map((l) => (
          <li key={l.id} className="bg-surface px-5 py-4">
            <p className="flex items-center gap-2 text-[14px] font-medium">
              <span aria-hidden className="size-2 rounded-full" style={{ background: COLOR[l.id], boxShadow: l.person === l.frames ? `0 0 8px ${COLOR[l.id]}` : undefined }} />
              {l.label}
            </p>
            <p className="wide mt-2 text-[40px]">{l.frames}</p>
            <p className="mt-1 text-[13px] text-fg-3">{l.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-[80ch] text-[14px] text-fg-3">
        Counts measured on {SAMPLE.frames} test frames: {NEEDS_A_PERSON} of {SAMPLE.frames} needed a person. The frames are
        {SAMPLE.source.replace(/^252 /, "")}, and SpeciesNet was very likely trained on these datasets, so the confident
        share is optimistic. These shares are not a reserve's real stream; the moving frames above are an illustration in
        those proportions.
      </p>
    </Chapter>
  );
}

/** Without WebGL: the same five roads as a plain diagram. */
function StaticFork() {
  return (
    <svg viewBox="0 0 600 340" className="h-full w-full" role="img" aria-label="One road splits into five lanes; three stop at a check-post">
      <rect width="600" height="340" fill="#0a0b0d" />
      <path d="M300 20 L300 120" stroke="#1a1d22" strokeWidth="26" />
      {ORDER.map((id, i) => {
        const x = 70 + i * 115;
        return (
          <g key={id}>
            <path d={`M300 120 C300 170 ${x} 170 ${x} 230 L${x} 330`} stroke="#1a1d22" strokeWidth="22" fill="none" />
            <path d={`M300 120 C300 170 ${x} 170 ${x} 230 L${x} 330`} stroke={COLOR[id]} strokeWidth="2" fill="none" />
          </g>
        );
      })}
      <line x1="275" y1="251" x2="595" y2="251" stroke="#ff5a68" strokeWidth="10" />
      <line x1="275" y1="251" x2="595" y2="251" stroke="#edeef0" strokeWidth="10" strokeDasharray="20 20" />
    </svg>
  );
}
