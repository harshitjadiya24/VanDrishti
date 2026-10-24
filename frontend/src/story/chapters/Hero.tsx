// First viewport: the page is the camera trap's night. Firing the camera is the working
// demonstration: flash, infrared freeze, the detector's box, the data strip stamped.

import clsx from "clsx";
import { ArrowDown, Camera } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { IRFrame } from "../../design/IRFrame";
import { Button } from "../../design/primitives";
import { TrapStrip } from "../../design/TrapStrip";
import { hasWebGL } from "../fork/webgl";
import { prefersReducedMotion } from "../scroll";

const NightForest = lazy(() => import("../scene/NightForest"));

/** The flash may fire at most once every two seconds (WCAG 2.3.1: never a strobe). */
const COOLDOWN_MS = 2000;

export function Hero({ onSeeHow }: { onSeeHow?: () => void }) {
  const [still] = useState(prefersReducedMotion);
  const [webgl] = useState(hasWebGL);
  // Reduced motion: the frame is already captured, nothing flashes.
  const [shotAt, setShotAt] = useState<number | null>(still ? 0 : null);
  const [cooling, setCooling] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const captured = shotAt !== null;

  useEffect(() => {
    if (!cooling) return;
    const t = window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [cooling]);
  useEffect(() => {
    if (!flashing) return;
    const t = window.setTimeout(() => setFlashing(false), 450);
    return () => window.clearTimeout(t);
  }, [flashing]);

  const fire = () => {
    if (cooling) return;
    setShotAt(performance.now());
    setCooling(true);
    if (!still) setFlashing(true);
  };

  return (
    <section aria-labelledby="hero-title" className="relative isolate h-dvh min-h-[600px] overflow-hidden bg-night text-[#edeef0]">
      {/* The night: WebGL forest, or the captured IR frame where WebGL is missing. */}
      <div className="absolute inset-0 -z-10">
        {webgl ? (
          <Suspense fallback={<div className="h-full w-full bg-night" />}>
            <NightForest shotAt={shotAt} boxRef={box} still={still} />
          </Suspense>
        ) : (
          <IRFrame id="hero-static" className="flex h-full items-center justify-center bg-night [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-none" />
        )}
      </div>

      {/* The detector's box, positioned by the scene over the striped body. */}
      {webgl && (
        <div ref={box} aria-hidden
          className={clsx("pointer-events-none absolute top-0 left-0 border-[2.5px] border-heat-5 transition-opacity duration-[var(--duration-slow)]",
            captured ? "opacity-100" : "opacity-0")}
          style={{ boxShadow: "0 0 18px -2px rgb(255 201 74 / 0.55)" }}>
          <span className="data absolute -top-[19px] -left-[2.5px] bg-heat-5 px-1.5 py-px text-[11px] font-semibold text-[#160a02]">animal 0.96</span>
        </div>
      )}

      {/* The flash itself: one soft white-out, never a strobe. */}
      <div aria-hidden className={clsx("pointer-events-none absolute inset-0 bg-flash transition-opacity",
        flashing ? "opacity-70 duration-75" : "opacity-0 duration-500 ease-[var(--ease-flash)]")} />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5 md:px-10 md:pt-7">
        <p className="flex items-baseline gap-3">
          <span className="wide wide-max text-[22px] tracking-[-0.01em]">VanDrishti</span>
          <span lang="hi" className="hindi text-[17px] text-[#a9aeb8]">वनदृष्टि</span>
        </p>
        <a href="/app" className="inline-flex h-11 items-center rounded-[var(--radius-ctl)] border border-white/20 bg-white/5 px-4 text-[14px] font-medium backdrop-blur-md hover:bg-white/12 md:h-10">
          Sign in
        </a>
      </header>

      <div className="absolute inset-x-0 bottom-0">
        <div className="px-5 pb-6 md:px-10 md:pb-10">
          <h1 id="hero-title" className="wide max-w-[14ch] text-[clamp(2.75rem,8.4vw,6rem)]">
            <span className="sr-only">VanDrishti: </span>AI proposes. <span className="text-heat-5">People decide.</span>
          </h1>
          <p className="mt-4 max-w-[52ch] text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-[#c3c7cf]">
            Camera traps in a tiger reserve take more photographs than anyone can look at. VanDrishti sorts them,
            explains every call, and stops wherever a person must decide.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button tone="decide" size="lg" onClick={fire} disabled={cooling && !still} aria-describedby="hero-strip">
              <Camera size={18} aria-hidden /> {captured ? "Fire again" : "Fire the camera"}
            </Button>
            <Button tone="ghost" size="lg" onClick={onSeeHow} className="text-[#edeef0] hover:bg-white/10">
              See how it works <ArrowDown size={18} aria-hidden />
            </Button>
          </div>
        </div>
        <TrapStrip camera="CAM S-07" time="24.10.2026 22:41:07 IST"
          extra={<span id="hero-strip" role="status">{captured ? "captured · synthetic frame" : "armed · synthetic scene"}</span>} />
      </div>
    </section>
  );
}
