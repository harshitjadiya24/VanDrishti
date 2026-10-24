import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, readTheme } from "./theme";

afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });

describe("theme", () => {
  it("defaults to Night when nothing was chosen", () => {
    expect(readTheme()).toBe("dark");
  });

  it("remembers a choice and marks the document with it", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(readTheme()).toBe("light");
    applyTheme("system");
    expect(readTheme()).toBe("system");
  });
});
