import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Me, Pipeline } from "../../lib/api";
import { SessionProvider } from "../../lib/session";
import { PipelineScreen } from "./PipelineScreen";

const P: Pipeline = {
  ingest: { images: 252, corrupt: 0 },
  quality: { pass: 252, fail: 0, pending: 0 },
  detect: { animal: 125, people_vehicles: 66, blank: 61, not_screened: 0 },
  decided: 125,
  routes: {
    auto_accept: { total: 86, waiting: 5 }, review: { total: 27, waiting: 27 }, uncertain: { total: 12, waiting: 12 },
    likely_blank: { total: 61, waiting: 7 }, people_vehicles: { total: 66, waiting: 66 }, quality: { total: 0, waiting: 0 },
  },
  reviews_done: 3,
  risk: { high: 0, medium: 17, low: 25 },
  identity: { embedded: 0, proposals_open: 0, named_tigers: 0 },
  alerts_open: { critical: 0, warning: 21, info: 0 },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(P), { headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderAs(permissions: string[]) {
  const me: Me = { username: "asha", display_name: "Asha", role: "reviewer", reserves: ["KAN"], permissions, csrf_token: "t" };
  const router = createMemoryRouter([
    { path: "/app/pipeline", element: <PipelineScreen /> },
    { path: "/app/review/:kind", element: <p>queue page</p> },
  ], { initialEntries: ["/app/pipeline"] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider me={me}><RouterProvider router={router} /></SessionProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe("the road, live", () => {
  it("shows exact counts and everything waiting for a person", async () => {
    renderAs(["view", "review_species", "review_people"]);
    expect((await screen.findAllByText("117")).length).toBeGreaterThan(0); // 5 + 27 + 12 + 66 + 7
    expect(screen.getAllByText("3 decided so far").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review band").length).toBeGreaterThan(0);
  });

  it("opens a stage's queue, and hides queues the role cannot open", async () => {
    const router = renderAs(["view", "review_people"]);
    await screen.findAllByText("117");
    // Rangers may open the people & vehicles queue but not the species review band.
    const rows = screen.getAllByRole("listitem");
    const row = (label: string) => rows.find((r) => r.textContent?.includes(label))!;
    expect(row("Review band").querySelector("button")).toBeNull();
    await userEvent.click(row("People & vehicles").querySelector("button")!);
    expect(router.state.location.pathname).toBe("/app/review/people_vehicles");
  });
});
