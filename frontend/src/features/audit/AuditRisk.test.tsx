import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent, Me, RiskEvent } from "../../lib/api";
import { SessionProvider } from "../../lib/session";
import { AuditScreen } from "./AuditScreen";
import { RiskScreen } from "../risk/RiskScreen";

const h = (c: string) => c.repeat(64);
const audit: AuditEvent[] = [
  { seq: 2, at: "2026-10-21T07:22:00Z", actor: "reviewer:asha", action: "review_undo", entity: "review", entity_id: "r1", payload: {}, prev_hash: h("a"), hash: h("b") },
  { seq: 1, at: "2026-10-21T07:20:00Z", actor: "reviewer:asha", action: "review_confirm", entity: "review", entity_id: "r1", payload: {}, prev_hash: h("0"), hash: h("a") },
];
const event: RiskEvent = {
  event_id: "e1", camera: "S-07", camera_sensitivity: "core", start_at: "2024-01-12T17:40:00Z", timezone: "Asia/Kolkata",
  people: 1, vehicles: 0, vehicle_type: null, vehicle_type_score: null, night: false, night_basis: "sun",
  level: "high", score: 3, dismissed: false, image_ids: ["i1"],
  factors: [{ reason: "this camera is in the core zone", points: 3 }],
} as RiskEvent;

let verify = { ok: true, events_checked: 2, first_broken_seq: null as number | null };
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/audit/events")) return json(audit);
    if (url.startsWith("/api/audit/verify")) return json(verify);
    if (url.startsWith("/api/risk/summary")) {
      return json({ events: 1, levels: { high: 1, medium: 0, low: 0 }, night_share: 0, dismissed: 0, cameras: [], thresholds: { medium: 4, high: 8 }, note: "not a prediction" });
    }
    if (url.startsWith("/api/risk/events")) return json([event]);
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

const me: Me = { username: "root", display_name: "Root", role: "admin", reserves: ["*"], permissions: ["view", "view_audit"], csrf_token: "t" };
const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><SessionProvider me={me} initial={{ reserve: "KAN" }}>{ui}</SessionProvider></MemoryRouter>
  </QueryClientProvider>,
);

describe("audit chain", () => {
  it("shows each entry linking to the one before, and the server's verdict", async () => {
    wrap(<AuditScreen />);
    expect(await screen.findByText(/covers #1/)).toBeInTheDocument();
    expect(screen.getByText(`hash ${"b".repeat(8)}…bbbb`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Verify the chain/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Intact: all 2 entries");
    expect(screen.getAllByLabelText("verified")).toHaveLength(2);
  });

  it("marks entries from the broken one onwards", async () => {
    verify = { ok: false, events_checked: 1, first_broken_seq: 2 };
    wrap(<AuditScreen />);
    await screen.findByText(/covers #1/);
    await userEvent.click(screen.getByRole("button", { name: /Verify the chain/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Broken at entry #2");
    expect(screen.getAllByLabelText("verified")).toHaveLength(1);
    expect(screen.getAllByLabelText("not verified")).toHaveLength(1);
  });
});

describe("risk point stack", () => {
  it("draws the points against the server's thresholds and says when a level was raised", async () => {
    wrap(<RiskScreen />);
    expect(await screen.findByRole("img", { name: "3 points; medium from 4, high from 8" })).toBeInTheDocument();
    expect(screen.getByText("Points alone say low; a rule or a reviewer's mark set the level to high.")).toBeInTheDocument();
  });
});
