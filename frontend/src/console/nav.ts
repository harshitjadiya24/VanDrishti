// The console's places, in the order of the work: what needs a person first, then what the
// models decided, then insight, then action, then the record. The rail and the ⌘K palette
// both read this list, so they never disagree.

import {
  Activity, Ban, Bell, Eye, FileText, Fingerprint, HelpCircle, LayoutDashboard, PawPrint, ScrollText,
  ShieldAlert, Signpost, Siren, Sparkles, Workflow, type LucideIcon,
} from "lucide-react";
import type { QueueKind } from "../lib/api";

export type Heat = "neutral" | "check" | "alarm";

export const QUEUES: { kind: QueueKind; label: string; icon: LucideIcon; tone: Heat; perm: string }[] = [
  { kind: "people_vehicles", label: "People & vehicles", icon: ShieldAlert, tone: "alarm", perm: "review_people" },
  { kind: "review", label: "To review", icon: Eye, tone: "check", perm: "review_species" },
  { kind: "uncertain", label: "Uncertain", icon: HelpCircle, tone: "check", perm: "review_species" },
  { kind: "blank", label: "Likely blank (sample)", icon: Ban, tone: "neutral", perm: "review_species" },
  { kind: "quality", label: "Quality", icon: Sparkles, tone: "neutral", perm: "review_species" },
];

export interface NavItem { to: string; label: string; icon: LucideIcon; perm: string; count?: number; tone?: Heat; heat?: string; keywords?: string }
export interface NavGroup { title: string; items: NavItem[] }

export function buildNav(counts: Partial<Record<QueueKind, number>> | undefined, urgentAlerts: number, can: (p: string) => boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { title: "Needs a person", items: [
      ...QUEUES.map((q) => ({ to: `/app/review/${q.kind}`, label: q.label, icon: q.icon, perm: q.perm, count: counts?.[q.kind], tone: q.tone,
        // Uncertain frames run hotter than the review band: the less sure the model, the hotter.
        heat: q.kind === "uncertain" ? "var(--color-heat-6)" : q.kind === "review" ? "var(--color-heat-4)" : undefined,
        keywords: "queue review frames" })),
      { to: "/app/identity", label: "Tiger identities", icon: Fingerprint, perm: "view", keywords: "re-id stripes match" },
      { to: "/app/alerts", label: "Alerts", icon: Bell, perm: "view", count: urgentAlerts, tone: "alarm", keywords: "warnings rangers" },
    ] },
    { title: "Insight", items: [
      { to: "/app/dashboard", label: "Overview", icon: LayoutDashboard, perm: "view", keywords: "dashboard map trends cameras" },
      { to: "/app/tigers", label: "Named tigers", icon: PawPrint, perm: "view", keywords: "individuals sightings" },
      { to: "/app/risk", label: "Poaching risk", icon: Siren, perm: "view", keywords: "events people vehicles" },
      { to: "/app/feedback", label: "Feedback", icon: Activity, perm: "view", keywords: "corrections accuracy" },
    ] },
    { title: "Pipeline", items: [
      { to: "/app/pipeline", label: "The road, live", icon: Workflow, perm: "view", keywords: "stages models" },
      { to: "/app/routing", label: "Routing", icon: Signpost, perm: "view", keywords: "thresholds routes" },
    ] },
    { title: "Records", items: [
      { to: "/app/reports", label: "Reports & exports", icon: FileText, perm: "view", keywords: "pdf excel camtrap" },
      { to: "/app/audit", label: "Audit trail", icon: ScrollText, perm: "view_audit", keywords: "log hash chain" },
    ] },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length > 0);
}
