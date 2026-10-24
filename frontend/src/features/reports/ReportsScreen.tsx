import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Package } from "lucide-react";
import { useState } from "react";
import { api, type ReportPeriod } from "../../lib/api";
import { BUTTON, EmptyState, FIELD, PageHeader, Plate, Segmented, Skeleton } from "../../design/kit";
import { useSession } from "../../lib/session";

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
      <div className="grid gap-6">
        <PageHeader title="Reports and exports" />
        <EmptyState icon={<FileText size={20} />} title="Choose a reserve in the sidebar">Reports are made per reserve.</EmptyState>
      </div>
    );
  }
  const r = preview.data;
  const s = r?.summary;
  const figures = s ? [
    ["Frames with reliable times", s.frames],
    ["Settled animal frames", s.animal_frames_settled],
    ["Waiting for a person", s.animal_frames_unsettled],
    ["Species or groups", s.species],
    ["Tiger frames", s.tiger_frames],
    ["Named tigers seen", s.named_tigers_seen],
    ["People/vehicle events", s.people_vehicle_events],
  ] as const : [];
  return (
    <div className="grid gap-8">
      <PageHeader title="Reports and exports">
        Days follow the reserve's own calendar. Only frames with a camera or manifest time can fall in a period.
        Reports contain no coordinates and no images.
      </PageHeader>

      <section aria-labelledby="report-h" className="grid gap-4">
        <h2 id="report-h" className="text-[18px] font-semibold">Report</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented label="Period" value={period} onChange={setPeriod}
            options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
          <label className="grid gap-1 text-[13px] text-dim">
            A date in the period
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={FIELD} />
          </label>
        </div>
        {preview.error && <p role="alert" className="text-alarm">{String(preview.error)}</p>}
        {!r && !preview.error && <Skeleton className="h-64" />}
        {r && s && (
          // The preview looks like the first page of the report it downloads.
          <Plate as="article" rivets className="grid gap-4 p-6" aria-label="Report preview">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
              <div>
                <p className="text-[13px] text-dim">{reserve} · {period === "weekly" ? "weekly, Monday to Sunday" : period}</p>
                <p className="board-title text-[28px]">{r.period.start === r.period.end ? r.period.start : `${r.period.start} → ${r.period.end}`}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={api.reportUrl(reserve, period, day, "pdf")} className={BUTTON}><FileText size={16} aria-hidden />Download PDF</a>
                <a href={api.reportUrl(reserve, period, day, "xlsx")} className={BUTTON}><FileSpreadsheet size={16} aria-hidden />Download Excel</a>
              </div>
            </div>
            {s.frames === 0 ? (
              <p className="text-[15px] text-dim">Nothing with a reliable time in this period. Try another date.</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  {figures.map(([label, n]) => (
                    <div key={label}>
                      <dt className="text-[13px] text-dim">{label}</dt>
                      <dd className="tabular text-[24px] font-semibold">{String(n)}</dd>
                    </div>
                  ))}
                </dl>
                {r.species.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="text-dim">Species:</span>
                    {r.species.slice(0, 10).map((x) => (
                      <span key={x.label} className="rounded-[6px] bg-raised px-2 py-0.5">{x.label} <span className="tabular text-dim">{x.frames}</span></span>
                    ))}
                  </div>
                )}
              </>
            )}
          </Plate>
        )}
      </section>

      {can("export") && (
        <section aria-labelledby="ctdp-h" className="grid gap-3">
          <h2 id="ctdp-h" className="text-[18px] font-semibold">Camtrap DP export</h2>
          <Plate className="grid gap-4 p-5">
            <p className="max-w-[72ch] text-[15px] text-dim">
              The TDWG standard package for camera-trap data (GBIF can publish it). People and vehicles are never
              exported; coordinates are rounded to 0.1 degree; cameras without coordinates are left out. VanDrishti does
              not record how cameras were placed, so you choose the sampling design.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-[13px] text-dim">
                Sampling design
                <select value={design} onChange={(e) => setDesign(e.target.value)} className={FIELD}>
                  <option value="">Choose…</option>
                  {DESIGNS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              {design ? (
                <a href={api.camtrapUrl(reserve, design)} className={BUTTON}><Package size={16} aria-hidden />Download zip</a>
              ) : (
                <span className="pb-2 text-[14px] text-dim">Choose a sampling design to download.</span>
              )}
            </div>
          </Plate>
        </section>
      )}

      <section aria-labelledby="int-h" className="grid gap-3">
        <h2 id="int-h" className="text-[18px] font-semibold">Integration API</h2>
        <Plate className="grid gap-3 p-5">
          <p className="max-w-[72ch] text-[15px] text-dim">
            Other systems read these with a per-reserve key. An administrator issues keys with{" "}
            <code className="rounded-[4px] bg-raised px-1 text-[13px] whitespace-nowrap">vandrishti apikey create</code>; every call is in the audit trail.
          </p>
          <ul className="flex flex-wrap gap-2">
            {["/v1/summary", "/v1/observations", "/v1/alerts", "/v1/reports", "/v1/camtrap-dp"].map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5 rounded-[6px] bg-raised px-2 py-1 font-mono text-[13px]">
                <Download size={13} aria-hidden className="text-dim" />{p}
              </li>
            ))}
          </ul>
        </Plate>
      </section>
    </div>
  );
}
