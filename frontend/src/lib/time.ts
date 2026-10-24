// Times are always shown in the reserve's own zone (camera clocks are local), never the
// viewer's. Times read from file modification dates are not reliable and are labelled so by
// the caller (`time_source`).

/** A capture time in the reserve's zone, with the zone named: "24 Oct 2026, 22:41 (Asia/Kolkata)". */
export function localTime(iso: string | null, timeZone: string): string {
  if (!iso) return "time unknown";
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return `${when} (${timeZone})`;
}

/** The camera trap's own stamp for a data strip: "24.10.2026 22:41:07", in the reserve's zone. */
export function stripTime(iso: string | null, timeZone: string): string {
  if (!iso) return "time unknown";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
