// Single-key shortcuts must never fire while someone is typing: in an input, a text area, a
// select, an editable element, or the command palette's search.

import { useEffect, useRef } from "react";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return target.closest("[cmdk-root], [role='combobox'], [role='listbox']") !== null;
}

/** True for a plain key press (no Cmd, Ctrl or Alt) outside a text field. */
export function isPlainKey(e: KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
}

/**
 * Bind single keys (lower-case `e.key`, e.g. "j", "arrowright", "enter") while `enabled`.
 * The latest handlers are always used without re-binding the listener.
 */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true): void {
  const latest = useRef(map);
  useEffect(() => { latest.current = map; });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e)) return;
      const run = latest.current[e.key.toLowerCase()];
      if (run) run(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
