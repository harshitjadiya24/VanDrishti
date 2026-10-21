import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEASURED, NEEDS_A_PERSON, ROUTING, SAMPLE } from "./results";
import StoryPage from "./StoryPage";
import EVALUATION from "../../../docs/EVALUATION.md?raw";

describe("story numbers", () => {
  it("every routing count is the one recorded in EVALUATION.md", () => {
    const table: Record<string, string> = {
      auto: "| Auto-accepted | 86 | 5", review: "| Review (0.6–0.9) | 27 | 27", uncertain: "| Uncertain (< 0.6) | 12 | 12",
      people: "| People or vehicles | 66 | 66", blank: "| Likely blank | 61 | 7",
    };
    for (const r of ROUTING) {
      expect(EVALUATION).toContain(table[r.id]);
      expect(table[r.id]).toContain(`| ${r.frames} | ${r.person}`);
    }
    expect(EVALUATION).toContain(`**${SAMPLE.frames}** | **${NEEDS_A_PERSON}**`);
    expect(ROUTING.reduce((s, r) => s + r.frames, 0)).toBe(SAMPLE.frames);
    expect(ROUTING.reduce((s, r) => s + r.person, 0)).toBe(NEEDS_A_PERSON);
  });

  it("every measured figure appears in EVALUATION.md", () => {
    const evidence = ["**0.94**", "**0.91**", "recall 0.95, precision 0.97", "| 86 | 84 | 2 | 0 |",
      "123 of 125", "| **0.974** |", "0.15–0.16 s per image"];
    for (const e of evidence) expect(EVALUATION).toContain(e);
    expect(MEASURED.map((m) => m.value).join(" ")).toMatch(/0\.94.*0\.91/);
  });
});

describe("story page", () => {
  beforeEach(() => {
    // jsdom: reduced motion (test setup) and no WebGL, so the page renders its static states.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("the story page must not call any API"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tells the whole road without a single network request", async () => {
    render(<StoryPage />);
    for (const title of ["One frame down the road", "The check-post", "People decide", "Privacy is built in",
      "Poaching risk, with reasons", "Which tiger is this?", "On the notice board", "How it is built"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("img", { name: /one road splits into five lanes/i })).toBeInTheDocument(); // no WebGL
    expect(screen.getByText(/117 of 252 needed a person/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("chains a visitor's decision to the audit trail, and undo adds an entry", async () => {
    render(<StoryPage />);
    await screen.findByText("Queued for a person");
    await userEvent.click(screen.getByRole("button", { name: /^Tiger/ }));
    expect(await screen.findByText("Decided by you: tiger")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(screen.getByText(/Undone by you/)).toBeInTheDocument());
    expect(screen.getAllByText(/links to/)).toHaveLength(4);
  });
});
