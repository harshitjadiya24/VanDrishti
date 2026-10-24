# motion-primitives (vendored)

Source: https://github.com/ibelick/motion-primitives (`components/core/*.tsx`), MIT licence
(per the project README). Fetched 2026-10-24 from the `main` branch.

Copied in rather than installed (they are distributed as copy-paste source). Changes are marked
`VanDrishti:`. Only `motion/react`, React and `./cn` are imported. Used by the console only; the
story page animates with GSAP.

Excluded: `morphing-dialog` (Radix Dialog covers it), `sliding-number` (needs react-use-measure),
`animated-number` and `in-view` (their types fail under Motion 14 + strict TS; `CountNumber` and GSAP cover them).
