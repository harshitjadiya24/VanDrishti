import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type ReportPeriod } from "../api";
import { useSession } from "../context";

const DESIGNS = ["targeted", "opportunistic", "systematicRandom", "simpleRandom", "clusteredRandom", "experimental"];

/** Section 11: reports (PDF/Excel) and the Camtrap DP export. */
export function ReportsScreen() {
  const { reserve, can } = useSession();
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [design, setDesign] = useState("");
  const preview = useQuery({
    queryKey: ["report", reserve, period, day],
    queryFn: () => api.report(reserve, period, day),
    enabled: Boolean(reserve && day),
  });
  if (!reserve) {
    return (
      <div className="grid gap-3">
        <h1 className="text-[24px] font-semibold">Reports and exports</h1>
        <p className="text-dim">Choose a reserve in the sidebar: reports are per reserve.</p>
      </div>
    );
  }
  const r = preview.data;
  const s = r?.summary;
  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-[24px] font-semibold">Reports and exports</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-dim">
          Days follow the reserve's own calendar. Only frames with a camera or manifest time can fall in a period.
          Reports contain no coordinates and no images.
        </p>
      </header>

      <section aria-labelledby="report-h" className="grid gap-3">
        <h2 id="report-h" className="text-[16px] font-medium">Report</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[12px] text-dim">
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
              className="h-9 rounded-md border border-line bg-base px-2 text-[14px] text-ink">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Monday to Sunday)</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] text-dim">
            A date in the period
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="h-9 rounded-md border border-line bg-base px-2 text-[14px] text-ink" />
          </label>
          <a href={api.reportUrl(reserve, period, day, "pdf")} className="flex h-9 items-center rounded-md border border-line px-3 text-[14px] hover:bg-raised">Download PDF</a>
          <a href={api.reportUrl(reserve, period, day, "xlsx")} className="flex h-9 items-center rounded-md border border-line px-3 text-[14px] hover:bg-raised">Download Excel</a>
        </div>
        {preview.error && <p role="alert" className="text-alarm">{String(preview.error)}</p>}
        {r && s && (
          <div className="grid gap-2 rounded-md bg-panel p-4 text-[14px]">
            <div className="font-medium">{r.period.start === r.period.end ? r.period.start : `${r.period.start} to ${r.period.end}`}</div>
            <p className="text-dim">
              {String(s.frames)} frames with reliable times; {String(s.animal_frames_settled)} settled animal frames
              ({String(s.animal_frames_unsettled)} waiting for a person); {String(s.species)} species or groups;
              {" "}{String(s.tiger_frames)} tiger frames, {String(s.named_tigers_seen)} named tigers;
              {" "}{String(s.people_vehicle_events)} people/vehicle events.
            </p>
            {r.species.length > 0 && (
              <p className="text-dim">Species: {r.species.slice(0, 8).map((x) => `${x.label} (${x.frames})`).join(", ")}.</p>
            )}
            {s.frames === 0 && <p className="text-dim">Nothing with a reliable time in this period. Try another date.</p>}
          </div>
        )}
      </section>

      {can("export") && <section aria-labelledby="ctdp-h" className="grid gap-3">
        <h2 id="ctdp-h" className="text-[16px] font-medium">Camtrap DP export</h2>
        <p className="max-w-3xl text-[14px] text-dim">
          The TDWG standard package for camera-trap data (GBIF can publish it). People and vehicles are never exported;
          coordinates are rounded to 0.1 degree; cameras without coordinates are left out. VanDrishti does not record how
          cameras were placed, so you choose the sampling design.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[12px] text-dim">
            Sampling design
            <select value={design} onChange={(e) => setDesign(e.target.value)}
              className="h-9 rounded-md border border-line bg-base px-2 text-[14px] text-ink">
              <option value="">Choose…</option>
              {DESIGNS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          {design ? (
            <a href={api.camtrapUrl(reserve, design)} className="flex h-9 items-center rounded-md border border-line px-3 text-[14px] hover:bg-raised">Download zip</a>
          ) : (
            <span className="text-[13px] text-dim">Choose a sampling design to download.</span>
          )}
        </div>
      </section>}

      <section aria-labelledby="int-h" className="grid gap-2">
        <h2 id="int-h" className="text-[16px] font-medium">Integration API</h2>
        <p className="max-w-3xl text-[14px] text-dim">
          Other systems read <code className="kbd">/v1/summary</code>, <code className="kbd">/v1/observations</code>,{" "}
          <code className="kbd">/v1/alerts</code>, <code className="kbd">/v1/reports</code> and{" "}
          <code className="kbd">/v1/camtrap-dp</code> with a per-reserve key. An administrator issues keys with{" "}
          <code className="kbd">vandrishti apikey create</code>; every call is in the audit trail.
        </p>
      </section>
    </div>
  );
}
