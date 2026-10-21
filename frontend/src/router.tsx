import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router";
import { Shell } from "./Shell";
import { AlertsScreen } from "./screens/AlertsScreen";
import { AuditScreen } from "./screens/AuditScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { FeedbackScreen } from "./screens/FeedbackScreen";
import { IdentityScreen, TigersScreen } from "./screens/IdentityScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { RiskScreen } from "./screens/RiskScreen";
import { RoutingScreen } from "./screens/RoutingScreen";
import { ReviewScreen } from "./screens/ReviewScreen";

// The story site is public and makes no API calls; its chunk (with GSAP and Lenis) loads
// only when someone opens "/".
const StoryPage = lazy(() => import("./story/StoryPage"));

const CONSOLE = ["dashboard", "alerts", "reports", "identity", "tigers", "routing", "review", "risk", "feedback", "audit"];

/** Links from before the console moved under /app keep working. */
function LegacyRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/app${pathname}${search}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={<div className="min-h-dvh bg-board" />}>
        <StoryPage />
      </Suspense>
    ),
  },
  {
    path: "/app",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", element: <DashboardScreen /> },
      { path: "alerts", element: <AlertsScreen /> },
      { path: "reports", element: <ReportsScreen /> },
      { path: "identity", element: <IdentityScreen /> },
      { path: "tigers", element: <TigersScreen /> },
      { path: "routing", element: <RoutingScreen /> },
      { path: "review/:kind", element: <ReviewScreen /> },
      { path: "risk", element: <RiskScreen /> },
      { path: "feedback", element: <FeedbackScreen /> },
      { path: "audit", element: <AuditScreen /> },
    ],
  },
  ...CONSOLE.map((p) => ({ path: `/${p}/*`, element: <LegacyRedirect /> })),
  { path: "*", element: <Navigate to="/" replace /> },
]);
