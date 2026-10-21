import { useState, type FormEvent } from "react";
import { api, ApiError, setCsrf, type Me } from "../api";

/** Sign in. The session is an HttpOnly cookie; the page never sees it. */
export function LoginScreen({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const me = await api.login(username.trim(), password);
      setCsrf(me.csrf_token);
      setPassword("");
      onSignedIn(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "cannot reach the server");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="grid w-full max-w-sm gap-4 rounded-md bg-panel p-6" aria-label="Sign in">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex gap-1">
            <span className="size-2 rounded-full bg-amber" />
            <span className="size-2 rounded-full bg-amber" />
          </span>
          <h1 className="text-[20px] font-semibold">VanDrishti</h1>
        </div>
        <p className="text-[13px] text-dim">Sign in with the account your administrator gave you.</p>
        <label className="grid gap-1 text-[13px] text-dim">
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required
            className="h-10 rounded-md border border-line bg-base px-3 text-[15px] text-ink" />
        </label>
        <label className="grid gap-1 text-[13px] text-dim">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
            className="h-10 rounded-md border border-line bg-base px-3 text-[15px] text-ink" />
        </label>
        {error && <p role="alert" className="text-[14px] text-alarm">{error}</p>}
        <button type="submit" disabled={busy}
          className="h-10 rounded-md bg-amber text-[15px] font-medium text-base disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
