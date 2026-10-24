import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { TrapStrip } from "../../design/TrapStrip";
import { api, type QueueItem } from "../../lib/api";
import { localTime, stripTime } from "../../lib/time";
import { DURATION, EASE_OUT } from "../../motion/tokens";

// Proposals waiting to be judged are warm; people and vehicles are crimson.
const BOX_COLOUR: Record<string, string> = { animal: "#ffc94a", person: "#ff5a68", vehicle: "#ff5a68" };

/** The display copy (already blurred for people/vehicles), numbered boxes, optional SAM outline,
 * and the camera's own data strip. */
export function FrameView({ item, showMask }: { item: QueueItem; showMask: boolean }) {
  const maskUrl = api.maskUrl(item.image_id);
  const reduce = useReducedMotion();
  const night = item.quality_flags.includes("night_ir");
  return (
    <figure className="m-0 overflow-hidden rounded-[var(--radius-card)] border border-edge bg-black">
      <div className="relative overflow-hidden">
        <img
          src={api.displayUrl(item.image_id)}
          alt={`Camera ${item.camera}${item.label ? `, model says ${item.label}` : ""}`}
          className="block h-auto max-h-[calc(100dvh-16rem)] w-full object-contain"
        />
        {showMask && item.has_mask && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-settled/40"
            style={{ maskImage: `url(${maskUrl})`, WebkitMaskImage: `url(${maskUrl})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskMode: "luminance" }}
          />
        )}
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {/* Each box draws itself on, the detector's mark being made; reduced motion shows it whole. */}
          {item.boxes.map((b, i) => (
            <motion.rect key={`${item.image_id}-${i}`} x={b.box[0]} y={b.box[1]} width={b.box[2]} height={b.box[3]} fill="none"
              stroke={BOX_COLOUR[b.category] ?? "#fff"} strokeWidth={2} vectorEffect="non-scaling-stroke"
              pathLength={1} strokeDasharray="1"
              initial={reduce ? false : { strokeDashoffset: 1 }} animate={{ strokeDashoffset: 0 }}
              transition={{ duration: DURATION.slow * 1.6, ease: EASE_OUT, delay: 0.08 * i }} />
          ))}
        </svg>
        {item.boxes.map((b, i) => (
          <span key={i} aria-hidden
            className={clsx("data pointer-events-none absolute px-1.5 py-px text-[10.5px] font-semibold",
              b.category === "animal" ? "bg-heat-5 text-[#160a02]" : "bg-danger text-on-danger")}
            style={{ left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`, transform: b.box[1] > 0.05 ? "translateY(-100%)" : undefined }}>
            {i + 1} {b.category} {b.confidence.toFixed(2)}
          </span>
        ))}
      </div>
      <TrapStrip camera={`CAM ${item.camera}`} time={stripTime(item.captured_at, item.timezone)} mode={night ? "IR" : "DAY"}
        extra={`${item.boxes.length} box${item.boxes.length === 1 ? "" : "es"}`} />
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge bg-surface px-3.5 py-2.5 text-[12.5px] text-fg-2">
        <span>{localTime(item.captured_at, item.timezone)}</span>
        {item.route === "people_vehicles" && (
          <span className="inline-flex items-center gap-1.5 font-medium text-danger">
            <span aria-hidden className="size-1.5 rounded-full bg-danger" />People and vehicles blurred
          </span>
        )}
        {item.quality_flags.filter((f) => f !== "night_ir").map((f) => (
          <span key={f} className="rounded-full border border-edge px-2 py-px">{f.replace(/_/g, " ")}</span>
        ))}
      </figcaption>
    </figure>
  );
}
