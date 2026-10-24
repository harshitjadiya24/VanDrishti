// Stage 4.1: whole-body blur, rounded coordinates, audited views. The blur is always on: no
// animation ever reveals a person.

import { EyeOff, MapPinOff, ScrollText } from "lucide-react";
import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../scroll";
import { Card, Chapter } from "../ui";

export function PrivacyChapter() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return; // CSS already shows the final, rounded state
    gsap.fromTo("[data-drop]", { opacity: 1, maxWidth: "1ch" }, {
      opacity: 0, maxWidth: 0, stagger: 0.12, duration: 0.5, ease: "power2.in",
      scrollTrigger: { trigger: "[data-coords]", start: "top 70%" },
    });
    gsap.fromTo("[data-person-box]", { strokeDashoffset: 500 }, {
      strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut",
      scrollTrigger: { trigger: "[data-person-box]", start: "top 75%" },
    });
  }, { scope: root });

  const digits = (v: string) => {
    const [whole, frac] = v.split(".");
    return (
      <span>
        {whole}.{frac[0]}
        {frac.slice(1).split("").map((d, i) => <span key={i} data-drop className="drop-digit">{d}</span>)}
      </span>
    );
  };

  return (
    <Chapter id="privacy" stage="4.1" strip="privacy" sectionRef={root} title="Privacy is built in"
      lede="People and places are protected by default, in every copy, screen, export and API answer.">
      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <p className="flex items-center gap-2 text-[17px] font-semibold"><EyeOff size={18} aria-hidden className="text-fg-3" />Whole bodies are blurred</p>
          <div className="mt-4 overflow-hidden rounded-[10px] border border-edge">
            <svg viewBox="0 0 300 150" className="block w-full" role="img" aria-label="A person-shaped region, blurred">
              <defs>
                <filter id="privacy-blur"><feGaussianBlur stdDeviation="9" /></filter>
                <radialGradient id="privacy-ir" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stopColor="#7d8189" /><stop offset="1" stopColor="#2a2d32" /></radialGradient>
              </defs>
              <rect width="300" height="150" fill="url(#privacy-ir)" />
              {/* Always blurred: privacy never waits for an animation. */}
              <g filter="url(#privacy-blur)">
                <rect x="120" y="22" width="56" height="118" rx="26" fill="#cfd2d7" />
                <circle cx="148" cy="22" r="17" fill="#cfd2d7" />
                <rect x="90" y="96" width="110" height="10" fill="#5c6068" />
              </g>
              <rect data-person-box x="104" y="6" width="90" height="140" fill="none" stroke="#ff5a68" strokeWidth="2.5" strokeDasharray="500" />
              <rect x="104" y="128" width="124" height="16" fill="#ff5a68" />
              <text x="109" y="139.5" fill="#160406" fontSize="10" fontWeight="600" fontFamily="Martian Mono Variable, monospace" textLength={114} lengthAdjust="spacingAndGlyphs">person 0.93 · blurred</text>
            </svg>
          </div>
          <p className="mt-4 text-[14px] text-fg-2">
            People are blurred from head to toe in every copy anyone sees. No face is ever detected or recognised,
            and originals are never served.
          </p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-[17px] font-semibold"><MapPinOff size={18} aria-hidden className="text-fg-3" />Tiger locations stay vague</p>
          <dl data-coords className="mt-5 grid gap-4">
            <div>
              <dt className="text-[12.5px] text-fg-3">An admin sees</dt>
              <dd className="data mt-1 text-[19px] text-fg">22.34567, 80.61234</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-fg-3">Everyone else sees</dt>
              <dd className="data mt-1 text-[19px] text-settled">{digits("22.34567")}, {digits("80.61234")}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[14px] text-fg-2">Rounded to 0.1 degree, about 11 km, in every screen, export and API answer.</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-[17px] font-semibold"><ScrollText size={18} aria-hidden className="text-fg-3" />Looking is recorded too</p>
          <p className="mt-4 text-[14.5px] leading-relaxed text-fg-2">
            Only reviewers and rangers may open a frame with people in it, and every such view is written to the
            audit trail with their name. Each person sees only their own reserves.
          </p>
          <p className="data mt-5 rounded-[8px] border border-edge bg-surface-2 px-3 py-2 text-[10.5px] leading-relaxed text-fg-3">
            audit · viewed frame with people · ranger · 23:12:40 IST · synthetic
          </p>
        </Card>
      </div>
    </Chapter>
  );
}
