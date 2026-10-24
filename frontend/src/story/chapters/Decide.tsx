// Stage 4: the visitor is the person who decides. A decision cools the frame from hot (needs a
// person) to settled, and every decision, and every undo, is chained into an audit trail whose
// SHA-256 fingerprints are computed in the browser.

import clsx from "clsx";
import { Check, PenLine, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Kbd, StageBadge } from "../../design/primitives";
import { isPlainKey } from "../../lib/keys";
import { gsap, prefersReducedMotion, useGSAP } from "../scroll";
import { Card, Chapter, sha256, StripeFrame, Synthetic } from "../ui";

interface Link { action: string; hash: string; prev: string }

const CHOICES = [
  { key: "Y", text: "Tiger", value: "tiger", icon: Check },
  { key: "C", text: "Correct: leopard", value: "leopard (corrected)", icon: PenLine },
  { key: "N", text: "Not an animal", value: "not an animal", icon: X },
] as const;

export function DecideChapter() {
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

  // The decision lands: the stamp presses in while the heat drains from the frame.
  useGSAP(() => {
    if (!verdict || !stamp.current || prefersReducedMotion()) return;
    gsap.fromTo(stamp.current, { scale: 1.25, opacity: 0, filter: "blur(6px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.42, ease: "expo.out" });
  }, { dependencies: [verdict], scope: root });

  // Y / C / N / U while this chapter is on screen and nobody is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e)) return;
      const r = root.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      const k = e.key.toLowerCase();
      const c = CHOICES.find((x) => x.key.toLowerCase() === k);
      if (c) decide(c.value);
      else if (k === "u") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Chapter id="stage-4" stage="4" strip="people decide" sectionRef={root} title="People decide"
      lede="The model was not sure about this frame, so it waits for a person. Decide it yourself. Every decision is added to a record that cannot be rewritten, and even an undo is a new entry.">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <Card tone={verdict ? "plain" : "hot"} className="transition-[border-color,box-shadow] duration-[var(--duration-slow)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {verdict ? <StageBadge stage="done" /> : <StageBadge stage="uncertain" />}
            <Synthetic />
          </div>
          <p className="wide mt-4 text-[clamp(1.6rem,2.6vw,2.2rem)]">
            Animal, not identified <span className="data text-[0.6em] tracking-normal" style={{ color: "var(--color-heat-5)" }}>0.55</span>
          </p>
          <p className="mt-1 text-[14px] text-fg-2">Below 0.6: the species model's best guess is too weak to trust.</p>
          <div className="relative mt-4 overflow-hidden rounded-[10px] border border-edge">
            <StripeFrame seed={41} label="Synthetic frame waiting for review" tilt={-12}
              className={clsx("transition-[filter] duration-[var(--duration-slow)]", verdict ? "" : "sepia-[0.35] saturate-150")} />
            {verdict && (
              <div ref={stamp} className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-[10px] border border-settled/70 bg-black/80 px-5 py-3 text-center backdrop-blur-sm">
                <span className="data block text-[10px] tracking-[0.08em] text-settled uppercase">decided by a person</span>
                <span className="wide mt-1 block text-[clamp(1.4rem,3vw,2rem)] text-[#edeef0]">{verdict}</span>
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {CHOICES.map((c) => (
              <Button key={c.key} tone="quiet" disabled={Boolean(verdict)} onClick={() => decide(c.value)}>
                <c.icon size={16} aria-hidden />{c.text} <Kbd>{c.key}</Kbd>
              </Button>
            ))}
            <Button tone="ghost" disabled={!verdict} onClick={undo}>
              <Undo2 size={16} aria-hidden />Undo <Kbd>U</Kbd>
            </Button>
          </div>
        </Card>

        <div>
          <h3 className="text-[17px] font-semibold">The audit trail</h3>
          <p className="mt-1 max-w-[52ch] text-[14px] text-fg-2">
            Each entry stores the fingerprint (SHA-256) of the one before it, so changing any old entry breaks every link
            after it. These fingerprints are computed in your browser right now.
          </p>
          <ol className="relative mt-6 grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-edge-strong" aria-live="polite">
            {chain.map((l, i) => {
              const last = i === chain.length - 1;
              return (
                <li key={l.hash} className="relative grid grid-cols-[32px_1fr] items-start gap-3">
                  <span aria-hidden className={clsx("data relative z-10 mt-1.5 grid size-8 place-items-center rounded-full border text-[11px]",
                    last ? "border-heat-5 bg-black text-heat-5 shadow-[0_0_12px_-2px_rgb(255_201_74/0.6)]" : "border-edge-strong bg-surface text-fg-2")}>{i + 1}</span>
                  <div className="rounded-[10px] border border-edge bg-surface px-3.5 py-2.5">
                    <p className="text-[14.5px]">{l.action}</p>
                    <p className="data mt-1 text-[10.5px] break-all text-fg-3">
                      links to {l.prev.slice(0, 10)}… · sha256 {l.hash.slice(0, 18)}…
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Chapter>
  );
}
