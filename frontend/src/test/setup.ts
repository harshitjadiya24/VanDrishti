import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";

// Unmount after each test: mounted screens keep keyboard listeners alive otherwise.
afterEach(cleanup);

// jsdom has no matchMedia; GSAP's ScrollTrigger asks for it on import. Tests run as a
// visitor who asked for reduced motion, so pages render their final, static states.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom does not run animation frames reliably: Motion finishes every animation at once in tests.
MotionGlobalConfig.skipAnimations = true;

// cmdk scrolls the selected item into view and Radix measures with ResizeObserver; jsdom has neither.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
