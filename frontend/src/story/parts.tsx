import type { ReactNode } from "react";

/** Small screws at the corners of an enamel plate or a board. */
export function Rivets({ className = "bg-on-board/70" }: { className?: string }) {
  return (
    <>
      {["left-2 top-2", "right-2 top-2", "left-2 bottom-2", "right-2 bottom-2"].map((p) => (
        <span key={p} aria-hidden className={`absolute size-1.5 rounded-full ${p} ${className}`} />
      ))}
    </>
  );
}

/** A painted green board with its white keyline: the story's section container. */
export function Board({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[14px] bg-board p-3 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7)] md:p-4 ${className}`}>
      <Rivets />
      <div className="rounded-[8px] border-[3px] border-on-board/90 px-5 py-6 md:px-10 md:py-8">{children}</div>
    </div>
  );
}

/** A white enamel plate: content a person reads closely (frames, verdicts, records). */
export function Plate({ children, className = "", tone = "enamel" }: { children: ReactNode; className?: string; tone?: "enamel" | "check" | "alarm" }) {
  const tones = {
    enamel: "bg-on-board text-[#142019]",
    check: "bg-check text-on-check",
    alarm: "bg-[#c8372d] text-white",
  } as const;
  return (
    <div className={`relative rounded-[12px] px-5 py-4 shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)] ${tones[tone]} ${className}`}>
      <Rivets className={tone === "enamel" ? "bg-[#9aa79c]" : "bg-black/25"} />
      {children}
    </div>
  );
}

/** A section's board title in stencil lettering, with the milestone it belongs to. */
export function StageTitle({ id, milestone, children }: { id: string; milestone?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      {milestone && (
        <span aria-hidden className="mb-1.5 block w-12 overflow-hidden rounded-t-[24px] rounded-b-[4px] bg-on-board text-center shadow-[0_3px_0_rgb(0_0_0/0.35)]">
          <span className="block bg-board-line pt-2 pb-0.5 text-[15px] font-bold text-on-board">{milestone}</span>
          <span className="block h-4" />
        </span>
      )}
      <h2 id={id} className="board-title text-[clamp(2.4rem,6vw,4.25rem)] uppercase">{children}</h2>
    </div>
  );
}

/** Marks illustrative content so nobody mistakes it for real data. */
export function Synthetic({ className = "" }: { className?: string }) {
  return <span className={`text-[12px] font-semibold tracking-wide text-on-board-dim ${className}`}>Synthetic example</span>;
}
