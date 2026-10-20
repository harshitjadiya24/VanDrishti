import clsx from "clsx";
import { api, type QueueItem } from "../api";

const BOX_COLOUR: Record<string, string> = { animal: "#e7ece9", person: "#e5585c", vehicle: "#e3a33b" };

/** The display copy (already blurred for people/vehicles), numbered boxes, optional SAM outline. */
export function FrameView({ item, showMask }: { item: QueueItem; showMask: boolean }) {
  const maskUrl = api.maskUrl(item.image_id);
  return (
    <figure className="m-0">
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
          {item.boxes.map((b, i) => (
            <rect key={i} x={b.box[0]} y={b.box[1]} width={b.box[2]} height={b.box[3]} fill="none"
              stroke={BOX_COLOUR[b.category] ?? "#fff"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {item.boxes.map((b, i) => (
          <span
            key={i}
            aria-hidden
            className={clsx("pointer-events-none absolute px-1 text-[11px] font-semibold leading-4",
              b.category === "person" ? "bg-alarm text-white" : b.category === "vehicle" ? "bg-amber text-black" : "bg-ink text-black")}
            style={{ left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`, transform: b.box[1] > 0.05 ? "translateY(-100%)" : undefined }}
          >
            {i + 1} {b.category} {b.confidence.toFixed(2)}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-panel px-3 py-2 text-[12px] text-dim">
        <span>Camera <b className="font-medium text-ink">{item.camera}</b></span>
        <span>{localTime(item.captured_at, item.timezone)}</span>
        <span>{item.boxes.length} box{item.boxes.length === 1 ? "" : "es"}</span>
        {item.route === "people_vehicles" && <span className="text-alarm">People/vehicles blurred</span>}
        {item.quality_flags.filter((f) => f !== "night_ir").map((f) => (
          <span key={f} className="rounded border border-line px-1.5">{f.replace(/_/g, " ")}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/** A capture time in the reserve's own time zone (camera clocks are local), with the zone named. */
export function localTime(iso: string | null, timeZone: string): string {
  if (!iso) return "time unknown";
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return `${when} (${timeZone})`;
}
