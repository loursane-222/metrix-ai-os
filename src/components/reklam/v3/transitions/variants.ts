import type { Variants } from "framer-motion";
import type { TransitionType } from "../types";

// AnimatePresence wrapper'ı bu variant'larla sahne geçişini yönetir.
// "enter" = initial, "active" = animate, "exit" = exit
export const TRANSITION_VARIANTS: Record<TransitionType, Variants> = {
  HARD_CUT: {
    enter: { opacity: 1 },
    active: { opacity: 1 },
    exit:   { opacity: 1 },
  },

  CINEMATIC_FADE: {
    enter: { opacity: 0 },
    active: { opacity: 1, transition: { duration: 0.55, ease: "easeOut" } },
    exit:   { opacity: 0, transition: { duration: 0.45, ease: "easeIn" } },
  },

  SCALE_BLOOM: {
    enter: { opacity: 0, scale: 0.94 },
    active: { opacity: 1, scale: 1,   transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
    exit:   { opacity: 0, scale: 1.05, transition: { duration: 0.35, ease: "easeIn" } },
  },

  PUSH_LEFT: {
    enter: { opacity: 0, x: "28%" },
    active: { opacity: 1, x: 0,     transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
    exit:   { opacity: 0, x: "-18%", transition: { duration: 0.35, ease: "easeIn" } },
  },

  BLUR_DISSOLVE: {
    enter: { opacity: 0, filter: "blur(14px)" },
    active: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.55, ease: "easeOut" } },
    exit:   { opacity: 0, filter: "blur(10px)", transition: { duration: 0.35, ease: "easeIn" } },
  },

  RISE_UP: {
    enter: { opacity: 0, y: "7%" },
    active: { opacity: 1, y: 0,    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
    exit:   { opacity: 0, y: "-5%", transition: { duration: 0.35, ease: "easeIn" } },
  },
};
