import { describe, expect, it } from "vitest";
import { isControlActivation, isTypingTarget } from "./keys";
import { dayIn, localTime, stripTime } from "./time";

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

describe("control activation", () => {
  it("leaves Enter and Space on a focused control to that control", () => {
    const button = document.createElement("button");
    const press = (key: string, target: EventTarget) => {
      const e = new KeyboardEvent("keydown", { key });
      Object.defineProperty(e, "target", { value: target });
      return e;
    };
    expect(isControlActivation(press("Enter", button))).toBe(true);
    expect(isControlActivation(press(" ", button))).toBe(true);
    expect(isControlActivation(press("y", button))).toBe(false);
    expect(isControlActivation(press("Enter", document.body))).toBe(false);
  });
});

describe("time", () => {
  it("stamps the strip in the reserve's zone, never the viewer's", () => {
    // 17:11:07 UTC is 22:41:07 in India (UTC+5:30).
    expect(stripTime("2026-10-24T17:11:07Z", "Asia/Kolkata")).toBe("24.10.2026 22:41:07");
    expect(stripTime("2026-10-24T17:11:07Z", "America/Los_Angeles")).toBe("24.10.2026 10:11:07");
    expect(stripTime(null, "Asia/Kolkata")).toBe("time unknown");
  });

  it("takes today from the reserve's calendar", () => {
    // 20:00 UTC on the 24th is already the 25th in India and still the 24th in California.
    const now = new Date("2026-10-24T20:00:00Z");
    expect(dayIn("Asia/Kolkata", now)).toBe("2026-10-25");
    expect(dayIn("America/Los_Angeles", now)).toBe("2026-10-24");
  });

  it("names the zone in long-form times", () => {
    expect(localTime("2026-10-24T17:11:07Z", "Asia/Kolkata")).toMatch(/22:41 \(Asia\/Kolkata\)$/);
  });
});
