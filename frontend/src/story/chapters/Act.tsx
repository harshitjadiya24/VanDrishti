// Stage 5.1: what the work turns into, and the engineering appendix, and the close.

import { ArrowRight, Bell, Code2, FileSpreadsheet, Package } from "lucide-react";
import { useRef, type ComponentType } from "react";
import { MEASURED, MODELS } from "../results";
import { gsap, prefersReducedMotion, useGSAP } from "../scroll";
import { Chapter } from "../ui";

type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean; className?: string }>;

const NOTICES: { tone: "danger" | "plain"; icon: Icon; title: string; body: string; meta: string }[] = [
  { tone: "danger", icon: Bell, title: "HIGH poaching risk at camera S‑07", body: "3 reasons · sent to the rangers' webhook, signed", meta: "alert · 23:10 IST" },
  { tone: "plain", icon: FileSpreadsheet, title: "Weekly report", body: "PDF and Excel · species, cameras, tigers, events, with every caveat", meta: "report · weekly" },
  { tone: "plain", icon: Package, title: "camtrap-dp.zip", body: "The TDWG standard package for GBIF · people never exported", meta: "export · camtrap dp 1.0.2" },
  { tone: "plain", icon: Code2, title: "GET /v1/observations", body: "Read-only API for forest-department systems · one key per reserve", meta: "api · v1" },
];

export function ActChapter() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo("[data-notice]", { y: 18, clipPath: "inset(0 0 100% 0)" }, {
      y: 0, clipPath: "inset(0 0 0% 0)", stagger: 0.1, duration: 0.8, ease: "expo.out",
      scrollTrigger: { trigger: root.current, start: "top 65%" },
    });
  }, { scope: root });
  return (
    <Chapter id="act" stage="5.1" strip="on the notice board" sectionRef={root} title="On the notice board"
      lede="Decisions become alerts for rangers, reports for officials, and data other systems can use.">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NOTICES.map((n) => (
          <li key={n.title} data-notice
            className={n.tone === "danger"
              ? "rounded-[var(--radius-card)] border border-danger/60 bg-surface p-5 shadow-[0_18px_40px_-22px_rgb(255_90_104/0.5)]"
              : "rounded-[var(--radius-card)] border border-edge bg-surface p-5"}>
            <n.icon size={20} aria-hidden className={n.tone === "danger" ? "text-danger" : "text-fg-3"} />
            <p className="mt-4 text-[17px] leading-snug font-semibold">{n.title}</p>
            <p className="mt-2 text-[13.5px] text-fg-2">{n.body}</p>
            <p className="data mt-4 text-[10.5px] text-fg-3 uppercase">{n.meta}</p>
          </li>
        ))}
      </ul>
    </Chapter>
  );
}

const PARTS = [
  "Camera network", "Ingestion", "Raw storage", "Preprocessing", "AI pipeline", "People, vehicles and risk",
  "Confidence routing", "Human review and audit", "Central database", "Analytics and identities", "Alerts, reports, API",
];

export function EngineeringChapter() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo("[data-arch]", { y: 12 }, {
      y: 0, stagger: 0.06, duration: 0.6, ease: "expo.out",
      scrollTrigger: { trigger: "[data-arch-list]", start: "top 70%" },
    });
  }, { scope: root });
  return (
    <Chapter id="engineering" strip="how it is built" sectionRef={root} title="How it is built" className="border-t border-edge"
      lede="Eleven parts, built and tested one at a time on an 8 GB laptop with pretrained models only. One model is in memory at a time; the API never loads one.">
      {/* The eleven parts as one flow: each hands its output to the next. */}
      <ol data-arch-list className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PARTS.map((p, i) => (
          <li key={p} data-arch className="flex items-center gap-3 rounded-[10px] border border-edge bg-surface px-3.5 py-3 text-[14.5px] text-fg">
            <span className="data grid size-7 shrink-0 place-items-center rounded-full border border-edge-strong text-[10.5px] text-fg-2">{i + 1}</span>
            <span className="flex-1">{p}</span>
            {i < PARTS.length - 1 && <ArrowRight size={14} aria-hidden className="shrink-0 text-fg-3" />}
          </li>
        ))}
      </ol>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <div>
          <h3 className="text-[19px] font-semibold">Models and their licences</h3>
          <table className="mt-4 w-full text-left text-[14px]">
            <thead className="text-[12.5px] text-fg-3"><tr><th className="py-2 pr-3 font-medium">Model</th><th className="py-2 pr-3 font-medium">Job</th><th className="py-2 font-medium">Licence</th></tr></thead>
            <tbody>
              {MODELS.map((m) => (
                <tr key={m.name} className="border-t border-edge align-top">
                  <td className="py-2.5 pr-3 font-medium">{m.name}</td><td className="py-2.5 pr-3 text-fg-2">{m.job}</td><td className="data py-2.5 text-[11px] text-fg-2">{m.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="text-[19px] font-semibold">Measured, with caveats</h3>
          <ul className="mt-4 grid gap-px overflow-hidden rounded-[12px] border border-edge bg-edge">
            {MEASURED.map((m) => (
              <li key={m.what} className="bg-surface px-4 py-3">
                <p className="text-[13px] text-fg-3">{m.what}</p>
                <p className="mt-0.5 text-[15.5px] font-semibold">{m.value}</p>
                <p className="mt-0.5 text-[12.5px] text-fg-2">{m.caveat}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-10 max-w-[90ch] text-[14px] text-fg-3">
        Stack: Python 3.11, FastAPI, PostgreSQL with PostGIS, FAISS; React, TypeScript, three.js and GSAP for this page.
        Sign-in with roles, a hash-chained audit trail, signed alerts, verified backups.
      </p>
    </Chapter>
  );
}

export function CloseChapter() {
  return (
    <section aria-labelledby="close-title" className="px-5 pt-16 pb-32 md:px-10">
      <div className="mx-auto max-w-[1280px] border-t border-edge pt-16">
        <p id="close-title" className="wide max-w-[14ch] text-[clamp(2.6rem,7vw,5.4rem)]">AI proposes. <span className="text-heat-5">People decide.</span></p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a href="/app" className="inline-flex h-12 items-center rounded-[var(--radius-ctl)] bg-decide px-6 text-[16px] font-medium text-on-decide shadow-[0_8px_24px_-10px_rgb(255_138_61/0.65)] hover:brightness-110">Sign in to the console</a>
          <a href="#hero-title" className="inline-flex h-12 items-center rounded-[var(--radius-ctl)] border border-edge-strong px-6 text-[16px] font-medium hover:bg-surface-2">Back to the top</a>
        </div>
        <p className="mt-12 max-w-[80ch] text-[13px] text-fg-3">
          VanDrishti (<span lang="hi" className="hindi">वनदृष्टि</span>, “forest sight”). Examples marked synthetic are illustrations; measured numbers come from
          public test data, and no Indian reserve has validated this system yet.
        </p>
      </div>
    </section>
  );
}
