import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from "react-router";

// The story site is public and makes no API calls; its chunk (with GSAP and Lenis) loads
// only when someone opens "/". The console is its own chunk too (src/console.ts), so a
// story visitor never downloads it.
const StoryPage = lazy(() => import("./story/StoryPage"));

type Console = typeof import("./console");
const screen = (pick: (m: Console) => ComponentType) => async () => ({ Component: pick(await import("./console")) });

const CONSOLE = ["dashboard", "alerts", "reports", "identity", "tigers", "routing", "review", "risk", "feedback", "audit"];

/** Links from before the console moved under /app keep working. */
function LegacyRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/app${pathname}${search}`} replace />;
}

export const routes: RouteObject[] = [
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
    lazy: screen((m) => m.Shell),
    HydrateFallback: () => <div className="min-h-dvh bg-base" />,
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", lazy: screen((m) => m.DashboardScreen) },
      { path: "pipeline", lazy: screen((m) => m.PipelineScreen) },
      { path: "alerts", lazy: screen((m) => m.AlertsScreen) },
      { path: "reports", lazy: screen((m) => m.ReportsScreen) },
      { path: "identity", lazy: screen((m) => m.IdentityScreen) },
      { path: "tigers", lazy: screen((m) => m.TigersScreen) },
      { path: "routing", lazy: screen((m) => m.RoutingScreen) },
      { path: "review/:kind", lazy: screen((m) => m.ReviewScreen) },
      { path: "risk", lazy: screen((m) => m.RiskScreen) },
      { path: "feedback", lazy: screen((m) => m.FeedbackScreen) },
      { path: "audit", lazy: screen((m) => m.AuditScreen) },
    ],
  },
  ...CONSOLE.map((p) => ({ path: `/${p}/*`, element: <LegacyRedirect /> })),
  { path: "*", element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
