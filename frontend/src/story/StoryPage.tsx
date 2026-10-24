import "./legacy.css";
import { useRef } from "react";
import { ForkSection } from "./fork/ForkSection";
import { Rivets } from "./parts";
import { PipelineSection } from "./PipelineSection";
import { gsap, prefersReducedMotion, useGSAP, useSmoothScroll } from "./scroll";
import {
  CloseSection,
  DecideSection,
  EngineeringSection,
  IdentitySection,
  OutcomesSection,
  PrivacySection,
  RiskSection,
} from "./sections";
import { BOX, BoxLabel, NightFrame } from "./frame";

const MILESTONES = [
  { n: 1, label: "See how it works ↓", href: "#how" },
  { n: 2, label: "Detect", href: "#how" },
  { n: 3, label: "Decide", href: "#stage-3" },
  { n: 4, label: "Review", href: "#stage-4" },
  { n: 5, label: "Act", href: "#stage-5" },
];

/** The public story site. It makes no API calls and loads nothing from third parties. */
export default function StoryPage() {
  useSmoothScroll();
  return (
    <div className="story-ground min-h-dvh text-on-board">
      <Hero />
      <main>
        <PipelineSection />
        <ForkSection />
        <DecideSection />
        <PrivacySection />
        <IdentitySection />
        <RiskSection />
        <OutcomesSection />
        <EngineeringSection />
        <CloseSection />
      </main>
    </div>
  );
}

function Hero() {
  const root = useRef<HTMLElement>(null);
  // The board swings up on its posts, the stencil paints on, the verdict plate stamps down.
  // Everything is visible without this; it only plays when motion is welcome.
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.fromTo("[data-hero-board]", { rotateX: 14, y: 26, transformPerspective: 900, transformOrigin: "50% 100%" }, { rotateX: 0, y: 0, duration: 1.1 })
      .fromTo("#hero-title", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.0, ease: "power3.inOut" }, 0.2)
      .fromTo("[data-hero-box]", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 0.7)
      .fromTo("[data-hero-verdict]", { scale: 1.08, y: -8, opacity: 0.2 }, { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: "power4.out" }, 1.35)
      .fromTo("[data-milestone]", { y: 18 }, { y: 0, stagger: 0.07, duration: 0.6, ease: "expo.out" }, 0.9);
  }, { scope: root });
  return (
    <section ref={root} aria-labelledby="hero-title" className="flex min-h-dvh flex-col px-4 pt-4 md:px-10 md:pt-6">
      <header className="flex items-center justify-between">
        <span className="board-title text-[22px] tracking-wide">VanDrishti</span>
        <a href="/app" className="rounded-[10px] bg-on-board px-4 py-2 text-[15px] font-semibold text-board shadow-[0_10px_20px_-10px_rgb(0_0_0/0.55)] hover:bg-white">
          Sign in
        </a>
      </header>

      {/* The board: one painted forest-department sign, standing on two posts. */}
      <div className="mt-4 flex flex-1 flex-col">
        <div data-hero-board className="relative rounded-[14px] bg-board p-3 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7)] md:p-4">
          <Rivets />
          <div className="rounded-[8px] border-[3px] border-on-board/90 px-5 pt-5 pb-5 md:px-10 md:pt-6 md:pb-7">
            <h1 id="hero-title" className="board-title text-[clamp(3.6rem,11vw,6rem)] uppercase">VanDrishti</h1>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p lang="hi" className="deva text-[clamp(1.5rem,3.4vw,2.2rem)] text-on-board-dim">वनदृष्टि</p>
              <p className="text-[clamp(1.35rem,2.6vw,2rem)] font-semibold leading-tight">AI proposes. <span className="text-check">People decide.</span></p>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-8">
              <FramePlate />
              <div className="flex flex-col gap-5">
                <VerdictPlate />
                <p className="max-w-[46ch] text-[17px] leading-relaxed text-on-board-dim">
                  Camera traps in a tiger reserve take more photographs than anyone can look at. VanDrishti sorts them,
                  explains every call it makes, and stops at a check-post wherever a person must decide.
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* The posts the board stands on, painted in bands like a forest road sign. */}
        <div aria-hidden className="flex min-h-8 flex-1 justify-between px-[12%]">
          {[0, 1].map((i) => (
            <span key={i} className="w-4 bg-[linear-gradient(#f6f3ee_0_50%,#121629_50%_100%)] [background-size:100%_16px]" />
          ))}
        </div>
      </div>

      <nav aria-label="The road through VanDrishti" className="border-t-2 border-board-line pt-4 pb-6">
        <ol className="grid grid-cols-5 items-end gap-1.5 md:flex md:gap-4">
          {MILESTONES.map((m) => (
            <li key={m.n} data-milestone className="min-w-0 md:shrink-0">
              <a href={m.href}
                className="block w-full overflow-hidden rounded-t-[40px] rounded-b-md bg-on-board text-center text-board shadow-[0_10px_20px_-10px_rgb(0_0_0/0.55)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-board)] hover:-translate-y-1 md:w-[132px] md:rounded-t-[56px]">
                <span className="block bg-board-line pt-3 pb-1 text-[13px] font-semibold text-on-board">{m.n}</span>
                <span className="block px-1 py-2 text-[13px] leading-tight font-semibold md:px-2 md:text-[15px]">{m.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

/** An enamel plate holding one synthetic frame: a stripe field inside the detector's box. */
function FramePlate() {
  return (
    <figure className="relative self-start rounded-[12px] bg-on-board p-3 shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)]">
      <Rivets className="bg-[#9aa0bb]" />
      <div className="relative overflow-hidden rounded-[6px] bg-[#1c2033]">
        <svg viewBox="0 0 420 190" className="block w-full" role="img"
          aria-label="Synthetic night frame: the detector's box around a striped body in the grass">
          <NightFrame id="hero">
            <rect data-hero-box {...BOX} fill="none" className="box-glow" stroke="#ffb45e" strokeWidth="3" pathLength={1} strokeDasharray="1" />
            <BoxLabel text="animal 0.94" />
          </NightFrame>
        </svg>
        <figcaption className="flex justify-between bg-black/80 px-3 py-1 font-[ui-monospace,monospace] text-[11px] tracking-wide text-[#dfe2ee]">
          <span>CAM S-07</span><span>22:41 IST</span><span>SYNTHETIC FRAME</span>
        </figcaption>
      </div>
    </figure>
  );
}

/** The model's proposal for that frame, in three fixed tiers: verdict, label, reason. */
function VerdictPlate() {
  return (
    <div data-hero-verdict className="relative rounded-[12px] bg-on-board px-5 pt-4 pb-5 text-[#121629] shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)]">
      <Rivets className="bg-[#9aa0bb]" />
      <span className="inline-block rounded bg-board px-2 py-0.5 text-[13px] font-semibold text-on-board">Auto-accepted</span>
      <p className="mt-2 text-[22px] leading-tight font-semibold">Tiger <span className="tabular text-[#585e78]">0.97</span></p>
      <p className="mt-1 text-[15px] leading-snug text-[#3a3f57]">
        The species model agrees with the detector, and tigers are on this reserve's list. Spot-checked at random.
      </p>
    </div>
  );
}
