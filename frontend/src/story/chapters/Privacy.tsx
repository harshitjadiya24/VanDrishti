// Stage 4.1: one frame that protects people and places. The body is blurred (always on: no
// animation ever reveals a person), the location on its strip is rounded, and the view itself is
// recorded. Three ruled statements beside it say what each mark means.

import { EyeOff, MapPinOff, ScrollText, type LucideIcon } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../scroll";
import { Chapter, Synthetic } from "../ui";

function digits(v: string) {
  const [whole, frac] = v.split(".");
  return (
    <span>
      {whole}.{frac[0]}
      {frac.slice(1).split("").map((d, i) => <span key={i} data-drop className="drop-digit">{d}</span>)}
    </span>
  );
}

function Statement({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-edge py-5 first:border-t-0 first:pt-0">
      <Icon size={20} aria-hidden className="mt-0.5 text-fg-3" />
      <div>
        <p className="text-[17px] font-semibold">{title}</p>
        <div className="mt-1.5 text-[14.5px] leading-relaxed text-fg-2">{children}</div>
      </div>
    </div>
  );
}

export function PrivacyChapter() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return; // CSS already shows the final, rounded state
    gsap.fromTo("[data-drop]", { opacity: 1, maxWidth: "1ch" }, {
      opacity: 0, maxWidth: 0, stagger: 0.12, duration: 0.5, ease: "power2.in",
      scrollTrigger: { trigger: "[data-coords]", start: "top 75%" },
    });
    gsap.fromTo("[data-person-box]", { strokeDashoffset: 600 }, {
      strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut",
      scrollTrigger: { trigger: "[data-person-box]", start: "top 75%" },
    });
  }, { scope: root });

  return (
    <Chapter id="privacy" variant="split" stage="4.1" strip="privacy" sectionRef={root} title="Privacy is built in"
      lede="People and places are protected by default, in every copy, screen, export and API answer.">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
        <figure className="m-0 overflow-hidden rounded-[var(--radius-card)] border border-edge bg-black">
          <svg viewBox="0 0 420 210" className="block w-full" role="img" aria-label="A person-shaped region in an infrared frame, blurred from head to toe">
            <defs>
              <filter id="privacy-blur"><feGaussianBlur stdDeviation="10" /></filter>
              <radialGradient id="privacy-ir" cx="0.5" cy="0.55" r="0.75"><stop offset="0" stopColor="#8d9299" /><stop offset="0.55" stopColor="#3b3f45" /><stop offset="1" stopColor="#101215" /></radialGradient>
            </defs>
            <rect width="420" height="210" fill="url(#privacy-ir)" />
            <g fill="#1b1e22"><rect x="30" y="0" width="18" height="170" /><rect x="360" y="0" width="22" height="172" /><rect x="320" y="0" width="8" height="166" opacity="0.6" /></g>
            <path d="M0 168 C 120 162, 300 172, 420 165 L420 210 L0 210 Z" fill="#2a2d32" />
            {/* Always blurred: privacy never waits for an animation. */}
            <g filter="url(#privacy-blur)">
              <rect x="186" y="58" width="50" height="110" rx="24" fill="#d0d3d8" />
              <circle cx="211" cy="48" r="16" fill="#d0d3d8" />
            </g>
            <rect data-person-box x="168" y="26" width="86" height="148" fill="none" stroke="#ff5a68" strokeWidth="2.5" strokeDasharray="600" />
            <rect x="168" y="10" width="124" height="16" fill="#ff5a68" />
            <text x="173" y="21.5" fill="#160406" fontSize="10" fontWeight="600" fontFamily="Martian Mono Variable, monospace" textLength={114} lengthAdjust="spacingAndGlyphs">person 0.93 · blurred</text>
          </svg>
          {/* The frame's own strip carries the rounded location and the audited view. */}
          <figcaption className="data grid gap-1 bg-black px-3 py-2 text-[10.5px] tracking-[0.05em] text-ir uppercase">
            <span data-coords className="flex flex-wrap gap-x-4">
              <span>cam s-07</span>
              <span className="text-settled">lat {digits("22.34567")} · lon {digits("80.61234")}</span>
              <span>rounded for non-admins</span>
            </span>
            <span className="flex flex-wrap gap-x-4 text-fg-3">
              <span>view audited · ranger · 23:12:40 ist</span>
              <span>synthetic</span>
            </span>
          </figcaption>
        </figure>

        <div>
          <Statement icon={EyeOff} title="Whole bodies are blurred">
            People are blurred from head to toe in every copy anyone sees. No face is ever detected or recognised,
            and originals are never served.
            <span className="mt-1.5 block text-[12.5px] text-fg-3">
              How many people the detector finds cannot be measured yet: the public test images have people removed.
            </span>
          </Statement>
          <Statement icon={MapPinOff} title="Tiger locations stay vague">
            An admin sees <span className="data text-[12.5px] text-fg">22.34567, 80.61234</span>; everyone else sees it
            rounded to 0.1 degree (roughly 10 km), in every screen, export and API answer.
          </Statement>
          <Statement icon={ScrollText} title="Looking is recorded too">
            Only reviewers and rangers may open a frame with people in it, and every such view is written to the
            audit trail with their name. Each person sees only their own reserves.
          </Statement>
          <Synthetic className="mt-2 block" />
        </div>
      </div>
    </Chapter>
  );
}
