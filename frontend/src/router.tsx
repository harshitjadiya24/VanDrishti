import { createBrowserRouter, Navigate } from "react-router";
import { Shell } from "./Shell";
import { AuditScreen } from "./screens/AuditScreen";
import { FeedbackScreen } from "./screens/FeedbackScreen";
import { RoutingScreen } from "./screens/RoutingScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { RiskScreen } from "./screens/RiskScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/routing" replace /> },
      { path: "routing", element: <RoutingScreen /> },
      { path: "review/:kind", element: <ReviewScreen /> },
      { path: "risk", element: <RiskScreen /> },
      { path: "feedback", element: <FeedbackScreen /> },
      { path: "audit", element: <AuditScreen /> },
    ],
  },
]);
