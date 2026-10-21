import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("sign in", () => {
  it("shows the server's message on a wrong password and keeps the form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "wrong username or password" }, 401)));
    const onSignedIn = vi.fn();
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Username"), "asha");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("wrong username or password");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("signs in and hands over the user", async () => {
    const me = { username: "asha", display_name: "Asha", role: "reviewer", reserves: ["KAN"], permissions: ["view"], csrf_token: "c" };
    const fetchMock = vi.fn(async () => json(me));
    vi.stubGlobal("fetch", fetchMock);
    const onSignedIn = vi.fn();
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Username"), " asha ");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(me));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ username: "asha", password: "correct horse battery" });
  });
});
