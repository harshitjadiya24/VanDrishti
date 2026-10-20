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
  reviewer: string;
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
export interface IdentityDecision { action: "same" | "new" | "not_tiger"; reviewer: string; individual_id?: string; code?: string; name?: string }
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

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
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
  reserves: () => request<Reserve[]>("/reserves"),
  routingSummary: (reserve?: string) => request<RouteCount[]>(`/routing/summary${qs({ reserve })}`),
  runRouting: (reserve?: string) => request<Record<string, number>>(`/routing/run${qs({ reserve })}`, { method: "POST" }),
  counts: (reserve?: string) => request<Record<QueueKind, number>>(`/review/counts${qs({ reserve })}`),
  queue: (kind: QueueKind, reserve?: string) => request<QueueItem[]>(`/review/queue${qs({ kind, reserve, limit: 100 })}`),
  review: (body: ReviewIn) => request<ReviewOut>("/reviews", { method: "POST", body: JSON.stringify(body) }),
  undo: (id: string, reviewer: string) =>
    request<ReviewOut>(`/reviews/${id}/undo`, { method: "POST", body: JSON.stringify({ reviewer }) }),
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
  trends: (reserve: string | undefined, period: "day" | "week") => request<Trends>(`/dashboard/trends${qs({ reserve, period })}`),
  proposals: (reserve?: string) => request<Proposal[]>(`/identity/proposals${qs({ reserve, limit: 200 })}`),
  decideIdentity: (id: string, body: IdentityDecision) =>
    request<Proposal>(`/identity/proposals/${id}/decide`, { method: "POST", body: JSON.stringify(body) }),
  undoIdentity: (id: string, reviewer: string) =>
    request<Proposal>(`/identity/proposals/${id}/undo`, { method: "POST", body: JSON.stringify({ reviewer }) }),
  individuals: (reserve?: string) => request<Individual[]>(`/identity/individuals${qs({ reserve })}`),
  sightings: (id: string) => request<Sighting[]>(`/identity/individuals/${id}/sightings`),
  similarTigers: (reserve?: string) => request<{ a: string; b: string; similarity: number }[]>(`/identity/similar${qs({ reserve })}`),
  cropUrl: (embeddingId: string) => `/api/identity/embeddings/${embeddingId}/crop`,
  displayUrl: (id: string) => `/api/images/${id}/display`,
  maskUrl: (id: string) => `/api/images/${id}/mask`,
};
