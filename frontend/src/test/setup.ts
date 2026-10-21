import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
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
