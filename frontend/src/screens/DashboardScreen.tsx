import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router";
import { MapPin } from "lucide-react";
import { api, type MapCamera } from "../api";
import { EmptyState, StatTile } from "../components/kit";
import { localTime } from "../components/FrameView";
import { RiskBadge } from "../components/RiskBadge";
import { useSession } from "../context";

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
      <header>
        <h1 className="text-[24px] font-semibold">Reserve dashboard</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-dim">
          Counts are frames, not individual animals. Species counts use only labels a person gave or the
          model was confident enough to auto-accept; frames still waiting for a person are counted separately.
        </p>
      </header>
      {overview.error && <p role="alert" className="text-alarm">{String(overview.error)}</p>}

      {o && (
        <section aria-labelledby="overview-h" className="grid gap-3">
          <h2 id="overview-h" className="text-[16px] font-medium">Overview</h2>
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
            <p className="text-[13px] text-dim">
              {o.species_count} species or groups. Most frames: {o.top_species.slice(0, 6).map((s) => `${s.label} (${s.images})`).join(", ")}.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="map-h" className="grid gap-3">
        <h2 id="map-h" className="text-[16px] font-medium">Camera map</h2>
        {map.data && <CameraMap cameras={map.data.cameras} selected={cameraId} onSelect={setCameraId} />}
        {map.data && map.data.without_location.length > 0 && (
          <p className="text-[13px] text-dim">
            Not on the map (no coordinates registered): {map.data.without_location.map((c) => c.code).join(", ")}.
            Add them with <code className="kbd">vandrishti camera add --lat --lon</code>.
          </p>
        )}
      </section>

      <section aria-labelledby="cams-h" className="grid gap-3">
        <h2 id="cams-h" className="text-[16px] font-medium">Cameras</h2>
        <div className="overflow-x-auto rounded-md bg-panel">
          <table className="w-full min-w-[620px] text-left text-[14px]">
            <thead className="text-[12px] text-dim">
              <tr>
                <th className="px-3 py-2 font-normal">Camera</th>
                <th className="px-3 py-2 text-right font-normal">Images</th>
                <th className="px-3 py-2 text-right font-normal">Animal frames</th>
                <th className="px-3 py-2 text-right font-normal">Tiger frames</th>
                <th className="px-3 py-2 text-right font-normal">People/vehicle events</th>
                <th className="px-3 py-2 font-normal">Worst risk</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => (
                <tr key={c.id} className={clsx("border-t border-line", cameraId === c.id && "bg-raised")}>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setCameraId(c.id)} className="text-left hover:text-amber">
                      {c.code} <span className="text-[12px] text-dim">{c.reserve}{c.status !== "active" ? `, ${c.status}` : ""}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.images}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.animal_images}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.tiger_images}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.people_vehicle_events}</td>
                  <td className="px-3 py-2">{c.worst_risk ? <RiskBadge level={c.worst_risk} /> : <span className="text-dim">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cameraId && <CameraPanel id={cameraId} />}
      </section>

      <TrendsSection reserve={r} />
    </div>
  );
}


const RISK_FILL = { high: "var(--color-alarm)", medium: "var(--color-amber)", low: "var(--color-dim)" } as const;

/** Cameras placed by their coordinates on a plain grid: no map tiles, nothing sent to a third party. */
export function CameraMap({ cameras, selected, onSelect }: { cameras: MapCamera[]; selected: string | null; onSelect: (id: string) => void }) {
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
  const W = 640, H = 360, pad = 30;
  const x = (lon: number) => pad + ((lon - minLon) / spanLon) * (W - 2 * pad);
  const y = (lat: number) => H - pad - ((lat - minLat) / spanLat) * (H - 2 * pad);
  const maxImages = Math.max(...cameras.map((c) => c.images), 1);
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-panel" role="img"
        aria-label={`${cameras.length} cameras by location`}>
        {cameras.map((c) => {
          const r = 5 + 11 * Math.sqrt(c.images / maxImages);
          return (
            <g key={c.id} onClick={() => onSelect(c.id)} className="cursor-pointer">
              <title>{`${c.code}: ${c.images} images, ${c.tiger_images} tiger frames, ${c.people_vehicle_events} people/vehicle events`}</title>
              <circle cx={x(c.longitude as number)} cy={y(c.latitude as number)} r={r}
                fill={c.worst_risk ? RISK_FILL[c.worst_risk] : "var(--color-sky)"} fillOpacity={0.35}
                stroke={selected === c.id ? "var(--color-ink)" : "var(--color-line)"} strokeWidth={selected === c.id ? 2 : 1} />
              {c.tiger_images > 0 && <circle cx={x(c.longitude as number)} cy={y(c.latitude as number)} r={3} fill="var(--color-amber)" />}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[12px] text-dim">
        Circle size: images. Colour: worst open risk (red high, amber medium, grey low, blue none). A dot in the
        middle: tiger frames. Positions are relative; there is no base map.
      </figcaption>
    </figure>
  );
}

function CameraPanel({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["camera-detail", id], queryFn: () => api.cameraDetail(id) });
  const d = q.data;
  if (!d) return null;
  return (
    <article className="grid gap-3 rounded-md bg-panel p-4" aria-label={`Camera ${d.code}`}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-[16px] font-medium">Camera {d.code}</h3>
        <span className="text-[13px] text-dim">
          {d.images} images; {d.first_capture ? `${localTime(d.first_capture, d.timezone)} to ${localTime(d.last_capture, d.timezone)}` : "no reliable capture times"}
        </span>
      </div>
      <p className="text-[13px] text-dim">
        {d.species.length ? d.species.map((s) => `${s.label} (${s.images})`).join(", ") : "No settled species yet."}
        {d.people_vehicle_events > 0 && ` ${d.people_vehicle_events} people/vehicle events, ${d.night_events} at night.`}
      </p>
      <HourChart all={d.hourly_animal_images} tiger={d.hourly_tiger_images} timezone={d.timezone} />
      {d.untimed_animal_images > 0 && (
        <p className="text-[12px] text-dim">{d.untimed_animal_images} animal frames left out: their time came only from the file date.</p>
      )}
    </article>
  );
}

export function HourChart({ all, tiger, timezone }: { all: number[]; tiger: number[]; timezone: string }) {
  const max = Math.max(...all, 1);
  if (all.every((n) => n === 0)) return <p className="text-[13px] text-dim">No animal frames with reliable times.</p>;
  return (
    <figure className="grid gap-1">
      <svg viewBox="0 0 480 120" className="w-full max-w-xl" role="img" aria-label="Animal frames by hour of day">
        {all.map((n, h) => (
          <g key={h}>
            <title>{`${String(h).padStart(2, "0")}:00: ${n} animal frames, ${tiger[h]} tiger`}</title>
            <rect x={h * 20 + 2} y={100 - (n / max) * 90} width={16} height={(n / max) * 90} fill="var(--color-sky)" fillOpacity={0.6} />
            <rect x={h * 20 + 2} y={100 - (tiger[h] / max) * 90} width={16} height={(tiger[h] / max) * 90} fill="var(--color-amber)" />
            {h % 6 === 0 && <text x={h * 20 + 2} y={115} fontSize={10} fill="var(--color-dim)">{String(h).padStart(2, "0")}:00</text>}
          </g>
        ))}
      </svg>
      <figcaption className="text-[12px] text-dim">Animal frames by hour ({timezone}); tiger frames in amber.</figcaption>
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
        <h2 id="trends-h" className="flex-1 text-[16px] font-medium">Trends</h2>
        <div role="group" aria-label="Period" className="flex gap-1">
          {(["day", "week"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
              className={clsx("h-8 rounded-md border px-3 text-[13px]", period === p ? "border-amber text-ink" : "border-line text-dim")}>
              By {p}
            </button>
          ))}
        </div>
      </div>
      {t && buckets.length === 0 && <p className="text-[14px] text-dim">No settled frames with reliable times yet.</p>}
      {buckets.length > 0 && (
        <div className="overflow-x-auto rounded-md bg-panel p-3">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="text-[12px] text-dim">
              <tr>
                <th className="py-1 text-left font-normal">{period === "week" ? "Week of" : "Day"}</th>
                <th className="py-1 text-left font-normal">Animal frames (tiger in amber)</th>
                <th className="py-1 text-right font-normal">People/vehicle events</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start} title={Object.entries(b.by_species).filter(([, n]) => n).map(([s, n]) => `${s}: ${n}`).join(", ")}>
                  <td className="py-0.5 pr-3 tabular-nums text-dim">{b.start}</td>
                  <td className="py-0.5">
                    <div className="flex h-3 items-center gap-2">
                      <div className="relative h-3 bg-sky/50" style={{ width: `${(b.animal_images / max) * 70}%` }}>
                        <div className="absolute inset-y-0 left-0 bg-amber" style={{ width: b.animal_images ? `${(b.tiger_images / b.animal_images) * 100}%` : 0 }} />
                      </div>
                      <span className="tabular-nums">{b.animal_images}</span>
                    </div>
                  </td>
                  <td className={clsx("py-0.5 text-right tabular-nums", b.people_vehicle_events > 0 && "text-alarm")}>{b.people_vehicle_events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {t && (
        <p className="text-[12px] text-dim">
          {t.species.length > 0 && `Most frequent: ${t.species.join(", ")} (hover a row for the split). `}
          {t.untimed_animal_images + t.untimed_people_vehicle_events > 0 &&
            `Left out (time only from the file date): ${t.untimed_animal_images} animal frames, ${t.untimed_people_vehicle_events} people/vehicle events. `}
          {(t.buckets.length > 40) && `Showing the last 40 of ${t.buckets.length} ${period}s.`}
        </p>
      )}
      <p className="text-[12px] text-dim">
        Identity checks waiting: <Link to="/app/identity" className="text-amber underline-offset-4 hover:underline">tiger identities</Link>.
      </p>
    </section>
  );
}
