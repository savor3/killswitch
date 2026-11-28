// The commitments to the pre-sale, newest first. The sale runs on the launch platform, so its record lives
// there: point PRESALE.feedUrl (config.ts) at a JSON address that gives
//   { "committed": 88700, "buyers": 412, "items": [{ "address": "0x…", "usd": 250, "tx": "0x…", "time": 1764774000 }] }
// (the platform's API, or a small reader of the sale contract's events); the page asks again every 30 seconds
// while it is open. Until it is set the page says where the list will come from, and shows nothing invented.
// On the dev server only, ?feed=sample fills it with a made-up list to review the design; the built site never
// can.
import { useEffect, useRef, useState } from "react";
import { PRESALE } from "../config";

export type Commitment = { address: string; usd: number; tx?: string; time: number };
export type Feed = { committed: number; buyers: number; items: Commitment[] };
export type FeedState =
  | { kind: "off" } // no feed set: the sale has not got a record to show yet
  | { kind: "loading" }
  | { kind: "ok"; feed: Feed; at: number; stale?: boolean }
  | { kind: "error"; message: string };

const POLL_MS = 30_000;

function sample(): Feed {
  // a fixed made-up list, the same on every load: dev server only
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const now = Math.floor(Date.now() / 1000);
  const items = Array.from({ length: 24 }, (_, i) => {
    const usd = Math.round(([50, 100, 250, 500, 1000, 2500, 5000][Math.floor(rnd() * 7)] * (0.6 + rnd() * 0.8)) / 10) * 10;
    const hex = Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
    return { address: `0x${hex}`, usd, tx: `0x${hex}${hex.slice(0, 24)}`, time: now - i * 97 - Math.floor(rnd() * 80) };
  });
  return { committed: 88_700, buyers: 412, items };
}

function valid(j: unknown): j is Feed {
  const f = j as Feed;
  return (
    !!f &&
    typeof f.committed === "number" &&
    typeof f.buyers === "number" &&
    Array.isArray(f.items) &&
    f.items.every((c) => typeof c.address === "string" && typeof c.usd === "number" && typeof c.time === "number")
  );
}

export function useFeed(): FeedState {
  const [state, setState] = useState<FeedState>(PRESALE.feedUrl ? { kind: "loading" } : { kind: "off" });
  const last = useRef<Feed | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("feed") === "sample") {
      setState({ kind: "ok", feed: sample(), at: Date.now() });
      return;
    }
    if (!PRESALE.feedUrl) return;
    let live = true;
    let timer = 0;
    const load = async () => {
      try {
        const r = await fetch(PRESALE.feedUrl, { cache: "no-store" });
        if (!r.ok) throw new Error(`the feed answered ${r.status}`);
        const j: unknown = await r.json();
        if (!valid(j)) throw new Error("the feed sent something unexpected");
        last.current = j;
        if (live) setState({ kind: "ok", feed: j, at: Date.now() });
      } catch (e) {
        if (!live) return;
        // keep showing the last good list, marked as possibly out of date
        if (last.current) setState({ kind: "ok", feed: last.current, at: Date.now(), stale: true });
        else setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
      if (live) timer = window.setTimeout(load, document.hidden ? POLL_MS * 4 : POLL_MS);
    };
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);
  return state;
}
