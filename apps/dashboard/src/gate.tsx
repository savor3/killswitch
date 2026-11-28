// The way into the app, in the site's opening: the lockup on black, a red square stepping through the letters
// while the app gets ready, then the three panels sweeping away to the right and uncovering the app. It plays
// when the app is opened from the site (whose Launch App ends on black) and after a wallet connects; `cover`
// first sweeps the panels in over the screen that is there, the way the site's Launch App does.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mark } from "./brand";
import { reduceMotion } from "./kit";

const WORD = "KILLSWITCH";
const STEP_MS = 62;

export function Gate({ cover, ready, onDone }: { cover: boolean; ready: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<"cover" | "scan" | "out">(cover ? "cover" : "scan");
  const [lit, setLit] = useState(-1);
  const isReady = useRef(ready);
  isReady.current = ready;
  const done = useRef(onDone);
  done.current = onDone;

  // the page under it was held black by index.html until now; while the gate covers it, the page's own
  // entrances wait (gate.css), and they play as the panels sweep away
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("entering");
    root.setAttribute("data-gate", "");
    if (reduceMotion()) done.current();
    return () => root.removeAttribute("data-gate");
  }, []);
  useEffect(() => {
    if (phase === "out") document.documentElement.removeAttribute("data-gate");
  }, [phase]);

  useEffect(() => {
    if (phase !== "cover") return;
    const t = setTimeout(() => setPhase("scan"), 640);
    return () => clearTimeout(t);
  }, [phase]);

  // the square runs through the word; when it reaches the end the app is ready, or it runs through again
  useEffect(() => {
    if (phase !== "scan") return;
    let i = -1;
    let t = 0;
    const tick = () => {
      i++;
      setLit(i);
      if (i < WORD.length) {
        t = window.setTimeout(tick, STEP_MS);
        return;
      }
      if (isReady.current) {
        t = window.setTimeout(() => setPhase("out"), 380);
        return;
      }
      t = window.setTimeout(() => {
        i = -1;
        setLit(-1);
        tick();
      }, 420);
    };
    t = window.setTimeout(tick, 200);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => done.current(), 860);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div className={`gate is-${phase}`} aria-hidden="true">
      <div className="gate-panels">
        <i />
        <i />
        <i />
      </div>
      <div className="gate-lockup">
        <Mark className={lit >= WORD.length ? "is-on" : ""} />
        <span className="gate-word">
          {WORD.split("").map((c, k) => (
            <span key={k} className={k < lit ? "is-lit" : k === lit ? "is-at" : undefined}>
              {c}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
