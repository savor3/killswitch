// Opening screen: the lockup appears dim on black, a red square steps through the letters and lights them,
// rests at the end of the word and flickers out, then three red panels sweep left to right and carry the
// black away, uncovering the page.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mark } from "../brand/Logo";
import { reduceMotion } from "../lib/motion";

const WORD = "KILLSWITCH";
const STEP_MS = 85;
// the square's rest and flicker at the end of the word: the length of the loader-blink animation in loader.css
const BLINK_MS = 600;
// wait after the blink before the panels sweep; with the sweep's slow start they show about 0.23 s after
// the square goes out
const HOLD_MS = 100;

/** `skip`: show the page at once (the opening has already played this visit). */
export function Loader({ onReveal, skip = false }: { onReveal: () => void; skip?: boolean }) {
  const [phase, setPhase] = useState<"scan" | "blink" | "wipe" | "done">(skip ? "done" : "scan");
  const [lit, setLit] = useState(-1);
  const [px, setPx] = useState<{ x: number; w: number } | null>(null);
  const word = useRef<HTMLSpanElement>(null);
  const boxes = useRef<{ x: number; w: number }[]>([]);

  useLayoutEffect(() => {
    if (skip || reduceMotion()) {
      onReveal();
      setPhase("done");
      return;
    }
    document.documentElement.classList.add("is-loading");
    const measure = () => {
      const spans = [...(word.current?.querySelectorAll<HTMLSpanElement>("[data-l]") ?? [])];
      boxes.current = spans.map((s) => ({ x: s.offsetLeft, w: s.offsetWidth }));
    };
    measure();
    document.fonts?.ready.then(measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "scan") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = 380;
    for (let i = 0; i <= WORD.length; i++) {
      timers.push(
        setTimeout(() => {
          const b = boxes.current;
          if (i < WORD.length && b[i]) setPx({ x: b[i].x, w: b[i].w });
          if (i === WORD.length && b.length) {
            const last = b[b.length - 1];
            setPx({ x: last.x + last.w + 2, w: b[0].w * 0.82 });
          }
          setLit(i - 1);
        }, start + i * STEP_MS),
      );
    }
    const end = start + (WORD.length + 1) * STEP_MS;
    timers.push(
      setTimeout(() => {
        setLit(WORD.length);
        setPhase("blink");
      }, end),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== "blink") return;
    const t = setTimeout(() => setPhase("wipe"), BLINK_MS + HOLD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "wipe") return;
    const t1 = setTimeout(onReveal, 260);
    const t2 = setTimeout(() => {
      setPhase("done");
      document.documentElement.classList.remove("is-loading");
    }, 1150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase, onReveal]);

  if (phase === "done") return null;
  return (
    <div className={`loader is-${phase}`} aria-hidden="true">
      <div className="loader-track">
        <div className="loader-panels">
          <i className="p-soft" />
          <i className="p-red" />
          <i className="p-deep" />
        </div>
        <div className="loader-ground">
          <div className="loader-lockup">
            <Mark className={lit >= WORD.length ? "is-on" : ""} />
            <span className="loader-word" ref={word}>
              {WORD.split("").map((c, i) => (
                <span key={i} data-l className={i <= lit ? "is-lit" : ""}>
                  {c}
                </span>
              ))}
              {px && phase !== "wipe" && <span className="loader-px" style={{ left: px.x, width: px.w }} />}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
