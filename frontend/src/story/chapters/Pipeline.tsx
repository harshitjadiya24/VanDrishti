// Stage 2: one frame walks the AI pipeline while it stays pinned in view. Each stage leaves its
// mark on the frame (a fingerprint, a usability tag, the detector's box, species, an outline,
// one confidence with reasons) and names the model and version that made it.

import clsx from "clsx";
import { useRef, useState } from "react";
import { BODY, BOX, FRAME, IRScene } from "../../design/IRFrame";
import { heatFor } from "../../design/primitives";
import { prefersReducedMotion, ScrollTrigger, useGSAP } from "../scroll";
import { Chapter, Synthetic, useSha256 } from "../ui";

const STEPS = [
  { title: "Stored once, never changed", recipe: "ingest · sha-256 fingerprint",
    body: "Each photograph is filed by its SHA-256 fingerprint. The original is locked; every later step works on a copy." },
  { title: "Is the frame usable?", recipe: "quality gate v1 · blur warning below 100",
    body: "Blur, darkness and wash-out are measured. A frame that fails goes to a person instead of the models." },
  { title: "Is anything there?", recipe: "MegaDetector V6 (MIT) · animal threshold 0.2",
    body: "The detector boxes every animal, person and vehicle. People and vehicles are blurred whole-body and always go to a person." },
  { title: "Which species?", recipe: "SpeciesNet v4.0.3a · country list: India",
    body: "SpeciesNet names the animal in the box, with its next four guesses. Only species recorded in the country are allowed." },
  { title: "A second opinion", recipe: "OpenCLIP ViT-B/16 · informational only",
    body: "OpenCLIP compares the crop with words such as “a tiger”. It is shown, never trusted alone: on our sample (where SpeciesNet made no errors to catch) its disagreements predicted none." },
  { title: "Outline the animal", recipe: "SAM 2.1 tiny · on CPU",
    body: "SAM 2 traces the body exactly, for a cleaner crop than the detector's box." },
  { title: "One confidence, with reasons", recipe: "decision engine v1",
    body: "The species score is weighed by named factors: is the species on this reserve's list, is it active at this hour, how clear is the box." },
  { title: "Why this decision?", recipe: "explanation stored with the frame",
    body: "Every answer carries its reasons, the models' raw outputs and their versions. Anyone can ask why, and the answer never changes after the fact." },
] as const;

const TOP5 = [
  { label: "tiger", score: 0.97 },
  { label: "leopard", score: 0.012 },
  { label: "jungle cat", score: 0.008 },
  { label: "sambar", score: 0.005 },
  { label: "wild boar", score: 0.003 },
];

/** What each stage added, in one line: the phone's readout under the pinned frame. */
const SHORT = [
  "Fingerprinted and locked",
  "Usable · night infrared",
  "Animal found · 0.96",
  "Species: tiger 0.97 (top of five)",
  "Second opinion 0.88 (shown, not used)",
  "Outline traced",
  "Confidence 0.97, with four reasons",
  "Auto-accepted, with its explanation",
];

const FACTORS = [
  { name: "SpeciesNet score", value: "0.97" },
  { name: "On this reserve's species list", value: "× 1.00" },
  { name: "Active at 22:41 (night)", value: "× 1.00" },
  { name: "Clear detection (0.96)", value: "× 1.00" },
];

export function PipelineChapter() {
  const [step, setStep] = useState(0);
  const root = useRef<HTMLElement>(null);

  // Scroll progress through the list sets the current stage: there is always exactly one.
  useGSAP(() => {
    const list = root.current?.querySelector<HTMLElement>("[data-steps]");
    if (!list) return;
    ScrollTrigger.create({
      trigger: list, start: "top 55%", end: "bottom 55%",
      onUpdate: (self) => setStep(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length))),
      onLeaveBack: () => setStep(0),
    });
  }, { scope: root });

  return (
    <Chapter id="how" stage="2" strip="one frame down the road" sectionRef={root}
      title="One frame down the road"
      lede="Follow a single night photograph from the camera to a decision. Each stop is a separate model or rule, and each leaves its mark on the frame with its name and version.">
      <div className="grid gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-16">
        <div className="sticky top-4 z-10 self-start md:top-12">
          <StageFrame step={step} />
        </div>
        <ol data-steps className="grid gap-[18vh] pb-[18vh] md:pt-[6vh]">
          {STEPS.map((s, i) => (
            <li key={s.title} aria-current={i === step ? "step" : undefined}
              className={clsx("max-w-[46ch] transition-[opacity,transform] duration-[var(--duration-slow)] ease-[var(--ease-out)]",
                i === step ? "translate-x-0" : "md:translate-x-2")}>
              <h3 className={clsx("wide text-[clamp(1.5rem,2.4vw,2rem)] transition-colors duration-[var(--duration-slow)]", i === step ? "text-fg" : "text-fg-2")}>{s.title}</h3>
              <p className={clsx("mt-3 text-[16px] leading-relaxed transition-colors duration-[var(--duration-slow)]", i === step ? "text-fg-2" : "text-fg-3")}>{s.body}</p>
              <p className={clsx("data mt-4 inline-flex items-center gap-2 rounded-[6px] bg-black/60 px-2.5 py-1 text-[10.5px] tracking-[0.05em] uppercase transition-colors duration-[var(--duration-slow)]",
                i === step ? "text-heat-5" : "text-fg-3")}>
                <span aria-hidden className={clsx("size-1.5 rounded-full", i === step ? "bg-heat-5" : "bg-fg-3")} />{s.recipe}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Chapter>
  );
}

/** The pinned frame. Layers appear as the frame passes each stage; reduced motion shows all. */
function StageFrame({ step }: { step: number }) {
  const hash = useSha256("CAM S-07 · 22:41 IST · synthetic frame");
  const [reduce] = useState(prefersReducedMotion);
  const shown = (from: number) => reduce || step >= from;
  const decided = shown(6);
  return (
    <figure aria-label="The example frame and what each stage added" className="overflow-hidden rounded-[var(--radius-card)] border border-edge bg-surface shadow-[var(--lift)]">
      <div className="relative bg-black">
        <svg viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} className="block w-full" role="img" aria-label="Synthetic infrared camera frame">
          <g className={clsx("transition-[filter] duration-700", shown(1) ? "" : "brightness-50")}><IRScene id="pipe" /></g>
          {/* SAM's outline: exactly the body. */}
          <rect {...BODY} fill="none" stroke="#7cc7e8" strokeWidth="2" pathLength={1} strokeDasharray="1"
            strokeDashoffset={shown(5) ? 0 : 1} className="transition-[stroke-dashoffset] duration-[1200ms] ease-[var(--ease-out)]" />
          {/* The detector's box, drawn on. */}
          <rect {...BOX} fill="none" stroke="var(--color-heat-5)" strokeWidth="2.5" pathLength={1} strokeDasharray="1"
            strokeDashoffset={shown(2) ? 0 : 1} className="transition-[stroke-dashoffset] duration-[900ms] ease-[var(--ease-out)]" />
          <g className={clsx("transition-opacity duration-500", shown(2) ? "opacity-100" : "opacity-0")}>
            <rect x={BOX.x - 1.25} y={BOX.y - 16} width={86} height={16} fill="var(--color-heat-5)" />
            <text x={BOX.x + 5} y={BOX.y - 4.5} fontSize={11} fontWeight={600} fill="#160a02" fontFamily="Martian Mono Variable, monospace" textLength={76} lengthAdjust="spacingAndGlyphs">animal 0.96</text>
          </g>
          <g className={clsx("transition-opacity duration-500", shown(1) ? "opacity-100" : "opacity-0")}>
            <rect x={296} y={8} width={116} height={17} rx={2} fill="rgb(0 0 0 / 0.75)" />
            <text x={302} y={20} fontSize={10.5} fill="#dfe2ee" fontFamily="Martian Mono Variable, monospace" textLength={104} lengthAdjust="spacingAndGlyphs">usable · night IR</text>
          </g>
        </svg>
        <div className="data flex items-center justify-between gap-3 bg-black/85 px-3 py-1.5 text-[10px] tracking-[0.06em] whitespace-nowrap text-ir uppercase">
          <span>CAM S-07 · 22:41 IST · IR</span>
          <span className="min-w-0 truncate normal-case" title={hash}>sha256 {hash.slice(0, 16)}…</span>
        </div>
      </div>

      <div className="p-4">
        <p className="text-[15px] font-medium md:hidden" aria-live="polite">{SHORT[step]}</p>
        <div className="hidden gap-3 sm:grid-cols-2 md:grid">
          <Readout show={shown(3)} title="Species, top five">
            <ul className="grid gap-1.5">
              {TOP5.map((t) => (
                <li key={t.label} className="grid grid-cols-[78px_1fr_44px] items-center gap-2 text-[12.5px]">
                  <span className="text-fg-2">{t.label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full origin-left rounded-full bg-fg transition-transform duration-[900ms] ease-[var(--ease-out)]"
                      style={{ transform: `scaleX(${shown(3) ? Math.max(t.score, 0.02) : 0})` }} />
                  </span>
                  <span className="data text-right text-[11px]">{t.score.toFixed(t.score < 0.01 ? 3 : 2)}</span>
                </li>
              ))}
            </ul>
            <p className={clsx("mt-2 text-[12px] text-fg-3 transition-opacity duration-500", shown(4) ? "opacity-100" : "opacity-0")}>
              Second opinion: “a photo of a tiger” 0.88 (shown, not used)
            </p>
          </Readout>
          <Readout show={decided} title="Decision">
            <div className="flex items-baseline gap-2">
              <span className="wide text-[34px]" style={{ color: decided ? heatFor(0.97) : undefined }}>{decided ? "0.97" : "–"}</span>
              <span className="text-[12px] text-fg-3">confidence</span>
            </div>
            <ul className="mt-2 grid gap-0.5 text-[11.5px] text-fg-2">
              {FACTORS.map((f) => (
                <li key={f.name} className="flex justify-between gap-2"><span>{f.name}</span><span className="data text-[10.5px] text-fg">{f.value}</span></li>
              ))}
            </ul>
          </Readout>
        </div>
        <p className={clsx("mt-3 hidden rounded-[10px] border border-settled/50 px-3 py-2.5 text-[13.5px] text-fg-2 transition-[opacity,transform] duration-[var(--duration-slow)] md:block",
          shown(7) ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")}>
          <b className="font-semibold text-settled">Auto-accepted:</b> tiger 0.97 because SpeciesNet is confident, the reserve lists
          tigers, they are active at night, and the box is clear. Stored with every model's name and version.
        </p>
        <div className="mt-3 flex justify-between text-[12px] text-fg-3">
          <span className="data text-[10.5px] uppercase">stage {step + 1} of {STEPS.length}</span>
          <Synthetic />
        </div>
      </div>
    </figure>
  );
}

function Readout({ show, title, children }: { show: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className={clsx("rounded-[10px] border bg-surface-2 p-3 transition-colors duration-[var(--duration-slow)]", show ? "border-edge-strong" : "border-edge")}>
      <p className="mb-2 text-[12px] font-medium text-fg-3">{title}</p>
      {children}
    </div>
  );
}
