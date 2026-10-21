// Typed client for the VanDrishti API (proxied at /api).

export type QueueKind = "people_vehicles" | "review" | "uncertain" | "blank" | "quality";
export type Action =
  | "confirm" | "correct" | "not_animal" | "skip"
  | "confirm_people" | "false_alarm" | "quality_ok" | "quality_bad";
export type Severity = "low" | "medium" | "high";

export interface Factor { name: string; factor: number | null; reason: string }
export interface Explanation {
  summary?: string;
  base?: { source: string; score: number };
  factors?: Factor[];
  species_top?: { label: string; taxon: string; score: number }[];
  openclip_top?: { label: string; probability: number }[];
  detector_confidence?: number;
}
export interface QueueItem {
  image_id: string;
  route: string;
  spot_check: boolean;
  reason: string;
  camera: string;
  captured_at: string | null;
  timezone: string;
  quality_flags: string[];
  label: string | null;
  taxon: string | null;
  confidence: number | null;
  explanation: Explanation | null;
  boxes: { category: string; confidence: number; box: [number, number, number, number] }[];
  has_mask: boolean;
  allowed_actions: Action[];
  risk: Risk | null;
}
export interface RiskFactor { name: string; points: number; reason: string }
export interface Risk {
  level: "low" | "medium" | "high";
  score: number;
  dismissed: boolean;
  factors: RiskFactor[];
  people: number;
  vehicles: number;
  vehicle_type: string | null;
  night: boolean;
}
export interface RiskEvent {
  event_id: string;
  camera: string;
  camera_sensitivity: string;
  start_at: string;
  timezone: string;
  people: number;
  vehicles: number;
  vehicle_type: string | null;
  vehicle_type_score: number | null;
  night: boolean;
  night_basis: string;
  level: "low" | "medium" | "high";
  score: number;
  dismissed: boolean;
  factors: RiskFactor[];
  image_ids: string[];
}
export interface RiskSummary {
  events: number;
  levels: Record<"high" | "medium" | "low", number>;
  night_share: number | null;
  dismissed: number;
  cameras: { camera: string; high: number; medium: number; low: number }[];
  note: string;
}
export interface ReviewIn {
  image_id: string;
  action: Action;
  human_label?: string;
  human_taxon?: string;
  poaching_activity?: boolean;
  severity?: Severity | null;
  notes?: string;
}
export interface ReviewOut { id: string; image_id: string; action: Action; model_label: string | null; human_label: string | null; undone: boolean }
export interface RouteCount { route: string; state: string; count: number }
export interface Taxon { common_name: string; taxon: string; level: string; on_reserve_list: boolean }
export interface Reserve { id: string; code: string; name: string; timezone: string; country: string }
export interface Feedback {
  actions: Record<string, number>;
  poaching_marked: number;
  by_band: Record<string, { agreed?: number; changed?: number; agreement: number }>;
  top_corrections: { model: string; human: string; count: number }[];
}
export interface AuditEvent { seq: number; at: string; actor: string; action: string; entity: string; entity_id: string | null; payload: Record<string, unknown> }

export interface Overview {
  images: number;
  cameras: number;
  cameras_active: number;
  first_capture: string | null;
  last_capture: string | null;
  screen: { animal: number; people_vehicles: number; blank: number; not_screened: number };
  animal_images_settled: number;
  animal_images_unsettled: number;
  species_count: number;
  top_species: { label: string; images: number }[];
  tiger_images: number;
  named_tigers: number;
  open_identity_proposals: number;
  people_vehicle_events: number;
  risk_levels: Record<"high" | "medium" | "low", number>;
}
export interface MapCamera {
  id: string;
  code: string;
  reserve: string;
  status: string;
  sensitivity: string;
  latitude: number | null;
  longitude: number | null;
  last_seen_at: string | null;
  images: number;
  animal_images: number;
  tiger_images: number;
  people_vehicle_events: number;
  worst_risk: "high" | "medium" | "low" | null;
}
export interface CameraDetail {
  id: string;
  code: string;
  reserve: string;
  timezone: string;
  status: string;
  sensitivity: string;
  images: number;
  first_capture: string | null;
  last_capture: string | null;
  species: { label: string; images: number }[];
  tiger_images: number;
  hourly_animal_images: number[];
  hourly_tiger_images: number[];
  untimed_animal_images: number;
  people_vehicle_events: number;
  night_events: number;
}
export interface Trends {
  period: "day" | "week";
  species: string[];
  buckets: { start: string; animal_images: number; tiger_images: number; people_vehicle_events: number; by_species: Record<string, number> }[];
  untimed_animal_images: number;
  untimed_people_vehicle_events: number;
}
export interface Candidate { individual_id: string; code: string; similarity: number; example_embedding_id: string }
export interface Proposal {
  id: string;
  kind: "possible_match" | "possible_new";
  state: "open" | "done";
  image_id: string;
  embedding_id: string;
  camera: string;
  reserve: string;
  timezone: string;
  captured_at: string | null;
  best_similarity: number | null;
  threshold: number;
  candidates: Candidate[];
  outcome: string | null;
}
export interface IdentityDecision { action: "same" | "new" | "not_tiger"; individual_id?: string; code?: string; name?: string }
export interface Individual {
  id: string;
  code: string;
  name: string | null;
  sightings: number;
  cameras: number;
  first_seen: string | null;
  last_seen: string | null;
  created_by: string;
}
export interface Sighting { embedding_id: string; image_id: string; camera: string; captured_at: string | null; assigned_by: string | null }

export type AlertState = "open" | "acknowledged" | "resolved";
export interface AlertItem {
  id: string;
  reserve: string;
  timezone: string;
  camera: string | null;
  kind: "tiger_sighting" | "poaching_risk" | "unusual_activity" | "camera_failure";
  severity: "info" | "warning" | "critical";
  state: AlertState;
  title: string;
  detail: { reasons?: string[]; image_ids?: string[]; individuals?: string[]; time_reliable?: boolean; [k: string]: unknown };
  occurred_at: string | null;
  created_at: string;
  acted_by: string | null;
  acted_at: string | null;
  note: string | null;
  webhook: string | null;
}
export interface ReportSummary {
  period: { kind: string; start: string; end: string };
  summary: Record<string, number | Record<string, number>>;
  species: { label: string; frames: number; cameras: number; naive_occupancy: number | null; by_person: number }[];
  tigers: { code: string; sightings: number; cameras: string[] }[];
  caveats: string[];
}
export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface Me {
  username: string;
  display_name: string;
  role: "admin" | "reviewer" | "ranger" | "viewer";
  reserves: string[];
  permissions: string[];
  csrf_token: string;
}

// The session lives in an HttpOnly cookie the page cannot read; writes must also carry the
// CSRF token the server returned at sign-in (or from /auth/me).
let csrfToken = "";
export const setCsrf = (token: string) => { csrfToken = token; };

export interface RouteCount2 { total: number; waiting: number }
export interface Pipeline {
  ingest: { images: number; corrupt: number };
  quality: { pass: number; fail: number; pending: number };
  detect: { animal: number; people_vehicles: number; blank: number; not_screened: number };
  decided: number;
  routes: Record<"auto_accept" | "review" | "uncertain" | "likely_blank" | "people_vehicles" | "quality", RouteCount2>;
  reviews_done: number;
  risk: Record<"high" | "medium" | "low", number>;
  identity: { embedded: number; proposals_open: number; named_tigers: number };
  alerts_open: Record<"critical" | "warning" | "info", number>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const write = (init.method ?? "GET") !== "GET";
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(write && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* not JSON */ }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  me: () => request<Me>("/auth/me"),
  login: (username: string, password: string) =>
    request<Me>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),
  changePassword: (current: string, next: string) =>
    request<{ status: string }>("/auth/password", { method: "POST", body: JSON.stringify({ current, new: next }) }),
  reserves: () => request<Reserve[]>("/reserves"),
  routingSummary: (reserve?: string) => request<RouteCount[]>(`/routing/summary${qs({ reserve })}`),
  runRouting: (reserve?: string) => request<Record<string, number>>(`/routing/run${qs({ reserve })}`, { method: "POST" }),
  counts: (reserve?: string) => request<Record<QueueKind, number>>(`/review/counts${qs({ reserve })}`),
  queue: (kind: QueueKind, reserve?: string) => request<QueueItem[]>(`/review/queue${qs({ kind, reserve, limit: 100 })}`),
  review: (body: ReviewIn) => request<ReviewOut>("/reviews", { method: "POST", body: JSON.stringify(body) }),
  undo: (id: string) => request<ReviewOut>(`/reviews/${id}/undo`, { method: "POST" }),
  taxa: (q: string, reserve?: string) => request<Taxon[]>(`/taxa${qs({ q, reserve })}`),
  feedback: (reserve?: string) => request<Feedback>(`/feedback/stats${qs({ reserve })}`),
  audit: () => request<AuditEvent[]>("/audit/events?limit=200"),
  auditVerify: () => request<{ ok: boolean; events_checked: number; first_broken_seq: number | null }>("/audit/verify"),
  riskEvents: (reserve?: string, level?: string, includeDismissed = false) =>
    request<RiskEvent[]>(`/risk/events${qs({ reserve, level, include_dismissed: includeDismissed ? "true" : undefined })}`),
  riskSummary: (reserve?: string) => request<RiskSummary>(`/risk/summary${qs({ reserve })}`),
  runRisk: (reserve?: string) => request<{ new_events: number }>(`/risk/run${qs({ reserve })}`, { method: "POST" }),
  overview: (reserve?: string) => request<Overview>(`/dashboard/overview${qs({ reserve })}`),
  cameraMap: (reserve?: string) =>
    request<{ cameras: MapCamera[]; without_location: MapCamera[] }>(`/dashboard/map${qs({ reserve })}`),
  cameraDetail: (id: string) => request<CameraDetail>(`/dashboard/cameras/${id}`),
  pipeline: (reserve?: string) => request<Pipeline>(`/dashboard/pipeline${qs({ reserve })}`),
  trends: (reserve: string | undefined, period: "day" | "week") => request<Trends>(`/dashboard/trends${qs({ reserve, period })}`),
  proposals: (reserve?: string) => request<Proposal[]>(`/identity/proposals${qs({ reserve, limit: 200 })}`),
  decideIdentity: (id: string, body: IdentityDecision) =>
    request<Proposal>(`/identity/proposals/${id}/decide`, { method: "POST", body: JSON.stringify(body) }),
  undoIdentity: (id: string) => request<Proposal>(`/identity/proposals/${id}/undo`, { method: "POST" }),
  individuals: (reserve?: string) => request<Individual[]>(`/identity/individuals${qs({ reserve })}`),
  sightings: (id: string) => request<Sighting[]>(`/identity/individuals/${id}/sightings`),
  similarTigers: (reserve?: string) => request<{ a: string; b: string; similarity: number }[]>(`/identity/similar${qs({ reserve })}`),
  alerts: (reserve: string | undefined, state?: AlertState, kind?: string) =>
    request<AlertItem[]>(`/alerts${qs({ reserve, state, kind })}`),
  alertCounts: (reserve?: string) => request<Record<"critical" | "warning" | "info", number>>(`/alerts/counts${qs({ reserve })}`),
  runAlerts: (reserve?: string) => request<{ rules: Record<string, number>; webhook: Record<string, unknown> }>(`/alerts/run${qs({ reserve })}`, { method: "POST" }),
  actAlert: (id: string, action: "acknowledge" | "resolve" | "reopen", note?: string) =>
    request<AlertItem>(`/alerts/${id}/act`, { method: "POST", body: JSON.stringify({ action, note: note || undefined }) }),
  report: (reserve: string, period: ReportPeriod, day: string) =>
    request<ReportSummary>(`/reports/${encodeURIComponent(reserve)}${qs({ period, day, format: "json" })}`),
  reportUrl: (reserve: string, period: ReportPeriod, day: string, format: "pdf" | "xlsx") =>
    `/api/reports/${encodeURIComponent(reserve)}${qs({ period, day, format })}`,
  camtrapUrl: (reserve: string, design: string) =>
    `/api/exports/${encodeURIComponent(reserve)}/camtrap-dp${qs({ sampling_design: design })}`,
  cropUrl: (embeddingId: string) => `/api/identity/embeddings/${embeddingId}/crop`,
  displayUrl: (id: string) => `/api/images/${id}/display`,
  maskUrl: (id: string) => `/api/images/${id}/mask`,
};
