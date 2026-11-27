// Text that decodes from binary into itself, left to right, whenever `run` turns on (after the reference's
// careers list). Screen readers get the plain text.
import { useEffect, useRef } from "react";
import { reduceMotion } from "../lib/motion";

export function Decode({ text, run, ms = 460 }: { text: string; run: boolean; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!run || reduceMotion()) {
      el.textContent = text;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = (now - t0) / ms;
      const front = k * (text.length + 3) - 3; // characters before this have settled
      const seed = Math.floor(now / 45); // the digits change at a readable rate, not every frame
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        s += ch === " " || i < front ? ch : (seed * 31 + i * 17) % 7 < 3 ? "1" : "0";
      }
      el.textContent = s;
      if (k < 1) raf = requestAnimationFrame(tick);
      else el.textContent = text;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
  }, [run, text, ms]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
