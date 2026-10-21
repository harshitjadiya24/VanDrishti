import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { MEASURED, MODELS } from "./results";
import { Board, Plate, StageTitle, Synthetic } from "./parts";
import { gsap, prefersReducedMotion, useGSAP } from "./scroll";
import { stripeField } from "./stripes";

/** A small synthetic stripe frame (no box), for review and identity plates. */
function StripeFrame({ seed, label, tilt = 0 }: { seed: number; label: string; tilt?: number }) {
  const stripes = useMemo(() => stripeField(seed, 300, 150), [seed]);
  return (
    <svg viewBox="0 0 300 150" className="block w-full rounded-[6px]" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`f${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d08a24" /><stop offset="0.75" stopColor="#c47a1c" /><stop offset="1" stopColor="#ead9b6" />
        </linearGradient>
      </defs>
      <rect width="300" height="150" fill={`url(#f${seed})`} />
      <g transform={`rotate(${tilt} 150 75) translate(10 0)`}>{stripes.map((s, i) => <path key={i} d={s.d} fill="#151515" />)}</g>
    </svg>
  );
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Link { action: string; hash: string; prev: string }

/** Section 8: a person decides, and each decision is chained to the one before it. */
export function DecideSection() {
  const [chain, setChain] = useState<Link[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const genesis = "0".repeat(64);
      const a = await sha256(`${genesis}|routed: uncertain 0.55`);
      const b = await sha256(`${a}|alert raised: none`);
      if (live) setChain([{ action: "Routed: uncertain (0.55)", hash: a, prev: genesis }, { action: "Queued for a person", hash: b, prev: a }]);
    })();
    return () => { live = false; };
  }, []);

  const append = async (action: string) => {
    const prev = chain[chain.length - 1]?.hash ?? "0".repeat(64);
    const hash = await sha256(`${prev}|${action}`);
    setChain((c) => [...c, { action, hash, prev }]);
  };

  const decide = (label: string) => {
    if (verdict) return;
    setVerdict(label);
    void append(`Decided by you: ${label}`);
  };
  const undo = () => {
    if (!verdict) return;
    void append(`Undone by you (the decision stays in the record)`);
    setVerdict(null);
  };

  useGSAP(() => {
    if (!verdict || !stamp.current || prefersReducedMotion()) return;
    gsap.fromTo(stamp.current, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power4.out" });
  }, { dependencies: [verdict], scope: root });

  // Y / C / N while this section is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const r = root.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      const k = e.key.toLowerCase();
      if (k === "y") decide("tiger");
      else if (k === "c") decide("leopard (corrected)");
      else if (k === "n") decide("not an animal");
      else if (k === "u") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section id="stage-4" ref={root} aria-labelledby="decide-title" className="px-4 py-20 md:px-10 md:py-28">
      <StageTitle id="decide-title" milestone="4">People decide</StageTitle>
      <p className="mt-4 max-w-[60ch] text-[18px] text-on-board-dim">
        The model was not sure about this frame, so it waits for a person. Decide it yourself. Every decision is
        added to a record that cannot be rewritten, and even an undo is a new entry.
      </p>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Plate className="relative">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded bg-check px-2 py-0.5 text-[13px] font-semibold text-on-check">Needs a person</span>
            <Synthetic className="!text-[#4e5f53]" />
          </div>
          <p className="mt-2 text-[22px] leading-tight font-semibold">Animal, not identified <span className="tabular text-[#4e5f53]">0.55</span></p>
          <p className="mt-1 text-[14px] text-[#3f4f44]">Below 0.6: the species model's best guess is too weak to trust.</p>
          <div className="relative mt-3">
            <StripeFrame seed={41} label="Synthetic frame waiting for review" tilt={-12} />
            {verdict && (
              <div ref={stamp} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-6 rounded-[8px] border-[5px] border-board bg-on-board/90 px-5 py-2 text-center text-[clamp(1.4rem,3vw,2rem)] leading-none font-bold tracking-wide text-board uppercase shadow-[0_6px_18px_-6px_rgb(0_0_0/0.5)]">
                <span className="block text-[12px] tracking-normal normal-case">Decided by a person</span>
                {verdict}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[["Y", "Tiger", "tiger"], ["C", "Correct: leopard", "leopard (corrected)"], ["N", "Not an animal", "not an animal"]].map(([k, text, v]) => (
              <button key={k} type="button" disabled={Boolean(verdict)} onClick={() => decide(v)}
                className="rounded-[8px] border-2 border-board px-3 py-1.5 text-[15px] font-semibold text-board hover:bg-board hover:text-on-board disabled:opacity-40">
                {text} <kbd className="ml-1">{k}</kbd>
              </button>
            ))}
            <button type="button" disabled={!verdict} onClick={undo}
              className="rounded-[8px] px-3 py-1.5 text-[15px] text-[#3f4f44] underline disabled:opacity-30">
              Undo <kbd className="ml-1">U</kbd>
            </button>
          </div>
        </Plate>

        <div>
          <p className="text-[15px] font-semibold">The audit trail</p>
          <p className="mt-1 max-w-[52ch] text-[14px] text-on-board-dim">
            Each entry stores the fingerprint (SHA-256) of the one before it, so changing any old entry breaks every link
            after it. These fingerprints are computed in your browser right now.
          </p>
          <ol className="mt-4 grid gap-2" aria-live="polite">
            {chain.map((l, i) => (
              <li key={l.hash} className="grid grid-cols-[auto_1fr] items-center gap-3">
                <span aria-hidden className={clsx("grid size-8 place-items-center rounded-full border-2 text-[12px] font-bold",
                  i === chain.length - 1 ? "border-check text-check" : "border-on-board/60 text-on-board-dim")}>{i + 1}</span>
                <div className="rounded-[8px] bg-black/25 px-3 py-2">
                  <p className="text-[15px]">{l.action}</p>
                  <p className="font-[ui-monospace,monospace] text-[11px] break-all text-on-board-dim">
                    links to {l.prev.slice(0, 10)}… · sha256 {l.hash.slice(0, 18)}…
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Privacy: whole-body blur, rounded coordinates, audited views. */
export function PrivacySection() {
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
      <span className="tabular">
        {whole}.{frac[0]}
        {frac.slice(1).split("").map((d, i) => <span key={i} data-drop className="drop-digit">{d}</span>)}
      </span>
    );
  };
  return (
    <section ref={root} aria-labelledby="privacy-title" className="px-4 py-20 md:px-10 md:py-28">
      <Board>
        <h2 id="privacy-title" className="board-title text-[clamp(2.2rem,5.5vw,3.8rem)] uppercase">Privacy is built in</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Plate>
            <p className="text-[18px] font-semibold">Whole bodies are blurred</p>
            <div className="mt-3 overflow-hidden rounded-[6px] bg-[#59625c]">
              <svg viewBox="0 0 300 150" className="block w-full" role="img" aria-label="A person-shaped region, blurred">
                <defs><filter id="privacy-blur"><feGaussianBlur stdDeviation="9" /></filter></defs>
                <rect width="300" height="150" fill="#59625c" />
                {/* Always blurred: privacy never waits for an animation. */}
                <g filter="url(#privacy-blur)">
                  <rect x="120" y="22" width="56" height="118" rx="26" fill="#2f3431" />
                  <circle cx="148" cy="22" r="17" fill="#2f3431" />
                  <rect x="90" y="96" width="110" height="10" fill="#c9cfc8" />
                </g>
                <rect data-person-box x="104" y="6" width="90" height="140" fill="none" stroke="#c8372d" strokeWidth="3" strokeDasharray="500" />
                <text x="108" y="144" fill="#f5f6f1" fontSize="11" fontFamily="Mukta, sans-serif">person 0.93 · blurred</text>
              </svg>
            </div>
            <p className="mt-3 text-[14px] text-[#3f4f44]">
              People are blurred from head to toe in every copy anyone sees. No face is ever detected or recognised,
              and originals are never served.
            </p>
          </Plate>
          <Plate>
            <p className="text-[18px] font-semibold">Tiger locations stay vague</p>
            <dl data-coords className="mt-4 grid gap-3 text-[15px]">
              <div><dt className="text-[13px] text-[#4e5f53]">An admin sees</dt><dd className="tabular text-[20px] font-semibold">22.34567, 80.61234</dd></div>
              <div><dt className="text-[13px] text-[#4e5f53]">Everyone else sees</dt><dd className="text-[20px] font-semibold">{digits("22.34567")}, {digits("80.61234")}</dd></div>
            </dl>
            <p className="mt-3 text-[14px] text-[#3f4f44]">Rounded to 0.1 degree, about 11 km, in every screen, export and API answer.</p>
          </Plate>
          <Plate>
            <p className="text-[18px] font-semibold">Looking is recorded too</p>
            <p className="mt-3 text-[15px] text-[#3f4f44]">
              Only reviewers and rangers may open a frame with people in it, and every such view is written to the
              audit trail with their name. Each person sees only their own reserves.
            </p>
          </Plate>
        </div>
      </Board>
    </section>
  );
}

const REASONS = [
  { text: "2 people in the frame (estimated count)", points: 2 },
  { text: "At night, after sunset at this camera", points: 3 },
  { text: "Camera in a core zone", points: 3 },
];

/** Section 6: risk is points with reasons, read as a triage order. */
export function RiskSection() {
  const root = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(prefersReducedMotion() ? REASONS.length : 0);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    REASONS.forEach((_, i) => {
      gsap.timeline({ scrollTrigger: { trigger: root.current, start: `top+=${120 + i * 90} 70%`, onEnter: () => setShown((n) => Math.max(n, i + 1)), onLeaveBack: () => setShown(i) } });
    });
  }, { scope: root });
  const total = REASONS.slice(0, shown).reduce((s, r) => s + r.points, 0);
  const level = total >= 8 ? "HIGH" : total >= 4 ? "MEDIUM" : "LOW";
  return (
    <section ref={root} aria-labelledby="risk-title" className="px-4 py-20 md:px-10 md:py-28">
      <h2 id="risk-title" className="board-title text-[clamp(2.2rem,5.5vw,3.8rem)] uppercase">Poaching risk, with reasons</h2>
      <p className="mt-4 max-w-[60ch] text-[18px] text-on-board-dim">
        When people or vehicles appear, each reason adds points. The level is a triage order for rangers, not a
        prediction, and a person's “false alarm” dismisses it.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="grid content-start gap-3">
          {REASONS.map((r, i) => (
            <li key={r.text} className={clsx("transition-[opacity,transform] duration-[var(--duration-board)] ease-[var(--ease-board)]",
              i < shown ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-30")}>
              <Plate className="flex items-center justify-between gap-4 !py-3">
                <span className="text-[16px]">{r.text}</span>
                <span className="tabular text-[20px] font-bold">+{r.points}</span>
              </Plate>
            </li>
          ))}
        </ol>
        <Plate tone={level === "HIGH" ? "alarm" : level === "MEDIUM" ? "check" : "enamel"} className="self-start">
          <p className="text-[14px] font-semibold opacity-80">Synthetic example</p>
          <p className="board-title mt-1 text-[clamp(3rem,7vw,4.5rem)]">{level}</p>
          <p className="tabular text-[18px] font-semibold">{total} points</p>
          <div className="mt-4 grid grid-cols-3 text-[12px] font-semibold">
            {(["LOW", "MEDIUM", "HIGH"] as const).map((z, i) => (
              <span key={z} aria-current={z === level ? "true" : undefined}
                className={clsx("border-t-4 pt-1", z === level ? "border-current" : "border-current/30 opacity-70")}>
                {z} {["0–3", "4–7", "8+"][i]}
              </span>
            ))}
          </div>
        </Plate>
      </div>
    </section>
  );
}

/** Section 10.5: stripes are compared; a person names the tiger. */
export function IdentitySection() {
  return (
    <section aria-labelledby="id-title" className="px-4 py-20 md:px-10 md:py-28">
      <h2 id="id-title" className="board-title text-[clamp(2.2rem,5.5vw,3.8rem)] uppercase">Which tiger is this?</h2>
      <p className="mt-4 max-w-[62ch] text-[18px] text-on-board-dim">
        Every tiger's stripes are its own. VanDrishti compares a new sighting with tigers people have already named and
        suggests the closest. The model never names a tiger: a person confirms the match or creates a new tiger.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <Plate>
          <p className="text-[13px] font-semibold text-[#4e5f53]">New sighting</p>
          <div className="mt-2"><StripeFrame seed={23} label="New sighting's stripe pattern" tilt={2} /></div>
        </Plate>
        <Plate>
          <p className="text-[13px] font-semibold text-[#4e5f53]">Named tiger T-07 · similarity <span className="tabular">0.93</span></p>
          <div className="mt-2"><StripeFrame seed={23} label="T-07's stripe pattern, very similar" tilt={-3} /></div>
          <p className="mt-2 rounded bg-check px-2 py-1 text-[14px] font-semibold text-on-check">Possible match: a person checks</p>
        </Plate>
        <Plate>
          <p className="text-[13px] font-semibold text-[#4e5f53]">Named tiger T-12 · similarity <span className="tabular">0.41</span></p>
          <div className="mt-2"><StripeFrame seed={58} label="T-12's stripe pattern, different" /></div>
          <p className="mt-2 rounded bg-[#e3e7df] px-2 py-1 text-[14px] font-semibold">Unlike this sighting</p>
        </Plate>
      </div>
      <p className="mt-4 text-[14px] text-on-board-dim">
        Synthetic patterns. Measured: top-1 0.974 on ATRW with near-duplicate frames excluded, which is optimistic (zoo
        footage of Amur tigers the model was most likely trained on). Not yet tested on Indian reserves.
      </p>
    </section>
  );
}

const NOTICES = [
  { tone: "alarm" as const, title: "HIGH poaching risk at camera S-07", body: "23:10 · 3 reasons · sent to the rangers' webhook, signed" },
  { tone: "enamel" as const, title: "Weekly report", body: "PDF and Excel · species, cameras, tigers, events, with every caveat" },
  { tone: "enamel" as const, title: "camtrap-dp.zip", body: "The TDWG standard package for GBIF · people never exported" },
  { tone: "check" as const, title: "GET /v1/observations", body: "Read-only API for forest-department systems · one key per reserve" },
];

/** Section 11: what the work turns into. */
export function OutcomesSection() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo("[data-notice]", { rotate: -5, y: -12, opacity: 0.3 }, {
      rotate: 0, y: 0, opacity: 1, stagger: 0.12, duration: 0.7, ease: "expo.out", transformOrigin: "50% 0%",
      scrollTrigger: { trigger: root.current, start: "top 65%" },
    });
  }, { scope: root });
  return (
    <section id="stage-5" ref={root} aria-labelledby="act-title" className="px-4 py-20 md:px-10 md:py-28">
      <StageTitle id="act-title" milestone="5">On the notice board</StageTitle>
      <p className="mt-4 max-w-[60ch] text-[18px] text-on-board-dim">
        Decisions become alerts for rangers, reports for officials, and data other systems can use.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {NOTICES.map((n) => (
          <div key={n.title} data-notice className="relative pt-3">
            <span aria-hidden className="absolute top-0 left-1/2 z-10 size-3 -translate-x-1/2 rounded-full bg-[#15170f] ring-2 ring-on-board/60" />
            <Plate tone={n.tone} className="h-full">
              <p className="text-[18px] leading-tight font-semibold">{n.title}</p>
              <p className="mt-2 text-[14px] opacity-85">{n.body}</p>
            </Plate>
          </div>
        ))}
      </div>
    </section>
  );
}

const SECTIONS = [
  "Camera network", "Ingestion", "Raw storage", "Preprocessing", "AI pipeline", "People, vehicles and risk",
  "Confidence routing", "Human review and audit", "Central database", "Analytics and identities", "Alerts, reports, API",
];

/** The engineering deep-dive for technical readers. */
export function EngineeringSection() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo("[data-arch]", { opacity: 0.25 }, {
      opacity: 1, stagger: 0.08, duration: 0.4, ease: "power1.out",
      scrollTrigger: { trigger: "[data-arch-list]", start: "top 70%" },
    });
  }, { scope: root });
  return (
    <section ref={root} aria-labelledby="eng-title" className="px-4 py-20 md:px-10 md:py-28">
      <Board>
        <h2 id="eng-title" className="board-title text-[clamp(2.2rem,5.5vw,3.8rem)] uppercase">How it is built</h2>
        <p className="mt-3 max-w-[64ch] text-[17px] text-on-board-dim">
          Eleven parts, built and tested one at a time on an 8 GB laptop with pretrained models only. One model is in
          memory at a time; the API never loads one.
        </p>
        <ol data-arch-list className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((s, i) => (
            <li key={s} data-arch className="flex items-center gap-3 rounded-[8px] bg-black/20 px-3 py-2">
              <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-on-board text-[13px] font-bold text-board">{i + 1}</span>
              <span className="text-[15px]">{s}</span>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-[20px] font-semibold">Models and their licences</h3>
            <table className="mt-3 w-full text-left text-[14px]">
              <thead className="text-on-board-dim"><tr><th className="py-1 pr-3 font-normal">Model</th><th className="py-1 pr-3 font-normal">Job</th><th className="py-1 font-normal">Licence</th></tr></thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.name} className="border-t border-on-board/20 align-top">
                    <td className="py-2 pr-3 font-semibold">{m.name}</td><td className="py-2 pr-3">{m.job}</td><td className="py-2">{m.licence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-[20px] font-semibold">Measured, with caveats</h3>
            <ul className="mt-3 grid gap-3">
              {MEASURED.map((m) => (
                <li key={m.what} className="rounded-[8px] bg-black/20 px-3 py-2">
                  <p className="text-[14px] text-on-board-dim">{m.what}</p>
                  <p className="text-[16px] font-semibold">{m.value}</p>
                  <p className="text-[13px] text-on-board-dim">{m.caveat}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-8 text-[14px] text-on-board-dim">
          Stack: Python 3.11, FastAPI, PostgreSQL with PostGIS, FAISS; React, TypeScript, three.js and GSAP for this page.
          Sign-in with roles, a hash-chained audit trail, signed alerts, verified backups.
        </p>
      </Board>
    </section>
  );
}

export function CloseSection() {
  return (
    <section aria-labelledby="close-title" className="px-4 pt-10 pb-24 text-center md:px-10">
      <p id="close-title" className="board-title text-[clamp(2.6rem,7vw,5rem)] uppercase">AI proposes. People decide.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a href="/app" className="rounded-[10px] bg-on-board px-5 py-2.5 text-[17px] font-semibold text-board shadow-[0_3px_0_rgb(0_0_0/0.35)] hover:bg-white">Sign in to the console</a>
        <a href="#hero-title" className="rounded-[10px] border-2 border-on-board/70 px-5 py-2.5 text-[17px] font-semibold hover:bg-on-board/10">Back to the top</a>
      </div>
      <p className="mt-10 text-[13px] text-on-board-dim">
        VanDrishti (वनदृष्टि, “forest sight”). Examples marked synthetic are illustrations; measured numbers come from
        public test data, and no Indian reserve has validated this system yet.
      </p>
    </section>
  );
}
