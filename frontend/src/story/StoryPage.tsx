import { stripeField } from "./stripes";

const MILESTONES = [
  { n: 1, label: "Camera" },
  { n: 2, label: "Detect" },
  { n: 3, label: "Decide" },
  { n: 4, label: "Review" },
  { n: 5, label: "Act" },
];

/** The public story site. It makes no API calls and loads nothing from third parties. */
export default function StoryPage() {
  return (
    <div className="min-h-dvh bg-board-deep text-on-board">
      <Hero />
    </div>
  );
}

/** Small screws at the corners of an enamel plate or board. */
function Rivets({ className = "bg-on-board/70" }: { className?: string }) {
  return (
    <>
      {["left-2 top-2", "right-2 top-2", "left-2 bottom-2", "right-2 bottom-2"].map((p) => (
        <span key={p} aria-hidden className={`absolute size-1.5 rounded-full ${p} ${className}`} />
      ))}
    </>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="flex min-h-dvh flex-col px-4 pt-4 md:px-10 md:pt-6">
      <header className="flex items-center justify-between">
        <span className="board-title text-[22px] tracking-wide">VanDrishti</span>
        <a href="/app" className="rounded-[10px] bg-on-board px-4 py-2 text-[15px] font-semibold text-board shadow-[0_2px_0_rgb(0_0_0/0.3)] hover:bg-white">
          Sign in
        </a>
      </header>

      {/* The board: one painted forest-department sign, standing on two posts. */}
      <div className="mt-4 flex flex-1 flex-col">
        <div className="relative rounded-[14px] bg-board p-3 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7)] md:p-4">
          <Rivets />
          <div className="rounded-[8px] border-[3px] border-on-board/90 px-5 pt-5 pb-5 md:px-10 md:pt-6 md:pb-7">
            <h1 id="hero-title" className="board-title text-[clamp(3.6rem,11vw,6rem)] uppercase">VanDrishti</h1>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p lang="hi" className="deva text-[clamp(1.5rem,3.4vw,2.2rem)] text-on-board-dim">वनदृष्टि</p>
              <p className="text-[clamp(1.35rem,2.6vw,2rem)] font-semibold leading-tight">AI proposes. People decide.</p>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-8">
              <FramePlate />
              <div className="flex flex-col gap-5">
                <VerdictPlate />
                <p className="max-w-[46ch] text-[17px] leading-relaxed text-on-board-dim">
                  Camera traps in a tiger reserve take more photographs than anyone can look at. VanDrishti sorts them,
                  explains every call it makes, and stops at a check-post wherever a person must decide.
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* The posts the board stands on, painted in bands like a forest road sign. */}
        <div aria-hidden className="flex min-h-8 flex-1 justify-between px-[12%]">
          {[0, 1].map((i) => (
            <span key={i} className="w-4 bg-[linear-gradient(#f5f6f1_0_50%,#15170f_50%_100%)] [background-size:100%_16px]" />
          ))}
        </div>
      </div>

      <nav aria-label="The road through VanDrishti" className="border-t-2 border-board-line pt-4 pb-6">
        <ol className="flex items-end gap-2 overflow-x-auto pb-1 md:gap-4">
          {MILESTONES.map((m, i) => (
            <li key={m.n} className="shrink-0">
              <a href={i === 0 ? "#how" : `#stage-${m.n}`}
                className="block w-[112px] overflow-hidden rounded-t-[56px] rounded-b-md bg-on-board text-center text-board shadow-[0_3px_0_rgb(0_0_0/0.35)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-board)] hover:-translate-y-1 md:w-[132px]">
                <span className="block bg-board-line pt-3 pb-1 text-[13px] font-semibold text-on-board">{m.n}</span>
                <span className="block px-2 py-2 text-[15px] leading-tight font-semibold">{i === 0 ? "See how it works ↓" : m.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

/** An enamel plate holding one synthetic frame: a stripe field inside the detector's box. */
function FramePlate() {
  const stripes = stripeField(23, 340, 170);
  return (
    <figure className="relative self-start rounded-[12px] bg-on-board p-3 shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)]">
      <Rivets className="bg-[#9aa79c]" />
      <div className="relative overflow-hidden rounded-[6px] bg-[#2f3431]">
        <svg viewBox="0 0 420 190" className="block w-full" role="img"
          aria-label="Synthetic camera frame: a stripe pattern inside the detector's box">
          <defs>
            <linearGradient id="flank" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d08a24" />
              <stop offset="0.72" stopColor="#c47a1c" />
              <stop offset="1" stopColor="#ead9b6" />
            </linearGradient>
            <clipPath id="crop"><rect x="78" y="22" width="290" height="150" rx="10" /></clipPath>
          </defs>
          <rect width="420" height="190" fill="#2f3431" />
          <g clipPath="url(#crop)">
            <rect x="78" y="22" width="290" height="150" fill="url(#flank)" />
            <g transform="translate(60 8)">{stripes.map((s, i) => <path key={i} d={s.d} fill="#151515" />)}</g>
          </g>
          <rect x="70" y="16" width="306" height="162" fill="none" stroke="#f2c230" strokeWidth="3" />
        </svg>
        <span className="absolute top-0 left-[16.6%] rounded-b-sm bg-check px-1.5 text-[12px] font-semibold text-on-check">animal 0.94</span>
        <figcaption className="flex justify-between bg-black/80 px-3 py-1 font-[ui-monospace,monospace] text-[11px] tracking-wide text-[#d7ddd8]">
          <span>CAM S-07</span><span>22:41 IST</span><span>SYNTHETIC FRAME</span>
        </figcaption>
      </div>
    </figure>
  );
}

/** The model's proposal for that frame, in three fixed tiers: verdict, label, reason. */
function VerdictPlate() {
  return (
    <div className="relative rounded-[12px] bg-on-board px-5 pt-4 pb-5 text-[#142019] shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)]">
      <Rivets className="bg-[#9aa79c]" />
      <span className="inline-block rounded bg-board px-2 py-0.5 text-[13px] font-semibold text-on-board">Auto-accepted</span>
      <p className="mt-2 text-[22px] leading-tight font-semibold">Tiger <span className="tabular text-[#4e5f53]">0.97</span></p>
      <p className="mt-1 text-[15px] leading-snug text-[#3f4f44]">
        The species model agrees with the detector, and tigers are on this reserve's list. Spot-checked at random.
      </p>
    </div>
  );
}
