import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "./router";

beforeEach(() => {
  // Nobody is signed in: the console shows its sign-in screen.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "sign in" }), { status: 401, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("routes", () => {
  it("keeps links from before the console moved under /app working", async () => {
    const router = open("/review/people_vehicles?x=1");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/review/people_vehicles");
    expect(router.state.location.search).toBe("?x=1");
  });

  it("loads the console chunk on demand and asks a signed-out visitor to sign in first", async () => {
    const router = open("/app/risk");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/risk"); // they land where they asked for
  });

  it("sends unknown paths to the story page", async () => {
    const router = open("/nowhere");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/VanDrishti/);
    expect(router.state.location.pathname).toBe("/");
  });
});
