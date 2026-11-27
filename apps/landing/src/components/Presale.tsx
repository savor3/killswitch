// The $KILL pre-sale as a bar of 100 squares, one per 2,500 USD of the 250,000 USD maximum (config.ts,
// PRESALE). What has really been committed fills the squares red from the left, one after another, the first
// time the bar comes into view, with the amount counting up alongside; the square being filled fills from the
// bottom. Before the sale opens the bar stands empty with the days left, and a red square runs along it once,
// the way the loader's square runs along the wordmark.
// To review the fill before there are commitments, open the dev server with ?committed=87500. Only the dev
// server reads it: the built page always shows the real figure, so no address can make it show another.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PRESALE } from "../config";
import { reduceMotion, useInView } from "../lib/motion";

const CELLS = 100;
const STEP = PRESALE.target / CELLS;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Whole days from now to the opening day (local midnight); 0 or less once it has come. */
function daysLeft(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.ceil((new Date(y, m - 1, d).getTime() - Date.now()) / 86_400_000);
}

/** A committed amount to try the bar with, on the dev server only. */
function trial(): number | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get("committed");
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function Presale() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.45);
  const [on, setOn] = useState(reduceMotion); // set once, the first time the bar is seen (at once with reduced motion)
  const [committed] = useState(() => Math.min(trial() ?? PRESALE.committed, PRESALE.target));
  const [shown, setShown] = useState(reduceMotion() ? committed : 0);
  const [days, setDays] = useState(() => daysLeft(PRESALE.opens));
  const full = Math.floor(committed / STEP); // whole squares
  const part = committed / STEP - full; // how far the next square is filled, 0..1
  const gap = Math.max(12, Math.min(30, 1500 / Math.max(1, full))); // ms from one square to the next
  const opensOn = new Date(`${PRESALE.opens}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });

  useEffect(() => {
    if (seen) setOn(true);
  }, [seen]);

  // the amount counts up in step with the squares, once: a square's worth as each one flashes white, then
  // the part of the last one as it fills from the bottom (timings as in sections.css)
  useEffect(() => {
    if (!on) return;
    if (reduceMotion() || committed <= 0) {
      setShown(committed);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const e = now - t0;
      const whole = Math.min(1, Math.max(0, (e - 290) / Math.max(1, full * gap)));
      const rest = part > 0 ? 1 - Math.pow(1 - Math.min(1, Math.max(0, (e - 220 - full * gap) / 700)), 3) : 0;
      if (e < 300 + full * gap + 950) {
        setShown(full * STEP * whole + part * STEP * rest);
        raf = requestAnimationFrame(tick);
      } else setShown(committed);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, committed, full, part, gap]);

  // the days left, kept right for a page left open overnight
  useEffect(() => {
    const id = setInterval(() => setDays(daysLeft(PRESALE.opens)), 60_000);
    return () => clearInterval(id);
  }, []);

  const status = days > 0 ? `Opens ${opensOn}, in ${days} day${days === 1 ? "" : "s"}` : "Open now";
  const pct = (shown / PRESALE.target) * 100;

  return (
    <div className={`presale ${on ? "is-on" : ""} ${committed <= 0 ? "is-empty" : ""}`} ref={ref}>
      <div className="presale-head">
        <span className="token-label">Pre-sale</span>
        <span className="presale-when">{status}</span>
      </div>
      <div className="presale-nums">
        <p className="presale-amount">
          <b>{usd(shown)}</b>
          <span>committed of {usd(PRESALE.target)} max</span>
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
      <div className="presale-scale" aria-hidden="true">
        <span>Each square is {usd(STEP)}</span>
        <span>{usd(PRESALE.target)}</span>
      </div>
    </div>
  );
}
