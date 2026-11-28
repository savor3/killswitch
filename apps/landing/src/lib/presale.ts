// The pre-sale's dates, state and numbers in one place (config.ts holds the terms), shared by the bar on the
// home page and the pre-sale page. Anything that depends on the clock is only worked out in the browser, after
// the page has started: the prerendered HTML has no "now", so it says nothing that would be wrong a minute later.
import { useEffect, useState } from "react";
import { PRESALE } from "../config";

export const OPENS = Date.parse(PRESALE.opens);
/** TGE day, from its first minute (UTC): the sale has closed by then */
export const TGE = Date.parse(`${PRESALE.tge}T00:00:00Z`);

/** soon: before it opens; open; full: the hard cap is reached; closed: TGE has come */
export type SalePhase = "soon" | "open" | "full" | "closed";
export function phaseAt(now: number, committed = PRESALE.committed): SalePhase {
  if (now < OPENS) return "soon";
  if (now >= TGE) return "closed";
  return committed >= PRESALE.target ? "full" : "open";
}

/** The amount committed so far, in USD. On the dev server `?committed=88700` tries the bars with an amount;
 *  the built site always shows the real figure, so no address can make it show another. */
export function committedNow() {
  let n: number = PRESALE.committed;
  if (import.meta.env.DEV && typeof location !== "undefined") {
    const v = new URLSearchParams(location.search).get("committed");
    const t = v === null ? NaN : Number(v);
    if (Number.isFinite(t) && t >= 0) n = t;
  }
  return Math.min(n, PRESALE.target);
}

/** The time, ticking every `ms`; null until the page has started in the browser. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** True once the page has started in the browser (false while prerendering and on the first render after). */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export const usd = (n: number, cents = false) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
export const whole = (n: number) => Math.round(n).toLocaleString("en-US");

// fixed English dates, the same in every browser and in the prerender
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const o = new Date(OPENS);
const t = new Date(TGE);
const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
/** "December 3" */
export const OPENS_DAY = `${MONTHS[o.getUTCMonth()]} ${o.getUTCDate()}`;
/** "Thursday, December 3, 2026" */
export const OPENS_LONG = `${DAYS[o.getUTCDay()]}, ${OPENS_DAY}, ${o.getUTCFullYear()}`;
/** "15:00 UTC" */
export const OPENS_TIME = `${hm(o)} UTC`;
/** "December 9" and "Wednesday, December 9, 2026" */
export const TGE_DAY = `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
export const TGE_LONG = `${DAYS[t.getUTCDay()]}, ${TGE_DAY}, ${t.getUTCFullYear()}`;

/** The opening in the visitor's own time, e.g. "20:30 your time (Thursday)"; browser only. */
export function localOpening() {
  const d = new Date(OPENS);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.getDate() === o.getUTCDate();
  return sameDay ? `${time} your time` : `${time} your time, ${d.toLocaleDateString([], { weekday: "long" })}`;
}
