import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { DURATION, EASE_BOARD } from "../../motion/tokens";
import { localTime } from "../../lib/time";
import { api, type QueueItem } from "../../lib/api";

const BOX_COLOUR: Record<string, string> = { animal: "#ffb45e", person: "#ff6b6e", vehicle: "#ff6b6e" };

/** The display copy (already blurred for people/vehicles), numbered boxes, optional SAM outline. */
export function FrameView({ item, showMask }: { item: QueueItem; showMask: boolean }) {
  const maskUrl = api.maskUrl(item.image_id);
  const reduce = useReducedMotion();
  return (
    <figure className="m-0 overflow-hidden rounded-[12px] bg-panel shadow-[var(--shadow-plate)]">
      <div className="relative overflow-hidden bg-black">
        <img
          src={api.displayUrl(item.image_id)}
          alt={`Camera ${item.camera}${item.label ? `, model says ${item.label}` : ""}`}
          className="block h-auto w-full"
        />
        {showMask && item.has_mask && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-amber/45"
            style={{ maskImage: `url(${maskUrl})`, WebkitMaskImage: `url(${maskUrl})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskMode: "luminance" }}
          />
        )}
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {/* Each box draws itself on, the detector's mark being made; reduced motion shows it whole. */}
          {item.boxes.map((b, i) => (
            <motion.rect key={`${item.image_id}-${i}`} x={b.box[0]} y={b.box[1]} width={b.box[2]} height={b.box[3]} fill="none"
              stroke={BOX_COLOUR[b.category] ?? "#fff"} strokeWidth={2.5} vectorEffect="non-scaling-stroke"
              pathLength={1} strokeDasharray="1"
              initial={reduce ? false : { strokeDashoffset: 1 }} animate={{ strokeDashoffset: 0 }}
              transition={{ duration: DURATION.board * 1.4, ease: EASE_BOARD, delay: 0.08 * i }} />
          ))}
        </svg>
        {item.boxes.map((b, i) => (
          <span
            key={i}
            aria-hidden
            className={clsx("pointer-events-none absolute px-1 text-[11px] font-semibold leading-4",
              b.category === "animal" ? "bg-check text-on-check" : "bg-[#cc3640] text-white")}
            style={{ left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`, transform: b.box[1] > 0.05 ? "translateY(-100%)" : undefined }}
          >
            {i + 1} {b.category} {b.confidence.toFixed(2)}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[13px] text-dim">
        <span>Camera <b className="font-medium text-ink">{item.camera}</b></span>
        <span>{localTime(item.captured_at, item.timezone)}</span>
        <span>{item.boxes.length} box{item.boxes.length === 1 ? "" : "es"}</span>
        {item.route === "people_vehicles" && <span className="font-semibold text-alarm">People and vehicles blurred</span>}
        {item.quality_flags.filter((f) => f !== "night_ir").map((f) => (
          <span key={f} className="rounded border border-line px-1.5">{f.replace(/_/g, " ")}</span>
        ))}
      </figcaption>
    </figure>
  );
}
