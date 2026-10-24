import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, BarChart3, MapPin } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, PageHeader, Plate, Segmented, Skeleton, StatTile } from "../../design/kit";
import { api, type MapCamera } from "../../lib/api";
import { useSession } from "../../lib/session";
import { localTime } from "../../lib/time";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import { RiskBadge } from "../risk/RiskBadge";

/** Overview, camera map, camera analytics, trends. */
export function DashboardScreen() {
  const { reserve } = useSession();
  const r = reserve || undefined;
  const overview = useQuery({ queryKey: ["overview", reserve], queryFn: () => api.overview(r) });
  const map = useQuery({ queryKey: ["camera-map", reserve], queryFn: () => api.cameraMap(r) });
  const [cameraId, setCameraId] = useState<string | null>(null);
  const o = overview.data;
  const all = [...(map.data?.cameras ?? []), ...(map.data?.without_location ?? [])];
  return (
    <div className="grid gap-8">
      <PageHeader title="Reserve overview">
        Counts are frames, not individual animals. Species counts use only labels a person gave or the model was
        confident enough to auto-accept; frames still waiting for a person are counted separately.
      </PageHeader>
      {overview.error && <p role="alert" className="text-danger">{String(overview.error)}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section aria-labelledby="map-h" className="grid min-w-0 content-start gap-3">
          <h2 id="map-h" className="sr-only">Camera map</h2>
          {!map.data && !map.error && <Skeleton className="aspect-[16/10] w-full" />}
          {map.data && <CameraMap cameras={map.data.cameras} selected={cameraId} onSelect={setCameraId} />}
          {map.data && map.data.without_location.length > 0 && (
            <p className="text-[12.5px] text-fg-3">
              Not on the map (no coordinates registered): {map.data.without_location.map((c) => c.code).join(", ")}.
              Add them with <code className="data rounded-[4px] bg-surface-2 px-1 text-[11px] whitespace-nowrap">vandrishti camera add --lat --lon</code>.
            </p>
          )}
        </section>

        <section aria-labelledby="overview-h" className="grid content-start gap-3">
          <h2 id="overview-h" className="sr-only">Overview</h2>
          {!o && !overview.error && <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
          {o && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Images" value={o.images} note={`${o.cameras_active} of ${o.cameras} cameras active`} />
                <StatTile label="Animal frames" value={o.screen.animal} tone="check"
                  note={`${o.animal_images_settled} settled, ${o.animal_images_unsettled} waiting for a person`} />
                <StatTile label="Tiger frames" value={o.tiger_images}
                  note={`${o.named_tigers} named tiger${o.named_tigers === 1 ? "" : "s"}, ${o.open_identity_proposals} identity checks open`} />
                <StatTile label="People or vehicle events" value={o.people_vehicle_events} tone="alarm"
                  note={`${o.risk_levels.high} high, ${o.risk_levels.medium} medium, ${o.risk_levels.low} low risk`} />
              </div>
              {o.top_species.length > 0 && (
                <Plate className="p-4">
                  <p className="text-[12.5px] text-fg-2">{o.species_count} species or groups. Most frames:</p>
                  <SpeciesBars species={o.top_species.slice(0, 6)} />
                </Plate>
              )}
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="cams-h" className="grid gap-3">
        <h2 id="cams-h" className="text-[16px] font-semibold">Cameras</h2>
        <Plate className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead className="text-[12px] text-fg-3">
              <tr className="border-b border-edge">
                <th className="px-4 py-3 font-medium">Camera</th>
                <th className="px-4 py-3 text-right font-medium">Images</th>
                <th className="px-4 py-3 text-right font-medium">Animal frames</th>
                <th className="px-4 py-3 text-right font-medium">Tiger frames</th>
                <th className="px-4 py-3 text-right font-medium">People/vehicle events</th>
                <th className="px-4 py-3 font-medium">Worst risk</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => (
                <tr key={c.id} className={clsx("border-t border-edge transition-colors first:border-t-0", cameraId === c.id ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                  <td className="px-4 py-2">
                    <button type="button" aria-pressed={cameraId === c.id} onClick={() => setCameraId(c.id)}
                      className="min-h-11 text-left font-medium underline-offset-4 hover:underline md:min-h-9">
                      <span className="data text-[12px]">{c.code}</span> <span className="text-[12px] font-normal text-fg-3">{c.reserve}{c.status !== "active" ? `, ${c.status}` : ""}</span>
                    </button>
                  </td>
                  <td className="data px-4 py-2 text-right text-[12px]">{c.images}</td>
                  <td className="data px-4 py-2 text-right text-[12px]">{c.animal_images}</td>
                  <td className="data px-4 py-2 text-right text-[12px]">{c.tiger_images}</td>
                  <td className="data px-4 py-2 text-right text-[12px]">{c.people_vehicle_events}</td>
                  <td className="px-4 py-2">{c.worst_risk ? <RiskBadge level={c.worst_risk} /> : <span className="text-[12.5px] text-fg-3">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Plate>
        <AnimatePresence mode="wait" initial={false}>
          {cameraId && <CameraPanel key={cameraId} id={cameraId} />}
        </AnimatePresence>
      </section>

      <TrendsSection reserve={r} />
    </div>
  );
}

function SpeciesBars({ species }: { species: { label: string; images: number }[] }) {
  const max = Math.max(...species.map((s) => s.images), 1);
  return (
    <ul className="mt-3 grid gap-2">
      {species.map((s) => (
        <li key={s.label} className="grid grid-cols-[minmax(0,110px)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate">{s.label}</span>
          <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-fg-2" style={{ width: `${(s.images / max) * 100}%` }} />
          </span>
          <span className="data text-[11px] text-fg-2">{s.images}</span>
        </li>
      ))}
    </ul>
  );
}

const RISK_HEAT = { high: "#ff5a68", medium: "#f7931e", low: "#9aa3b5" } as const;
const NONE = "#7cc7e8";

/** Cameras placed by their coordinates on a survey grid, glowing on the thermal scale: no map
 * tiles, nothing sent to a third party. */
export function CameraMap({ cameras, selected, onSelect }: { cameras: MapCamera[]; selected: string | null; onSelect: (id: string) => void }) {
  const reduce = useReducedMotion();
  if (cameras.length === 0) {
    return (
      <EmptyState icon={<MapPin size={20} />} title="No camera has coordinates yet">
        The map places cameras by their registered latitude and longitude, and never guesses a position.
      </EmptyState>
    );
  }
  const lats = cameras.map((c) => c.latitude as number);
  const lons = cameras.map((c) => c.longitude as number);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const spanLat = Math.max(maxLat - minLat, 0.01);
  const spanLon = Math.max(maxLon - minLon, 0.01);
  const W = 720, H = 440, pad = 48;
  const x = (lon: number) => pad + ((lon - minLon) / spanLon) * (W - 2 * pad);
  const y = (lat: number) => H - pad - ((lat - minLat) / spanLat) * (H - 2 * pad);
  const maxImages = Math.max(...cameras.map((c) => c.images), 1);
  return (
    <figure className="m-0 overflow-hidden rounded-[var(--radius-card)] border border-edge bg-[#07090b]" aria-label="Camera map">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${cameras.length} cameras by location`}>
        <defs>
          {[...Object.entries(RISK_HEAT), ["none", NONE] as const].map(([k, c]) => (
            <radialGradient key={k} id={`heat-${k}`}>
              <stop offset="0" stopColor={c} stopOpacity="0.85" />
              <stop offset="0.45" stopColor={c} stopOpacity="0.32" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {/* The survey grid of the camera layout: relative positions, not a base map. */}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * (W / 12)} x2={(i + 1) * (W / 12)} y1={0} y2={H} stroke="#1a1d22" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} y1={(i + 1) * (H / 8)} y2={(i + 1) * (H / 8)} x1={0} x2={W} stroke="#1a1d22" />
        ))}
        {cameras.map((c, i) => {
          const r = 10 + 26 * Math.sqrt(c.images / maxImages);
          const cx = x(c.longitude as number), cy = y(c.latitude as number);
          const on = selected === c.id;
          const key = c.worst_risk ?? "none";
          const colour = c.worst_risk ? RISK_HEAT[c.worst_risk] : NONE;
          const label = `${c.code}: ${c.images} images, ${c.tiger_images} tiger frames, ${c.people_vehicle_events} people/vehicle events`;
          return (
            <motion.g key={c.id} role="button" tabIndex={0} aria-label={label} aria-pressed={on}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }}
              className="cursor-pointer outline-none [&:focus-visible>circle.core]:stroke-[#ffb23d] [&:focus-visible>circle.core]:stroke-[3]"
              initial={reduce ? false : { opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: reduce ? 0 : Math.min(i * 0.04, 0.6) }}>
              <title>{label}</title>
              <circle cx={cx} cy={cy} r={r * 2.2} fill={`url(#heat-${key})`} />
              {c.worst_risk === "high" && <circle className="pulse-ring" cx={cx} cy={cy} r={r * 0.6} fill="none" stroke={colour} strokeWidth={2} />}
              <circle className="core" cx={cx} cy={cy} r={on ? 6 : 4.5} fill={c.tiger_images > 0 ? "#fff3cf" : colour} stroke={on ? "#edeef0" : "#07090b"} strokeWidth={on ? 2.5 : 1.5} />
              {(on || cameras.length <= 14) && (
                <text x={cx + 9} y={cy - 9} fontSize={11} fontWeight={on ? 700 : 500} fill="#c9ced6" fontFamily="Martian Mono Variable, monospace">{c.code}</text>
              )}
            </motion.g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 border-t border-edge bg-surface px-4 py-2.5 text-[12px] text-fg-2">
        <span>Glow size: images.</span>
        <span>Colour: worst open risk (crimson high, orange medium, grey low, cold blue none).</span>
        <span>White-hot centre: tiger frames.</span>
        <span>Pulsing ring: an open high-risk event.</span>
        <span>Positions are relative; there is no base map.</span>
      </figcaption>
    </figure>
  );
}

function CameraPanel({ id }: { id: string }) {
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ["camera-detail", id], queryFn: () => api.cameraDetail(id) });
  const d = q.data;
  return (
    <motion.div initial={reduce ? false : { opacity: 0.001, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}>
      {!d ? <Skeleton className="h-56" /> : (
        <Plate as="article" className="grid gap-4 p-5" aria-label={`Camera ${d.code}`}>
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="wide text-[28px]">{d.code}</h3>
            <span className="text-[13px] text-fg-2">
              {d.images} images; {d.first_capture ? `${localTime(d.first_capture, d.timezone)} to ${localTime(d.last_capture, d.timezone)}` : "no reliable capture times"}
            </span>
          </div>
          <p className="text-[13.5px] text-fg-2">
            {d.species.length ? d.species.map((s) => `${s.label} (${s.images})`).join(", ") : "No settled species yet."}
            {d.people_vehicle_events > 0 && ` ${d.people_vehicle_events} people/vehicle events, ${d.night_events} at night.`}
          </p>
          <HourChart all={d.hourly_animal_images} tiger={d.hourly_tiger_images} timezone={d.timezone} />
          {d.untimed_animal_images > 0 && (
            <p className="text-[12.5px] text-fg-3">{d.untimed_animal_images} animal frames left out: their time came only from the file date.</p>
          )}
        </Plate>
      )}
    </motion.div>
  );
}

export function HourChart({ all, tiger, timezone }: { all: number[]; tiger: number[]; timezone: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(...all, 1);
  if (all.every((n) => n === 0)) return <p className="text-[13.5px] text-fg-2">No animal frames with reliable times.</p>;
  const bar = (n: number, h: number, fill: string) => (
    <motion.rect x={h * 20 + 3} width={14} rx={2} fill={fill}
      initial={reduce ? false : { y: 100, height: 0 }} animate={{ y: 100 - (n / max) * 90, height: (n / max) * 90 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: reduce ? 0 : h * 0.015 }} />
  );
  return (
    <figure className="m-0 grid gap-1.5">
      <svg viewBox="0 0 480 120" className="w-full max-w-2xl" role="img" aria-label="Animal frames by hour of day">
        {/* Night hours, shaded: a reading aid in the reserve's own clock. */}
        <rect x={0} y={0} width={6 * 20} height={100} fill="var(--surface-2)" />
        <rect x={19 * 20} y={0} width={5 * 20} height={100} fill="var(--surface-2)" />
        {all.map((n, h) => (
          <g key={h}>
            <title>{`${String(h).padStart(2, "0")}:00: ${n} animal frames, ${tiger[h]} tiger`}</title>
            {bar(n, h, "var(--mark)")}
            {bar(tiger[h], h, "var(--color-heat-4)")}
            {h % 6 === 0 && <text x={h * 20 + 3} y={115} fontSize={9.5} fill="var(--fg-3)" fontFamily="Martian Mono Variable, monospace">{String(h).padStart(2, "0")}:00</text>}
          </g>
        ))}
      </svg>
      <figcaption className="text-[12px] text-fg-3">
        Animal frames by hour ({timezone}); tiger frames in orange. Shaded: 19:00 to 06:00, a reading aid, not this camera's sunset.
      </figcaption>
    </figure>
  );
}

function TrendsSection({ reserve }: { reserve?: string }) {
  const [period, setPeriod] = useState<"day" | "week">("week");
  const q = useQuery({ queryKey: ["trends", reserve, period], queryFn: () => api.trends(reserve, period) });
  const t = q.data;
  const buckets = t?.buckets.slice(-40) ?? [];
  const max = Math.max(...buckets.map((b) => Math.max(b.animal_images, b.people_vehicle_events)), 1);
  return (
    <section aria-labelledby="trends-h" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="trends-h" className="flex-1 text-[16px] font-semibold">Trends</h2>
        <Segmented label="Period" value={period} onChange={setPeriod}
          options={[{ value: "day", label: "By day" }, { value: "week", label: "By week" }]} />
      </div>
      {!t && !q.error && <Skeleton className="h-48" />}
      {t && buckets.length === 0 && (
        <EmptyState icon={<BarChart3 size={20} />} title="No settled frames with reliable times yet">
          Trends use only frames with a camera or manifest time, and only labels that are settled.
        </EmptyState>
      )}
      {buckets.length > 0 && (
        <Plate className="overflow-x-auto p-4">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="text-[12px] text-fg-3">
              <tr>
                <th className="py-1.5 text-left font-medium">{period === "week" ? "Week of" : "Day"}</th>
                <th className="py-1.5 text-left font-medium">Animal frames (tiger in orange)</th>
                <th className="py-1.5 text-right font-medium">People/vehicle events</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start} title={Object.entries(b.by_species).filter(([, n]) => n).map(([s, n]) => `${s}: ${n}`).join(", ")}>
                  <td className="data py-1 pr-3 text-[11px] text-fg-2">{b.start}</td>
                  <td className="py-1">
                    <div className="flex h-3 items-center gap-2">
                      <div className="relative h-2.5 overflow-hidden rounded-full bg-mark/50 transition-[width] duration-500" style={{ width: `${(b.animal_images / max) * 70}%` }}>
                        <div className="absolute inset-y-0 left-0 bg-heat-4" style={{ width: b.animal_images ? `${(b.tiger_images / b.animal_images) * 100}%` : 0 }} />
                      </div>
                      <span className="data text-[11px]">{b.animal_images}</span>
                    </div>
                  </td>
                  <td className={clsx("data py-1 text-right text-[11px]", b.people_vehicle_events > 0 && "font-semibold text-danger")}>{b.people_vehicle_events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Plate>
      )}
      {t && (
        <p className="text-[12.5px] text-fg-3">
          {t.species.length > 0 && `Most frequent: ${t.species.join(", ")} (hover a row for the split). `}
          {t.untimed_animal_images + t.untimed_people_vehicle_events > 0 &&
            `Left out (time only from the file date): ${t.untimed_animal_images} animal frames, ${t.untimed_people_vehicle_events} people/vehicle events. `}
          {(t.buckets.length > 40) && `Showing the last 40 of ${t.buckets.length} ${period}s.`}
        </p>
      )}
      <Link to="/app/identity" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] font-medium underline decoration-edge-strong underline-offset-4 hover:decoration-fg md:min-h-8">
        Identity checks waiting: tiger identities <ArrowRight size={14} aria-hidden />
      </Link>
    </section>
  );
}
