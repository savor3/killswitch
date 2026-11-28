// How far the $KILL pre-sale has got: the amount committed of the hard cap (config.ts, PRESALE) over a bar of
// LED squares, the site's own picture of progress. What has really been committed fills the squares red from
// the left, one after another, the first time the bar comes into view, with the amount counting up alongside;
// the square being filled fills from the bottom. Before anything is committed the bar stands empty, and a red
// square runs along it once, the way the loader's square runs along the wordmark.
// To review the fill before there are commitments, open the dev server with ?committed=87500 (lib/presale.ts).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PRESALE } from "../config";
import { reduceMotion, useInView } from "../lib/motion";
import { committedNow, OPENS, OPENS_DAY, OPENS_TIME, phaseAt, usd, useNow } from "../lib/presale";

const CELLS = 100;
const STEP = PRESALE.target / CELLS;

/** "in 6 days", "in 5 hours", "in 12 minutes" */
function until(ms: number) {
  const d = Math.floor(ms / 86_400_000);
  if (d >= 1) return `in ${d} day${d === 1 ? "" : "s"}`;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return `in ${m} minute${m === 1 ? "" : "s"}`;
}

/** `head`: the label and the opening above the bar (the pre-sale page has its own countdown, so leaves it out).
 *  `committed`: a live figure from the sale's record (lib/feed.ts), in place of the one in config.ts. */
export function Presale({ head = true, committed: live }: { head?: boolean; committed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.45);
  const [on, setOn] = useState(false); // set once, the first time the bar is seen
  const [base] = useState(committedNow);
  const committed = Math.min(live ?? base, PRESALE.target);
  // the real figure until the count starts, so the page reads right before (or without) its script
  const [shown, setShown] = useState(committed);
  // after the first count, a new figure is simply shown: the bar fills without playing again
  const [settled, setSettled] = useState(false);
  const now = useNow(30_000);
  const full = Math.floor(committed / STEP); // whole squares
  const part = committed / STEP - full; // how far the next square is filled, 0..1
  const gap = Math.max(12, Math.min(30, 1500 / Math.max(1, full))); // ms from one square to the next

  useEffect(() => {
    if (seen || reduceMotion()) setOn(true);
  }, [seen]);

  // the amount counts up in step with the squares, once: a square's worth as each one flashes white, then
  // the part of the last one as it fills from the bottom (timings as in sections.css)
  useEffect(() => {
    if (!on) return;
    if (settled || reduceMotion() || committed <= 0) {
      setShown(committed);
      return;
    }
    let raf = 0;
    let t0 = 0;
    setShown(0);
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const e = now - t0;
      const whole = Math.min(1, Math.max(0, (e - 290) / Math.max(1, full * gap)));
      const rest = part > 0 ? 1 - Math.pow(1 - Math.min(1, Math.max(0, (e - 220 - full * gap) / 700)), 3) : 0;
      if (e < 300 + full * gap + 950) {
        setShown(full * STEP * whole + part * STEP * rest);
        raf = requestAnimationFrame(tick);
      } else {
        setShown(committed);
        setSettled(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, committed, full, part, gap, settled]);

  const phase = now === null ? null : phaseAt(now, committed);
  const status =
    phase === null || phase === "soon"
      ? `Opens ${OPENS_DAY}, ${phase === null ? OPENS_TIME : until(OPENS - now!)}`
      : phase === "open"
        ? "Open now"
        : phase === "full"
          ? "Sold out"
          : "Closed";
  const pct = (shown / PRESALE.target) * 100;

  return (
    <div className={`presale ${on ? "is-on" : ""} ${committed <= 0 ? "is-empty" : ""} ${settled ? "is-settled" : ""}`} ref={ref}>
      {head && (
        <div className="presale-head">
          <span className="token-label">Pre-sale</span>
          <span className="presale-when">{status}</span>
        </div>
      )}
      <div className="presale-nums">
        <p className="presale-amount">
          <b>{usd(Math.round(shown))}</b>
          <span>committed of {usd(PRESALE.target)} hard cap</span>
        </p>
        <span className={`presale-pct ${committed > 0 ? "is-some" : ""}`}>{pct > 0 && pct < 1 ? "<1" : Math.round(pct)}%</span>
      </div>
      <div
        className="presale-bar"
        role="progressbar"
        aria-label="Pre-sale committed"
        aria-valuemin={0}
        aria-valuemax={PRESALE.target}
        aria-valuenow={committed}
        aria-valuetext={`${usd(committed)} of ${usd(PRESALE.target)} committed`}
        style={{ "--gap": `${gap}ms` } as CSSProperties}
      >
        {Array.from({ length: CELLS }, (_, i) => (
          <i
            key={i}
            className={i < full ? "is-full" : i === full && part > 0 ? "is-part" : undefined}
            style={{ "--i": i, ...(i === full && part > 0 ? { "--f": part.toFixed(3) } : null) } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
