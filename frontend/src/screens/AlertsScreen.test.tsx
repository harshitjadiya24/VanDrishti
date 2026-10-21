import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertItem, Me } from "../api";
import { SessionProvider } from "../context";
import { AlertsScreen } from "./AlertsScreen";

const alert: AlertItem = {
  id: "al-1", reserve: "KAN", timezone: "Asia/Kolkata", camera: "S-07", kind: "poaching_risk",
  severity: "critical", state: "open", title: "HIGH poaching risk at camera S-07",
  detail: { reasons: ["3 people (estimated count)", "at night"] },
  occurred_at: "2024-01-12T17:40:00Z", created_at: "2024-01-13T03:00:00Z",
  acted_by: null, acted_at: null, note: null, webhook: "sent",
};

let calls: { url: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/alerts?")) return json([alert]);
    if (url.endsWith("/act")) return json({ ...alert, state: "acknowledged", acted_by: body.person });
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

const person = (role: Me["role"], permissions: string[]): Me => ({
  username: "asha", display_name: "Asha", role, reserves: ["KAN"], permissions, csrf_token: "t",
});

function renderWith(me: Me) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider me={me} initial={{ reserve: "KAN" }}>
        <AlertsScreen />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("alerts screen", () => {
  it("shows reasons and times in the reserve's zone, and acts as the signed-in person", async () => {
    renderWith(person("ranger", ["view", "review_people", "act_alerts"]));
    expect(await screen.findByText("HIGH poaching risk at camera S-07")).toBeInTheDocument();
    expect(screen.getByText("at night")).toBeInTheDocument();
    expect(screen.getByText(/23:10 \(Asia\/Kolkata\)/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Note"), "team sent");
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/alerts/al-1/act")).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/act"))?.body).toEqual({ action: "acknowledge", note: "team sent" });
  });

  it("lets a viewer read alerts but not act on them or run the rules", async () => {
    renderWith(person("viewer", ["view"]));
    expect(await screen.findByRole("button", { name: "Acknowledge" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Check rules now" })).not.toBeInTheDocument();
  });
});
