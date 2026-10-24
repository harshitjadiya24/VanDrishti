import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./keys";
import { localTime, stripTime } from "./time";

describe("keys", () => {
  it("treats fields, editable elements and the palette's search as typing", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const select = document.createElement("select");
    const palette = document.createElement("div");
    palette.setAttribute("cmdk-root", "");
    const inside = document.createElement("span");
    palette.append(inside);
    for (const el of [input, area, select, inside]) expect(isTypingTarget(el)).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});

describe("time", () => {
  it("stamps the strip in the reserve's zone, never the viewer's", () => {
    // 17:11:07 UTC is 22:41:07 in India (UTC+5:30).
    expect(stripTime("2026-10-24T17:11:07Z", "Asia/Kolkata")).toBe("24.10.2026 22:41:07");
    expect(stripTime("2026-10-24T17:11:07Z", "America/Los_Angeles")).toBe("24.10.2026 10:11:07");
    expect(stripTime(null, "Asia/Kolkata")).toBe("time unknown");
  });

  it("names the zone in long-form times", () => {
    expect(localTime("2026-10-24T17:11:07Z", "Asia/Kolkata")).toMatch(/22:41 \(Asia\/Kolkata\)$/);
  });
});
