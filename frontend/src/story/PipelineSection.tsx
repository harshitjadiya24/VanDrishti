import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plate, Rivets, StageTitle, Synthetic } from "./parts";
import { ScrollTrigger, useGSAP } from "./scroll";
import { stripeField } from "./stripes";

const STEPS = [
  { title: "Stored once, never changed", recipe: "Ingest · SHA-256 fingerprint",
    body: "Each photograph is filed by its SHA-256 fingerprint. The original is locked; every later step works on a copy." },
  { title: "Is the frame usable?", recipe: "Quality gate v1 · blur warning below 100",
    body: "Blur, darkness and wash-out are measured. A frame that fails goes to a person instead of the models." },
  { title: "Is anything there?", recipe: "MegaDetector V6 (MIT) · animal threshold 0.2",
    body: "The detector boxes every animal, person and vehicle. People and vehicles are blurred whole-body and always go to a person." },
  { title: "Which species?", recipe: "SpeciesNet v4.0.3a · country list: India",
    body: "SpeciesNet names the animal in the box, with its next four guesses. Only species recorded in the country are allowed." },
  { title: "A second opinion", recipe: "OpenCLIP ViT-B/16 · informational only",
    body: "OpenCLIP compares the crop with words such as “a tiger”. It is shown, never trusted alone: on our sample its disagreements caught no errors." },
  { title: "Outline the animal", recipe: "SAM 2.1 tiny · on CPU",
    body: "SAM 2 traces the body, for a cleaner crop and later for comparing stripes." },
  { title: "One confidence, with reasons", recipe: "Decision engine v1",
    body: "The species score is weighed by named factors: is the species on this reserve's list, is it active at this hour, how clear is the box." },
  { title: "Why this decision?", recipe: "Explanation stored with the frame",
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
  "Animal found · 0.94",
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
  { name: "Clear detection (0.94)", value: "× 1.00" },
];

/** Sections 3-5 of the image: one frame walks the AI pipeline while its plate stays in view. */
export function PipelineSection() {
  const [step, setStep] = useState(0);
  const root = useRef<HTMLElement>(null);

  // The stage follows scroll progress through the list of plates, so there is always
  // exactly one current stage, even between plates.
  useGSAP(
    () => {
      const list = root.current?.querySelector<HTMLElement>("[data-steps]");
      if (!list) return;
      ScrollTrigger.create({
        trigger: list,
        start: "top 55%",
        end: "bottom 55%",
        onUpdate: (self) => setStep(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length))),
        onLeaveBack: () => setStep(0),
      });
    },
    { scope: root },
  );

  return (
    <section id="how" ref={root} aria-labelledby="how-title" className="px-4 py-20 md:px-10 md:py-28">
      <StageTitle id="how-title" milestone="2">One frame down the road</StageTitle>
      <p className="mt-4 max-w-[60ch] text-[18px] text-on-board-dim">
        Follow a single night photograph from the camera to a decision. Each stop is a separate model or rule, and each
        leaves its mark on the frame with its name and version.
      </p>

      <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-14">
        <div className="sticky top-3 z-10 self-start md:top-10">
          <StageFrame step={step} />
        </div>
        <ol data-steps className="grid gap-[16vh] pb-[16vh] md:pt-[4vh]">
          {STEPS.map((s, i) => (
            <li key={s.title} aria-current={i === step ? "step" : undefined}
              className={clsx("transition-transform duration-[var(--duration-board)] ease-[var(--ease-board)]", i === step ? "translate-x-0" : "md:translate-x-3")}>
              <Plate className={clsx("max-w-[46ch] transition-shadow duration-[var(--duration-board)]", i === step ? "ring-4 ring-check" : "")}>
                <p className="text-[13px] font-semibold text-[#4e5f53]">{s.recipe}</p>
                <h3 className="mt-1 text-[24px] leading-tight font-semibold">{s.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-[#2f3d33]">{s.body}</p>
              </Plate>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The pinned frame plate. Layers appear as the frame passes each stage. */
function StageFrame({ step }: { step: number }) {
  const stripes = useMemo(() => stripeField(23, 340, 170), []);
  const hash = useSha256("CAM S-07 · 22:41 IST · synthetic frame");
  const shown = (from: number) => step >= from;
  return (
    <figure aria-label="The example frame and what each stage added" className="relative rounded-[12px] bg-on-board p-3 text-[#142019] shadow-[0_18px_40px_-18px_rgb(0_0_0/0.65)]">
      <Rivets className="bg-[#9aa79c]" />
      <div className="relative overflow-hidden rounded-[6px] bg-[#2f3431]">
        <svg viewBox="0 0 420 190" className="block w-full" role="img" aria-label="Synthetic camera frame">
          <defs>
            <linearGradient id="flank2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d08a24" /><stop offset="0.72" stopColor="#c47a1c" /><stop offset="1" stopColor="#ead9b6" />
            </linearGradient>
            <clipPath id="crop2"><rect x="78" y="22" width="290" height="150" rx="10" /></clipPath>
          </defs>
          <rect width="420" height="190" fill="#2f3431" />
          <g clipPath="url(#crop2)" className={clsx("transition-[filter] duration-700", shown(1) ? "" : "grayscale")}>
            <rect x="78" y="22" width="290" height="150" fill="url(#flank2)" />
            <g transform="translate(60 8)">{stripes.map((s, i) => <path key={i} d={s.d} fill="#151515" />)}</g>
          </g>
          {/* 5.5 the outline */}
          <rect x="80" y="24" width="286" height="146" rx="10" fill="none" stroke="#f5f6f1" strokeWidth="2.5" strokeDasharray="864"
            strokeDashoffset={shown(5) ? 0 : 864}
            className="transition-[stroke-dashoffset] duration-[1200ms] ease-[var(--ease-board)]" />
          {/* 5.2 the detector's box, drawn on */}
          <rect x="70" y="16" width="306" height="162" fill="none" stroke="#f2c230" strokeWidth="3" strokeDasharray="936"
            strokeDashoffset={shown(2) ? 0 : 936}
            className="transition-[stroke-dashoffset] duration-[900ms] ease-[var(--ease-board)]" />
        </svg>
        <span className={clsx("absolute top-0 left-[16.6%] rounded-b-sm bg-check px-1.5 text-[12px] font-semibold text-on-check transition-opacity duration-500", shown(2) ? "opacity-100" : "opacity-0")}>
          animal 0.94
        </span>
        <span className={clsx("absolute top-2 right-2 rounded-sm bg-black/75 px-1.5 text-[12px] text-[#d7ddd8] transition-opacity duration-500", shown(1) ? "opacity-100" : "opacity-0")}>
          usable · night IR
        </span>
        <figcaption className="flex justify-between gap-3 bg-black/80 px-3 py-1 font-[ui-monospace,monospace] text-[11px] tracking-wide text-[#d7ddd8]">
          <span>CAM S-07 · 22:41 IST</span>
          <span className="truncate" title={hash}>sha256 {hash.slice(0, 16)}…</span>
        </figcaption>
      </div>

      <p className="mt-2 text-[15px] font-semibold md:hidden" aria-live="polite">{SHORT[step]}</p>
      <div className="mt-3 hidden min-h-[178px] gap-3 sm:grid-cols-2 md:grid">
        <Readout show={shown(3)} title="Species, top five">
          <ul className="grid gap-1">
            {TOP5.map((t) => (
              <li key={t.label} className="grid grid-cols-[84px_1fr_44px] items-center gap-2 text-[13px]">
                <span>{t.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-[#e3e7df]">
                  <span className="block h-full origin-left rounded-full bg-board transition-transform duration-[900ms] ease-[var(--ease-board)]"
                    style={{ transform: `scaleX(${shown(3) ? Math.max(t.score, 0.02) : 0})` }} />
                </span>
                <span className="tabular text-right">{t.score.toFixed(t.score < 0.01 ? 3 : 2)}</span>
              </li>
            ))}
          </ul>
          <p className={clsx("mt-2 text-[12px] text-[#4e5f53] transition-opacity duration-500", shown(4) ? "opacity-100" : "opacity-0")}>
            Second opinion: “a photo of a tiger” 0.88 (shown, not used)
          </p>
        </Readout>
        <Readout show={shown(6)} title="Decision">
          <Dial value={shown(6) ? 0.97 : 0} />
          <ul className="mt-1 grid gap-0.5 text-[12px] text-[#2f3d33]">
            {FACTORS.map((f) => (
              <li key={f.name} className="flex justify-between gap-2"><span>{f.name}</span><span className="tabular">{f.value}</span></li>
            ))}
          </ul>
        </Readout>
      </div>
      <div className={clsx("mt-3 hidden rounded-[8px] border-2 border-board px-3 py-2 text-[14px] transition-[opacity,transform] md:block duration-[var(--duration-board)] ease-[var(--ease-stamp)]",
        shown(7) ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")}>
        <b>Auto-accepted:</b> tiger 0.97 because SpeciesNet is confident, the reserve lists tigers, they are active at
        night, and the box is clear. Stored with every model's name and version.
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-[#4e5f53]">
        <span>Stage {step + 1} of {STEPS.length}</span>
        <Synthetic className="!text-[#4e5f53]" />
      </div>
    </figure>
  );
}

function Readout({ show, title, children }: { show: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className={clsx("rounded-[8px] bg-[#f0f2ec] p-3 transition-opacity duration-[var(--duration-board)]", show ? "opacity-100" : "opacity-35")}>
      <p className="mb-2 text-[12px] font-semibold text-[#4e5f53]">{title}</p>
      {children}
    </div>
  );
}

/** A half dial with marks at the routing thresholds 0.6 and 0.9. */
function Dial({ value }: { value: number }) {
  const angle = -90 + 180 * value;
  const tick = (v: number) => {
    const a = (Math.PI * (1 - v));
    return { x1: 60 + 44 * Math.cos(a), y1: 60 - 44 * Math.sin(a), x2: 60 + 54 * Math.cos(a), y2: 60 - 54 * Math.sin(a) };
  };
  return (
    <div className="flex items-end gap-3">
      <svg viewBox="0 0 120 66" className="w-[112px]" role="img" aria-label={`Confidence ${value.toFixed(2)}; review below 0.9, uncertain below 0.6`}>
        <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke="#d8ddd4" strokeWidth="9" />
        <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke="#14532d" strokeWidth="9" pathLength={1}
          strokeDasharray="1" strokeDashoffset={1 - value} className="transition-[stroke-dashoffset] duration-[1100ms] ease-[var(--ease-board)]" />
        {[0.6, 0.9].map((v) => <line key={v} {...tick(v)} stroke="#15170f" strokeWidth="2" />)}
        <line x1="60" y1="60" x2="60" y2="16" stroke="#15170f" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: "60px 60px" }}
          className="transition-transform duration-[1100ms] ease-[var(--ease-boom)]" />
      </svg>
      <span className="tabular text-[28px] leading-none font-semibold">{value.toFixed(2)}</span>
    </div>
  );
}

/** A real SHA-256 of a synthetic frame's label, so the fingerprint shown is genuine. */
function useSha256(text: string): string {
  const [hex, setHex] = useState("");
  useEffect(() => {
    let live = true;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then((buf) => {
      if (live) setHex([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    });
    return () => { live = false; };
  }, [text]);
  return hex;
}
