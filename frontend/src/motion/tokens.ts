// Motion tokens for JavaScript (Motion and GSAP). They mirror design/tokens.css: change both
// together. Exponential ease-out from an already-visible state; reduced motion skips them.

/** The house curve: a fast start and a long, calm stop. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** The camera flash: near-instant attack, slow decay. */
export const EASE_FLASH = [0.05, 0.7, 0.1, 1] as const;

export const DURATION = { fast: 0.14, base: 0.24, slow: 0.42 } as const;

/** GSAP spells easings as strings. */
export const GSAP_EASE = { out: "expo.out", flash: "power4.out" } as const;
