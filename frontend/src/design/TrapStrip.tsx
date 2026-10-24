// The camera trap's data strip: the line a real trap burns into the bottom of every frame
// (camera, local time, mode). It is the system's chrome: every frame and card carries one.

import clsx from "clsx";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

export interface StripProps {
  camera: string;
  /** Already formatted in the reserve's time zone (never the viewer's). */
  time: string;
  mode?: "IR" | "DAY";
  /** Extra fields, e.g. "SYNTHETIC FRAME" or a model recipe. */
  extra?: ReactNode;
  className?: string;
}

export function TrapStrip({ camera, time, mode = "IR", extra, className }: StripProps) {
  const Icon = mode === "IR" ? Moon : Sun;
  return (
    <div className={clsx("data flex items-center gap-x-4 overflow-hidden whitespace-nowrap bg-black/80 px-3 py-1.5 text-[10.5px] tracking-[0.06em] text-ir uppercase", className)}>
      <Icon size={12} aria-hidden strokeWidth={2} />
      <span>{camera}</span>
      <span className="max-sm:hidden">{time}</span>
      <span className="sm:hidden">{time.split(" ").slice(1).join(" ")}</span>
      <span>{mode}</span>
      {extra && <span className="ml-auto truncate">{extra}</span>}
    </div>
  );
}
