import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutDashboard, ScrollText } from "lucide-react";
import { useCallback, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette, useCommandShortcut } from "./CommandPalette";
import type { NavGroup } from "./nav";

const groups: NavGroup[] = [
  { title: "Insight", items: [{ to: "/app/dashboard", label: "Overview", icon: LayoutDashboard, perm: "view" }] },
  { title: "Records", items: [{ to: "/app/audit", label: "Audit trail", icon: ScrollText, perm: "view_audit", keywords: "hash chain" }] },
];

function Harness({ signOut }: { signOut: () => void }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), [setOpen]);
  useCommandShortcut(show);
  return (
    <>
      <input aria-label="Note" />
      <CommandPalette open={open} onOpenChange={setOpen} groups={groups} reserves={[]} reserve="" setReserve={() => {}} allReserves signOut={signOut} />
    </>
  );
}

function mount(signOut = vi.fn()) {
  const router = createMemoryRouter([
    { path: "/app/dashboard", element: <Harness signOut={signOut} /> },
    { path: "/app/audit", element: <p>Audit screen</p> },
  ], { initialEntries: ["/app/dashboard"] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("command palette", () => {
  it("opens with Ctrl+K, filters by keyword and goes to the chosen screen", async () => {
    const router = mount();
    await userEvent.keyboard("{Control>}k{/Control}");
    const search = await screen.findByPlaceholderText(/Jump to a screen/);
    await userEvent.type(search, "hash chain");
    await userEvent.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/app/audit");
  });

  it("does not open on / while someone is typing in a field", async () => {
    mount();
    await userEvent.type(screen.getByLabelText("Note"), "a/b");
    expect(screen.queryByPlaceholderText(/Jump to a screen/)).not.toBeInTheDocument();
    await userEvent.click(document.body);
    await userEvent.keyboard("/");
    expect(await screen.findByPlaceholderText(/Jump to a screen/)).toBeInTheDocument();
  });

  it("signs out from the palette", async () => {
    const signOut = vi.fn();
    mount(signOut);
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await screen.findByPlaceholderText(/Jump to a screen/), "sign out");
    await userEvent.keyboard("{Enter}");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
