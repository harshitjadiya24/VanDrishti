import { createBrowserRouter, Navigate } from "react-router";
import { Shell } from "./Shell";
import { AlertsScreen } from "./screens/AlertsScreen";
import { AuditScreen } from "./screens/AuditScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { FeedbackScreen } from "./screens/FeedbackScreen";
import { IdentityScreen, TigersScreen } from "./screens/IdentityScreen";
import { RoutingScreen } from "./screens/RoutingScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { RiskScreen } from "./screens/RiskScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
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
]);
