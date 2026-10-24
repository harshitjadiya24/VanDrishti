import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrf, type QueueItem } from "../../lib/api";
import { SessionProvider } from "../../lib/session";
import { ReviewScreen } from "./ReviewScreen";

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  image_id: "img-1", route: "review", spot_check: false, reason: "confidence 0.75 in 0.6–0.9",
  camera: "S-01", captured_at: "2024-01-12T22:10:00Z", timezone: "Asia/Kolkata", quality_flags: [], label: "tiger",
  taxon: "mammalia;carnivora;felidae;panthera;tigris", confidence: 0.75,
  explanation: { summary: "tiger: SpeciesNet 0.75", factors: [{ name: "detection strength", factor: 1, reason: "clear detection (0.90)" }] },
  boxes: [{ category: "animal", confidence: 0.9, box: [0.2, 0.2, 0.4, 0.4] }],
  has_mask: false, allowed_actions: ["confirm", "correct", "not_animal", "skip"], risk: null, ...over,
});

let calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
function mockApi(queue: QueueItem[]) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
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
  beforeEach(() => { setCsrf("csrf-1"); mockApi([item(), item({ image_id: "img-2" })]); });
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
    expect(sent).toMatchObject({ image_id: "img-1", action: "confirm", poaching_activity: true, severity: "medium" });
    expect(sent).not.toHaveProperty("reviewer");  // the server signs with the signed-in user
    expect(calls.find((c) => c.url === "/api/reviews")!.headers["X-CSRF-Token"]).toBe("csrf-1");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    await user.keyboard("u");
    await waitFor(() => expect(calls.some((c) => c.url === "/api/reviews/rev-1/undo")).toBe(true));
  });

  it("Enter on a queue thumbnail opens that frame and decides nothing", async () => {
    const user = userEvent.setup();
    renderAt("review");
    await screen.findByText("tiger");
    screen.getByRole("button", { name: /^Frame 2/ }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("2 of 2 waiting")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/reviews")).toBe(false);
  });

  it("offers only the actions that fit the queue", async () => {
    mockApi([item({ route: "people_vehicles", label: null, confidence: null, explanation: null,
      allowed_actions: ["confirm_people", "false_alarm", "skip"],
      risk: { level: "high", score: 8, dismissed: false, people: 2, vehicles: 0, vehicle_type: null, night: true,
        factors: [{ name: "night", points: 3, reason: "at night, after sunset at this camera" }] } })]);
    renderAt("people_vehicles");
    expect(await screen.findByRole("button", { name: /Confirm people\/vehicle/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Confirm Y/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /False alarm/ })).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("at night, after sunset at this camera")).toBeInTheDocument();
  });

});
