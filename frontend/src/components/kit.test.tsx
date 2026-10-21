import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CountNumber, StageBadge, ToastProvider, useToast } from "./kit";

describe("kit", () => {
  it("every stage badge carries a word, never colour alone", () => {
    const stages = ["auto", "review", "uncertain", "people", "blank", "quality", "done"] as const;
    render(<>{stages.map((s) => <StageBadge key={s} stage={s} />)}</>);
    for (const word of ["Auto-accepted", "Needs a person", "Uncertain", "People or vehicles", "Likely blank", "Quality problem", "Decided by a person"]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it("shows the final number straight away under reduced motion", () => {
    render(<CountNumber value={1234} />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("keeps an Undo toast until it is used, and fades plain ones", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const undo = vi.fn();
    function Trigger() {
      const toast = useToast();
      return (
        <>
          <button type="button" onClick={() => toast.show({ message: "Resolved", tone: "ok", action: { label: "Undo", run: undo } })}>with undo</button>
          <button type="button" onClick={() => toast.show({ message: "Saved", tone: "info" })}>plain</button>
        </>
      );
    }
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.click(screen.getByText("with undo"));
    await userEvent.click(screen.getByText("plain"));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    vi.useRealTimers(); // the exit animation runs on animation frames
    await waitFor(() => expect(screen.queryByText("Saved")).not.toBeInTheDocument());
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
  });
});
