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
  displayUrl: (id: string) => `/api/images/${id}/display`,
  maskUrl: (id: string) => `/api/images/${id}/mask`,
};
