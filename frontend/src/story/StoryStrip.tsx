// The camera's data strip, fixed to the bottom of the screen once the reader leaves the
// first viewport: which stage the frame has reached, and the way into the console.

import clsx from "clsx";
import { Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function StoryStrip() {
  const [chapter, setChapter] = useState<{ stage: string; name: string } | null>(null);

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-chapter-name]")];
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<HTMLElement, boolean>();
    const pick = () => {
      // The last chapter whose top has passed the middle of the screen is the current one.
      let current: HTMLElement | null = null;
      for (const s of sections) if (s.getBoundingClientRect().top < window.innerHeight * 0.5) current = s;
      setChapter(current ? { stage: current.dataset.chapter ?? "", name: current.dataset.chapterName ?? "" } : null);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target as HTMLElement, e.isIntersecting);
      pick();
    }, { rootMargin: "0px 0px -50% 0px" });
    sections.forEach((s) => io.observe(s));
    window.addEventListener("scroll", pick, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", pick); };
  }, []);

  return (
    <div aria-hidden={!chapter}
      className={clsx("data fixed inset-x-0 bottom-0 z-40 flex h-11 items-center gap-4 whitespace-nowrap border-t border-white/10 bg-black/80 px-4 text-[10.5px] tracking-[0.06em] text-ir uppercase backdrop-blur-md transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] md:px-10",
        chapter ? "translate-y-0" : "translate-y-full")}>
      <Moon size={12} aria-hidden />
      <span className="max-sm:hidden">CAM S-07</span>
      <span className="max-sm:hidden">22:41:07 IST · synthetic scene</span>
      <span className="min-w-0 truncate text-[#edeef0]" aria-live="polite">
        {chapter && (chapter.stage ? `stage ${chapter.stage} · ${chapter.name}` : chapter.name)}
      </span>
      <a href="/app" tabIndex={chapter ? 0 : -1}
        className="ml-auto inline-flex h-full items-center px-1 text-heat-5 underline-offset-4 hover:underline">Sign in</a>
    </div>
  );
}
