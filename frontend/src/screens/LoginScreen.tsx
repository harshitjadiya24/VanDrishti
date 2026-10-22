import { motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api, ApiError, setCsrf, type Me } from "../api";
import { Plate } from "../components/kit";
import { DURATION, EASE_BOARD } from "../motion/tokens";
import { stripeField } from "../story/stripes";

const STRIPES = stripeField(23, 340, 170);
const FIELD = "h-11 rounded-[8px] border border-line bg-base px-3 text-[16px] text-ink";

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
    initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.board, ease: EASE_BOARD, delay },
  });
  return (
    <main className="grid min-h-dvh bg-base lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* The board: the same green signboard the story and the console stand on. */}
      <section className="relative flex flex-col justify-between gap-8 overflow-hidden bg-board px-6 py-8 text-on-board sm:px-10 lg:py-12">
        <motion.div {...rise(0)} className="grid gap-1">
          <p className="board-title text-[clamp(48px,9vw,96px)] uppercase">VanDrishti</p>
          <p lang="hi" className="deva text-[22px] text-on-board-dim">वनदृष्टि</p>
        </motion.div>
        {/* One synthetic frame, as on the story page: a stripe field inside the detector's box. */}
        <figure className="w-full max-w-[520px] overflow-hidden rounded-[10px] bg-[#2f3431] shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)]">
          <svg viewBox="0 0 420 190" className="block w-full" role="img" aria-label="Synthetic camera frame: a stripe pattern inside the detector's box">
            <defs>
              <linearGradient id="login-flank" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d08a24" />
                <stop offset="0.72" stopColor="#c47a1c" />
                <stop offset="1" stopColor="#ead9b6" />
              </linearGradient>
              <clipPath id="login-crop"><rect x="78" y="22" width="290" height="150" rx="10" /></clipPath>
            </defs>
            <g clipPath="url(#login-crop)">
              <rect x="78" y="22" width="290" height="150" fill="url(#login-flank)" />
              <g transform="translate(60 8)">
                {STRIPES.map((s, i) => (
                  <motion.path key={i} d={s.d} fill="#151515" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: DURATION.board, ease: EASE_BOARD, delay: reduce ? 0 : 0.15 + i * 0.03 }} />
                ))}
              </g>
            </g>
            <motion.rect x="70" y="16" width="306" height="162" fill="none" stroke="#f2c230" strokeWidth="3" pathLength={1}
              strokeDasharray="1" initial={reduce ? false : { strokeDashoffset: 1 }} animate={{ strokeDashoffset: 0 }}
              transition={{ duration: DURATION.board * 1.6, ease: EASE_BOARD, delay: reduce ? 0 : 0.5 }} />
          </svg>
          <figcaption className="flex justify-between bg-black/80 px-3 py-1 font-mono text-[11px] tracking-wide text-[#d7ddd8]">
            <span>CAM S-07</span><span>SYNTHETIC FRAME</span>
          </figcaption>
        </figure>
        <motion.div {...rise(0.5)} className="grid gap-2">
          <p className="text-[clamp(22px,3vw,30px)] leading-tight font-semibold">
            AI proposes. <span className="text-check">People decide.</span>
          </p>
          <p className="max-w-[46ch] text-[15px] text-on-board-dim">
            Camera-trap monitoring for tiger reserves: every frame screened, every consequential call made by a person,
            every decision on the record.
          </p>
          <a href="/" className="mt-1 w-fit text-[15px] font-medium text-on-board underline underline-offset-4 hover:text-check">
            How it works
          </a>
        </motion.div>
      </section>

      <section className="grid place-items-center px-4 py-10">
        <motion.div {...rise(0.15)} className="w-full max-w-sm">
          <Plate as="article" rivets className="p-7">
            <form onSubmit={submit} className="grid gap-4" aria-label="Sign in">
              <h1 className="text-[24px] font-semibold">Sign in</h1>
              <p className="text-[14px] text-dim">Use the account your administrator gave you.</p>
              <label className="grid gap-1 text-[14px] text-dim">
                Username
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className={FIELD} />
              </label>
              <label className="grid gap-1 text-[14px] text-dim">
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={FIELD} />
              </label>
              {error && <p role="alert" className="rounded-[8px] bg-alarm px-3 py-2 text-[14px] text-on-alarm">{error}</p>}
              <button type="submit" disabled={busy}
                className="h-11 rounded-[8px] bg-board text-[16px] font-semibold text-on-board hover:bg-board-deep disabled:opacity-60">
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </Plate>
          <p className="mt-4 text-center text-[13px] text-dim">What you can see and do depends on your role and reserves.</p>
        </motion.div>
      </section>
    </main>
  );
}
