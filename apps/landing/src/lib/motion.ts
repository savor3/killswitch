import { createContext, useContext, useEffect, useState, type RefObject } from "react";

export const reduceMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the loader has swept away and the page may start its entrance motion. */
export const RevealContext = createContext(false);
export const useRevealed = () => useContext(RevealContext);

/** Whether an element is on screen. */
export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.15, rootMargin = "0px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, rootMargin]);
  return inView;
}

/** Runs `fn` on every animation frame while the page scrolls or resizes (and once at start). */
export function useScrollFrame(fn: () => void, deps: unknown[] = []) {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      fn();
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
