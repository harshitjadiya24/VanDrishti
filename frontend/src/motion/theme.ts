// Daylight / night patrol. "system" follows the operating system; a choice is remembered in
// this browser only (per-viewer convenience, safe to lose).
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "vd.theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
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
