import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { IRFrame } from "../../design/IRFrame";
import { FIELD } from "../../design/kit";
import { Button } from "../../design/primitives";
import { TrapStrip } from "../../design/TrapStrip";
import { api, ApiError, setCsrf, type Me } from "../../lib/api";
import { DURATION, EASE_OUT } from "../../motion/tokens";

/** Sign in. The session is an HttpOnly cookie; the page never sees it. */
export function LoginScreen({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const reduce = useReducedMotion();
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
  const rise = (delay: number) => (reduce ? {} : {
    initial: { opacity: 0.001, y: 12 }, animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.slow, ease: EASE_OUT, delay },
  });

  return (
    <main className="grid min-h-dvh bg-canvas text-fg lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,1fr)]">
      {/* The camera's side: always night. */}
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-night px-6 py-7 text-[#edeef0] sm:px-10 lg:py-10">
        <p className="flex items-baseline gap-3">
          <span className="wide wide-max text-[22px]">VanDrishti</span>
          <span lang="hi" className="hindi text-[16px] text-[#a9aeb8]">वनदृष्टि</span>
        </p>
        <motion.div {...rise(0.05)} className="w-full max-w-[640px] overflow-hidden rounded-[var(--radius-card)] border border-white/10 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]">
          <IRFrame id="login" strip={<TrapStrip camera="CAM S-07" time="24.10.2026 22:41:07 IST" extra="synthetic frame" />} />
        </motion.div>
        <div className="grid gap-3">
          <p className="wide max-w-[16ch] text-[clamp(2rem,3.6vw,3rem)]">
            AI proposes. <span className="text-heat-5">People decide.</span>
          </p>
          <p className="max-w-[48ch] text-[14.5px] text-[#a9aeb8]">
            Camera-trap monitoring for tiger reserves: every frame screened, every consequential call made by a person,
            every decision on the record.
          </p>
          <a href="/" className="inline-flex min-h-11 w-fit items-center gap-1 text-[14px] font-medium text-[#edeef0] underline decoration-white/30 underline-offset-4 hover:decoration-white">
            How it works <ArrowUpRight size={15} aria-hidden />
          </a>
        </div>
      </section>

      <section className="grid place-items-center px-5 py-12">
        <motion.div {...rise(0.12)} className="w-full max-w-[360px]">
          <form onSubmit={submit} className="grid gap-5" aria-label="Sign in">
            <div className="grid gap-1.5">
              <h1 className="wide text-[30px]">Sign in</h1>
              <p className="text-[14px] text-fg-2">Use the account your administrator gave you.</p>
            </div>
            <label className="grid gap-1.5 text-[13px] font-medium text-fg-2">
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className={FIELD} />
            </label>
            <label className="grid gap-1.5 text-[13px] font-medium text-fg-2">
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={FIELD} />
            </label>
            {error && <p role="alert" className="rounded-[8px] border border-danger/50 bg-danger/10 px-3 py-2 text-[13.5px] text-danger">{error}</p>}
            <Button type="submit" tone="solid" size="lg" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-[12.5px] text-fg-3">What you can see and do depends on your role and reserves.</p>
          </form>
        </motion.div>
      </section>
    </main>
  );
}
