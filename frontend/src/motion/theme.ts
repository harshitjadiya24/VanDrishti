// Night (default: long night-IR review at a desk), Flash (daylight, for rangers outdoors), or
// System. The choice is remembered in this browser only (a per-viewer convenience, safe to lose).
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "vd.theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", choice);
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts this visit */
  }
}

// One shared value, so every theme switch on the page shows the same choice.
const listeners = new Set<() => void>();
let current: ThemeChoice = readTheme();

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTheme(): ThemeChoice {
  return current;
}

export function setTheme(choice: ThemeChoice): void {
  current = choice;
  applyTheme(choice);
  listeners.forEach((l) => l());
}
