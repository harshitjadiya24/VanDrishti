import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "../api";
import { SessionProvider } from "../context";
import { ReviewScreen } from "./ReviewScreen";

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  image_id: "img-1", route: "review", spot_check: false, reason: "confidence 0.75 in 0.6–0.9",
  camera: "S-01", captured_at: "2024-01-12T22:10:00Z", timezone: "Asia/Kolkata", quality_flags: [], label: "tiger",
  taxon: "mammalia;carnivora;felidae;panthera;tigris", confidence: 0.75,
  explanation: { summary: "tiger: SpeciesNet 0.75", factors: [{ name: "detection strength", factor: 1, reason: "clear detection (0.90)" }] },
  boxes: [{ category: "animal", confidence: 0.9, box: [0.2, 0.2, 0.4, 0.4] }],
  has_mask: false, allowed_actions: ["confirm", "correct", "not_animal", "skip"], ...over,
});

let calls: { url: string; body: unknown }[] = [];
function mockApi(queue: QueueItem[]) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/review/queue")) return json(queue);
    if (url === "/api/reviews") return json({ id: "rev-1", image_id: body.image_id, action: body.action, model_label: "tiger", human_label: "tiger", undone: false }, 201);
    if (url.endsWith("/undo")) return json({ id: "rev-1", image_id: "img-1", action: "confirm", model_label: "tiger", human_label: "tiger", undone: true });
    return json({});
  }));
}

function renderAt(kind: string, reviewer = "Asha") {
  const router = createMemoryRouter([{ path: "/review/:kind", element: <ReviewScreen /> }], { initialEntries: [`/review/${kind}`] });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider initial={{ reviewer, reserve: "" }}>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("review screen", () => {
  beforeEach(() => mockApi([item(), item({ image_id: "img-2" })]));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the model's answer and why it needs a person", async () => {
    renderAt("review");
    expect(await screen.findByText("tiger")).toBeInTheDocument();
    expect(screen.getByText(/clear detection/)).toBeInTheDocument();
    expect(screen.getByText("1 of 2 waiting")).toBeInTheDocument();
    // 22:10 UTC is 03:40 the next day in the reserve's zone, whatever the viewer's zone is.
    expect(screen.getByText(/13 Jan 2024, 03:40 \(Asia\/Kolkata\)/)).toBeInTheDocument();
  });

  it("confirms with the keyboard, then undoes with U", async () => {
    const user = userEvent.setup();
    renderAt("review");
    await screen.findByText("tiger");
    await user.keyboard("p2y");  // poaching on, severity medium, confirm
    await waitFor(() => expect(calls.some((c) => c.url === "/api/reviews")).toBe(true));
    const sent = calls.find((c) => c.url === "/api/reviews")!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ image_id: "img-1", action: "confirm", reviewer: "Asha", poaching_activity: true, severity: "medium" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    await user.keyboard("u");
    await waitFor(() => expect(calls.some((c) => c.url === "/api/reviews/rev-1/undo")).toBe(true));
  });

  it("offers only the actions that fit the queue", async () => {
    mockApi([item({ route: "people_vehicles", label: null, confidence: null, explanation: null,
      allowed_actions: ["confirm_people", "false_alarm", "skip"] })]);
    renderAt("people_vehicles");
    expect(await screen.findByRole("button", { name: /Confirm people\/vehicle/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Confirm Y/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /False alarm/ })).toBeInTheDocument();
  });

  it("needs a reviewer name before anything is saved", async () => {
    const user = userEvent.setup();
    renderAt("review", "");
    await screen.findByText(/Enter your name/);
    await user.keyboard("y");
    expect(calls.some((c) => c.url === "/api/reviews")).toBe(false);
  });
});
