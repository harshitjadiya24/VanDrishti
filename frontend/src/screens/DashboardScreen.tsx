import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router";
import { BarChart3, MapPin } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api, type MapCamera } from "../api";
import { EmptyState, PageHeader, Plate, Segmented, Skeleton, StatTile } from "../components/kit";
import { localTime } from "../components/FrameView";
import { RiskBadge } from "../components/RiskBadge";
import { useSession } from "../context";
import { DURATION, EASE_BOARD } from "../motion/tokens";

/** Section 10.1-10.4: overview, camera map, camera analytics, trends. */
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
      <PageHeader title="Reserve dashboard">
        Counts are frames, not individual animals. Species counts use only labels a person gave or the model was
        confident enough to auto-accept; frames still waiting for a person are counted separately.
      </PageHeader>
      {overview.error && <p role="alert" className="text-alarm">{String(overview.error)}</p>}

      <section aria-labelledby="overview-h" className="grid gap-3">
        <h2 id="overview-h" className="text-[18px] font-semibold">Overview</h2>
        {!o && !overview.error && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        )}
        {o && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Images" value={o.images} note={`${o.cameras_active} of ${o.cameras} cameras active`} />
              <StatTile label="Animal frames" value={o.screen.animal}
                note={`${o.animal_images_settled} settled, ${o.animal_images_unsettled} waiting for a person`} />
              <StatTile label="Tiger frames" value={o.tiger_images}
                note={`${o.named_tigers} named tiger${o.named_tigers === 1 ? "" : "s"}, ${o.open_identity_proposals} identity checks open`} />
              <StatTile label="People or vehicle events" value={o.people_vehicle_events} tone="alarm"
                note={`${o.risk_levels.high} high, ${o.risk_levels.medium} medium, ${o.risk_levels.low} low risk`} />
            </div>
            {o.top_species.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="text-dim">{o.species_count} species or groups. Most frames:</span>
                {o.top_species.slice(0, 6).map((s) => (
                  <span key={s.label} className="rounded-[6px] bg-raised px-2 py-0.5">
                    {s.label} <span className="tabular text-dim">{s.images}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="map-h" className="grid gap-3">
        <h2 id="map-h" className="text-[18px] font-semibold">Camera map</h2>
        {!map.data && !map.error && <Skeleton className="aspect-[16/9] w-full" />}
        {map.data && <CameraMap cameras={map.data.cameras} selected={cameraId} onSelect={setCameraId} />}
        {map.data && map.data.without_location.length > 0 && (
          <p className="text-[14px] text-dim">
            Not on the map (no coordinates registered): {map.data.without_location.map((c) => c.code).join(", ")}.
            Add them with <code className="rounded-[4px] bg-raised px-1 text-[13px] whitespace-nowrap">vandrishti camera add --lat --lon</code>.
          </p>
        )}
      </section>

      <section aria-labelledby="cams-h" className="grid gap-3">
        <h2 id="cams-h" className="text-[18px] font-semibold">Cameras</h2>
        <Plate className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[14px]">
            <thead className="text-[13px] text-dim">
              <tr>
                <th className="px-4 py-2.5 font-normal">Camera</th>
                <th className="px-4 py-2.5 text-right font-normal">Images</th>
                <th className="px-4 py-2.5 text-right font-normal">Animal frames</th>
                <th className="px-4 py-2.5 text-right font-normal">Tiger frames</th>
                <th className="px-4 py-2.5 text-right font-normal">People/vehicle events</th>
                <th className="px-4 py-2.5 font-normal">Worst risk</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => (
                <tr key={c.id} className={clsx("border-t border-line", cameraId === c.id && "bg-raised")}>
                  <td className="px-4 py-2">
                    <button type="button" aria-pressed={cameraId === c.id} onClick={() => setCameraId(c.id)}
                      className="text-left font-medium underline-offset-4 hover:underline">
                      {c.code} <span className="text-[13px] font-normal text-dim">{c.reserve}{c.status !== "active" ? `, ${c.status}` : ""}</span>
                    </button>
                  </td>
                  <td className="tabular px-4 py-2 text-right">{c.images}</td>
                  <td className="tabular px-4 py-2 text-right">{c.animal_images}</td>
                  <td className="tabular px-4 py-2 text-right">{c.tiger_images}</td>
                  <td className="tabular px-4 py-2 text-right">{c.people_vehicle_events}</td>
                  <td className="px-4 py-2">{c.worst_risk ? <RiskBadge level={c.worst_risk} /> : <span className="text-dim">none</span>}</td>
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

const RISK_FILL = { high: "var(--color-alarm)", medium: "var(--color-check)", low: "var(--color-dim)" } as const;

/** Cameras placed by their coordinates on a survey grid: no map tiles, nothing sent to a third party. */
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
  const W = 640, H = 360, pad = 36;
  const x = (lon: number) => pad + ((lon - minLon) / spanLon) * (W - 2 * pad);
  const y = (lat: number) => H - pad - ((lat - minLat) / spanLat) * (H - 2 * pad);
  const maxImages = Math.max(...cameras.map((c) => c.images), 1);
  return (
    <Plate as="section" className="grid gap-2 p-3" aria-label="Camera map">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-[8px] bg-raised/60" role="img"
        aria-label={`${cameras.length} cameras by location`}>
        {/* The survey grid: decoration only, not a base map. */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * (W / 10)} x2={(i + 1) * (W / 10)} y1={0} y2={H} stroke="var(--line)" strokeDasharray="2 6" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`h${i}`} y1={(i + 1) * (H / 6)} y2={(i + 1) * (H / 6)} x1={0} x2={W} stroke="var(--line)" strokeDasharray="2 6" />
        ))}
        {cameras.map((c, i) => {
          const r = 6 + 12 * Math.sqrt(c.images / maxImages);
          const cx = x(c.longitude as number), cy = y(c.latitude as number);
          const on = selected === c.id;
          const label = `${c.code}: ${c.images} images, ${c.tiger_images} tiger frames, ${c.people_vehicle_events} people/vehicle events`;
          return (
            <motion.g key={c.id} role="button" tabIndex={0} aria-label={label} aria-pressed={on}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-of-type]:stroke-[var(--color-check)]"
              initial={reduce ? false : { opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              transition={{ duration: DURATION.board, ease: EASE_BOARD, delay: reduce ? 0 : Math.min(i * 0.04, 0.6) }}>
              <title>{label}</title>
              {c.worst_risk === "high" && <circle className="pulse-ring" cx={cx} cy={cy} r={r} fill="none" stroke={RISK_FILL.high} strokeWidth={2} />}
              <circle cx={cx} cy={cy} r={r}
                fill={c.worst_risk ? RISK_FILL[c.worst_risk] : "var(--color-sky)"} fillOpacity={0.4}
                stroke={on ? "var(--color-ink)" : c.worst_risk ? RISK_FILL[c.worst_risk] : "var(--color-sky)"} strokeWidth={on ? 3 : 1.5} />
              {c.tiger_images > 0 && <circle cx={cx} cy={cy} r={3.5} fill="var(--color-ink)" />}
              {(on || cameras.length <= 12) && (
                <text x={cx + r + 4} y={cy + 4} fontSize={12} fontWeight={on ? 700 : 500} fill="var(--color-ink)">{c.code}</text>
              )}
            </motion.g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[13px] text-dim">
        <span>Circle size: images.</span>
        <span>Colour: worst open risk (red high, yellow medium, grey low, blue none).</span>
        <span>Dark centre: tiger frames.</span>
        <span>A pulsing ring: an open high-risk event.</span>
        <span>Positions are relative; there is no base map.</span>
      </figcaption>
    </Plate>
  );
}

function CameraPanel({ id }: { id: string }) {
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ["camera-detail", id], queryFn: () => api.cameraDetail(id) });
  const d = q.data;
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, transition: { duration: DURATION.quick } }}
      transition={{ duration: DURATION.base, ease: EASE_BOARD }}>
      {!d ? <Skeleton className="h-56" /> : (
        <Plate as="article" rivets className="grid gap-3 p-5" aria-label={`Camera ${d.code}`}>
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="board-title text-[30px]">{d.code}</h3>
            <span className="text-[14px] text-dim">
              {d.images} images; {d.first_capture ? `${localTime(d.first_capture, d.timezone)} to ${localTime(d.last_capture, d.timezone)}` : "no reliable capture times"}
            </span>
          </div>
          <p className="text-[14px] text-dim">
            {d.species.length ? d.species.map((s) => `${s.label} (${s.images})`).join(", ") : "No settled species yet."}
            {d.people_vehicle_events > 0 && ` ${d.people_vehicle_events} people/vehicle events, ${d.night_events} at night.`}
          </p>
          <HourChart all={d.hourly_animal_images} tiger={d.hourly_tiger_images} timezone={d.timezone} />
          {d.untimed_animal_images > 0 && (
            <p className="text-[13px] text-dim">{d.untimed_animal_images} animal frames left out: their time came only from the file date.</p>
          )}
        </Plate>
      )}
    </motion.div>
  );
}

export function HourChart({ all, tiger, timezone }: { all: number[]; tiger: number[]; timezone: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(...all, 1);
  if (all.every((n) => n === 0)) return <p className="text-[14px] text-dim">No animal frames with reliable times.</p>;
  const bar = (n: number, h: number, fill: string, opacity?: number) => (
    <motion.rect x={h * 20 + 2} width={16} fill={fill} fillOpacity={opacity}
      initial={reduce ? false : { y: 100, height: 0 }} animate={{ y: 100 - (n / max) * 90, height: (n / max) * 90 }}
      transition={{ duration: DURATION.board, ease: EASE_BOARD, delay: reduce ? 0 : h * 0.015 }} />
  );
  return (
    <figure className="grid gap-1">
      <svg viewBox="0 0 480 120" className="w-full max-w-2xl" role="img" aria-label="Animal frames by hour of day">
        {/* Night hours, shaded: a reading aid in the reserve's own clock. */}
        <rect x={0} y={0} width={6 * 20} height={100} fill="var(--line)" fillOpacity={0.35} />
        <rect x={19 * 20} y={0} width={5 * 20} height={100} fill="var(--line)" fillOpacity={0.35} />
        {all.map((n, h) => (
          <g key={h}>
            <title>{`${String(h).padStart(2, "0")}:00: ${n} animal frames, ${tiger[h]} tiger`}</title>
            {bar(n, h, "var(--color-sky)", 0.6)}
            {bar(tiger[h], h, "var(--color-check)")}
            {h % 6 === 0 && <text x={h * 20 + 2} y={115} fontSize={10} fill="var(--color-dim)">{String(h).padStart(2, "0")}:00</text>}
          </g>
        ))}
      </svg>
      <figcaption className="text-[13px] text-dim">
        Animal frames by hour ({timezone}); tiger frames in yellow. Shaded: 19:00 to 06:00, a reading aid, not this camera's sunset.
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
        <h2 id="trends-h" className="flex-1 text-[18px] font-semibold">Trends</h2>
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
          <table className="w-full min-w-[520px] text-[14px]">
            <thead className="text-[13px] text-dim">
              <tr>
                <th className="py-1 text-left font-normal">{period === "week" ? "Week of" : "Day"}</th>
                <th className="py-1 text-left font-normal">Animal frames (tiger in yellow)</th>
                <th className="py-1 text-right font-normal">People/vehicle events</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start} title={Object.entries(b.by_species).filter(([, n]) => n).map(([s, n]) => `${s}: ${n}`).join(", ")}>
                  <td className="tabular py-0.5 pr-3 text-dim">{b.start}</td>
                  <td className="py-0.5">
                    <div className="flex h-3.5 items-center gap-2">
                      <div className="relative h-3.5 rounded-r-[3px] bg-sky/50 transition-[width] duration-500" style={{ width: `${(b.animal_images / max) * 70}%` }}>
                        <div className="absolute inset-y-0 left-0 bg-check" style={{ width: b.animal_images ? `${(b.tiger_images / b.animal_images) * 100}%` : 0 }} />
                      </div>
                      <span className="tabular">{b.animal_images}</span>
                    </div>
                  </td>
                  <td className={clsx("tabular py-0.5 text-right", b.people_vehicle_events > 0 && "font-semibold text-alarm")}>{b.people_vehicle_events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Plate>
      )}
      {t && (
        <p className="text-[13px] text-dim">
          {t.species.length > 0 && `Most frequent: ${t.species.join(", ")} (hover a row for the split). `}
          {t.untimed_animal_images + t.untimed_people_vehicle_events > 0 &&
            `Left out (time only from the file date): ${t.untimed_animal_images} animal frames, ${t.untimed_people_vehicle_events} people/vehicle events. `}
          {(t.buckets.length > 40) && `Showing the last 40 of ${t.buckets.length} ${period}s.`}
        </p>
      )}
      <p className="text-[13px] text-dim">
        Identity checks waiting: <Link to="/app/identity" className="font-medium text-ink underline underline-offset-4">tiger identities</Link>.
      </p>
    </section>
  );
}
