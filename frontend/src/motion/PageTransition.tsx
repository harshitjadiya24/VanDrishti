import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation, useOutlet } from "react-router";
import { DURATION, EASE_OUT } from "./tokens";

/** Console routes slide in like a board being hung; reduced motion swaps them instantly.
 * Content is never hidden behind the animation: it starts nearly visible. */
export function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduce ? false : { opacity: 0.4, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
        transition={{ duration: reduce ? 0 : DURATION.slow * 0.6, ease: EASE_OUT }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
