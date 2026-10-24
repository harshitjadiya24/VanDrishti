// The signed-in console in one chunk: the story page never downloads it. Routes import
// from here lazily (router.tsx), so the first console route loads every screen at once.
export { Shell } from "./Shell";
export { AlertsScreen } from "../features/alerts/AlertsScreen";
export { AuditScreen } from "../features/audit/AuditScreen";
export { DashboardScreen } from "../features/dashboard/DashboardScreen";
export { FeedbackScreen } from "../features/feedback/FeedbackScreen";
export { IdentityScreen, TigersScreen } from "../features/identity/IdentityScreen";
export { PipelineScreen } from "../features/pipeline/PipelineScreen";
export { ReportsScreen } from "../features/reports/ReportsScreen";
export { RiskScreen } from "../features/risk/RiskScreen";
export { RoutingScreen } from "../features/routing/RoutingScreen";
export { ReviewScreen } from "../features/review/ReviewScreen";
