// Motion tokens for JavaScript (Motion and GSAP). They mirror the CSS tokens in app.css:
// change both together.

/** Boards settle: a fast start and a long, calm stop. */
export const EASE_BOARD = [0.16, 1, 0.3, 1] as const;
/** The check-post boom: a firm lift that settles without bouncing. */
export const EASE_BOOM = [0.22, 1, 0.36, 1] as const;
/** A stamp pressing down: quick in, firm stop. */
export const EASE_STAMP = [0.2, 0.9, 0.1, 1] as const;

export const DURATION = { quick: 0.14, base: 0.24, board: 0.52 } as const;

/** GSAP spells easings as strings. */
export const GSAP_EASE = { board: "expo.out", boom: "power3.out", stamp: "power4.out" } as const;
