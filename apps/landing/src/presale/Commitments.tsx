// Who has committed: the newest commitments from the sale's own record (lib/feed.ts), each with its address,
// its amount as a run of red squares ($250 a square), what it buys and a link to its transaction; the buyers,
// the average and the largest beside them; and, when the web app has a wallet connected on this address, that
// wallet's own commitments picked out. Before the record exists the list stands empty and says so.
import { useState, type CSSProperties } from "react";
import { PRESALE } from "../config";
import type { Commitment, FeedState } from "../lib/feed";
import { OPENS_DAY, OPENS_TIME, usd, useNow, whole } from "../lib/presale";
import { short, useWallet } from "../lib/wallet";

const PER_SQUARE = 250;
const MAX_SQUARES = 20;
const SHOWN = 8;

function ago(now: number, t: number) {
  const s = Math.max(0, Math.floor(now / 1000 - t));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function Row({ c, now, mine }: { c: Commitment; now: number | null; mine: boolean }) {
  const n = Math.max(1, Math.min(MAX_SQUARES, Math.round(c.usd / PER_SQUARE)));
  return (
    <li className={mine ? "is-mine" : undefined}>
      <span className="led-sq" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <i key={i} style={{ "--i": i } as CSSProperties} />
        ))}
        {c.usd > PER_SQUARE * MAX_SQUARES && <b>+</b>}
      </span>
      <span className="led-addr">
        {short(c.address)}
        {mine && <em>You</em>}
      </span>
      <span className="led-usd">{usd(c.usd)}</span>
      <span className="led-kill">{whole(c.usd / PRESALE.price)} $KILL</span>
      <span className="led-time">{now === null ? "" : ago(now, c.time)}</span>
      {c.tx ? (
        <a className="led-tx" href={`${PRESALE.explorerTx}${c.tx}`} target="_blank" rel="noopener" aria-label={`Transaction of ${short(c.address)}`}>
          ↗
        </a>
      ) : (
        <span className="led-tx" />
      )}
    </li>
  );
}

export function Commitments({ state }: { state: FeedState }) {
  const wallet = useWallet()?.toLowerCase() ?? null;
  const now = useNow(15_000);
  const [all, setAll] = useState(false);

  const feed = state.kind === "ok" ? state.feed : null;
  const items = feed?.items ?? [];
  const mine = wallet ? items.filter((c) => c.address.toLowerCase() === wallet) : [];
  const mineUsd = mine.reduce((s, c) => s + c.usd, 0);
  const largest = items.reduce((m, c) => Math.max(m, c.usd), 0);
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <section className="pg-block who" id="commitments" aria-labelledby="who-h">
      <div className="pg-in">
        <div className="pg-head">
          <span className="eyebrow">
            <i aria-hidden="true" />
            Commitments
          </span>
          <h2 id="who-h" className="pg-h2">
            Who has committed.
          </h2>
        </div>

        <div className={`who-grid ${feed ? "" : "is-bare"}`}>
          {/* the figures only once there are commitments: before that they would be four dashes */}
          {feed && (
          <dl className="who-stats">
            <div>
              <dt>Buyers</dt>
              <dd>{feed ? whole(feed.buyers) : "–"}</dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd>{feed && feed.buyers ? usd(feed.committed / feed.buyers) : "–"}</dd>
            </div>
            <div>
              <dt>Largest</dt>
              <dd>{largest ? usd(largest) : "–"}</dd>
            </div>
            <div>
              <dt>Latest</dt>
              <dd>{items[0] && now !== null ? ago(now, items[0].time) : "–"}</dd>
            </div>
            {wallet && feed && (
              <div className="who-you">
                <dt>Your wallet · {short(wallet)}</dt>
                <dd>{mine.length ? `${usd(mineUsd)} · ${whole(mineUsd / PRESALE.price)} $KILL` : "No commitment in the latest list"}</dd>
              </div>
            )}
          </dl>
          )}

          <div className={`ledger is-${state.kind}`} aria-busy={state.kind === "loading"}>
            <div className="ledger-head" aria-hidden="true">
              <span>Amount</span>
              <span>Address</span>
              <span>USD</span>
              <span>$KILL</span>
              <span>When</span>
              <span />
            </div>
            {state.kind === "ok" && items.length > 0 ? (
              <ol className="ledger-rows">
                {shown.map((c) => (
                  <Row key={`${c.tx ?? c.address}-${c.time}`} c={c} now={now} mine={!!wallet && c.address.toLowerCase() === wallet} />
                ))}
              </ol>
            ) : (
              <ol className="ledger-rows is-blank" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <li key={i} style={{ "--i": i, "--w": `${[62, 48, 74, 40, 56][i]}%` } as CSSProperties}>
                    <span className="led-sq">
                      {Array.from({ length: [6, 3, 10, 2, 5][i] }, (_, j) => (
                        <i key={j} />
                      ))}
                    </span>
                    <span className="led-bar" />
                  </li>
                ))}
              </ol>
            )}
            <p className="ledger-foot" role="status">
              {state.kind === "off" && `No commitments yet. The sale opens ${OPENS_DAY} at ${OPENS_TIME}.`}
              {state.kind === "loading" && "Loading the latest commitments…"}
              {state.kind === "error" && `The record could not be loaded (${state.message}). Trying again in 30 seconds.`}
              {state.kind === "ok" && items.length === 0 && "No commitments yet."}
              {state.kind === "ok" && state.stale && "The record did not answer just now. Showing the last list it sent."}
            </p>
            {state.kind === "ok" && items.length > SHOWN && (
              <button className="ledger-more" type="button" onClick={() => setAll(!all)} aria-expanded={all}>
                {all ? "Show fewer" : `Show all ${items.length} of the latest`}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
