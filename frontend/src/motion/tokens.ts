// Motion tokens for JavaScript (Motion and GSAP). They mirror design/tokens.css: change both
// together. Exponential ease-out from an already-visible state; reduced motion skips them.

/** The house curve: a fast start and a long, calm stop. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** The camera flash: near-instant attack, slow decay. */
export const EASE_FLASH = [0.05, 0.7, 0.1, 1] as const;

export const DURATION = { fast: 0.14, base: 0.24, slow: 0.42, quick: 0.14, board: 0.42 } as const;

/** GSAP spells easings as strings. */
export const GSAP_EASE = { out: "expo.out", board: "expo.out", boom: "power3.out", stamp: "power4.out" } as const;

// Names from the Forest Board, kept until R2/R3 rebuild their callers.
export const EASE_BOARD = EASE_OUT;
export const EASE_BOOM = [0.22, 1, 0.36, 1] as const;
export const EASE_STAMP = [0.2, 0.9, 0.1, 1] as const;
