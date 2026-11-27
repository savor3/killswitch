import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DURATION, Film } from "./Film";
import "./film.css";

declare global {
  interface Window {
    /** Draws the frame at `t` seconds before returning; the recorder calls it once per frame. */
    __seek?: (t: number) => void;
    __filmReady?: boolean;
  }
}

// Plays in real time on its own; once the recorder calls __seek the clock is held and set from outside.
function App() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let held = false;
    let t0 = 0;
    const tick = (now: number) => {
      if (held) return;
      if (!t0) t0 = now;
      setT(((now - t0) / 1000) % DURATION);
      raf = requestAnimationFrame(tick);
    };
    window.__seek = (s: number) => {
      held = true;
      cancelAnimationFrame(raf);
      flushSync(() => setT(s));
    };
    document.fonts.ready.then(() => {
      window.__filmReady = true;
    });
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <Film t={t} />;
}

createRoot(document.getElementById("film")!).render(<App />);
