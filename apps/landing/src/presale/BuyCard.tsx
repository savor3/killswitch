// The card to buy with, in the form people know from other sales: the time to the opening and the price, the
// round, the first trading pool's price, what you pay and what you get, and one button. The sale runs on an
// established launch platform, not on a contract of ours (whitepaper v1.1, table 15.4; chapter 16 keeps real
// funds off our own contracts before an audit), so the card takes no funds itself: it connects the wallet the
// way the web app does (lib/wallet.ts, shared with the app at /app/), and once the sale is open its button
// goes on to the platform's sale (config.ts PRESALE.joinUrl), where the commitment is made.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Mark } from "../brand/Logo";
import { Identicon } from "../components/Identicon";
import { GITHUB_URL, PRESALE } from "../config";
import type { FeedState } from "../lib/feed";
import { localOpening, OPENS, OPENS_DAY, OPENS_TIME, TGE_DAY, usd, whole, type SalePhase } from "../lib/presale";
import { connectWallet, disconnectWallet, listWallets, short, useWallet, walletError, type WalletInfo } from "../lib/wallet";

const QUICK = [100, 500, 1000, 5000];
const pad = (n: number) => String(n).padStart(2, "0");

type Check = { ok: true; amount: number } | { ok: false; error: string | null; now?: boolean };
/** An amount as typed: fine, or what is wrong with it (`now`: said at once, the rest once the field is left). */
function check(raw: string, left: number): Check {
  const s = raw.replace(/[$,\s]/g, "");
  if (s === "") return { ok: false, error: null };
  if (!/^\d*\.?\d*$/.test(s) || s === ".") return { ok: false, error: "Numbers only, like 500 or 1250.50.", now: true };
  if (/\.\d{3,}$/.test(s)) return { ok: false, error: "Dollars and cents only.", now: true };
  const n = Number(s);
  if (!(n > 0)) return { ok: false, error: "Enter an amount above $0." };
  if (n > PRESALE.target) return { ok: false, error: `More than the whole sale: the hard cap is ${usd(PRESALE.target)}.`, now: true };
  if (n > left) return { ok: false, error: `Only ${usd(left)} is left in the sale.`, now: true };
  return { ok: true, amount: n };
}

const ic = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "square", "aria-hidden": true } as const;
const Lock = () => (
  <svg {...ic}>
    <rect x="4" y="11" width="16" height="10" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const Code = () => (
  <svg {...ic}>
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </svg>
);
const Shield = () => (
  <svg {...ic}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

function Countdown({ now }: { now: number }) {
  const left = Math.max(0, OPENS - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor(left / 3_600_000) % 24;
  const m = Math.floor(left / 60_000) % 60;
  const s = Math.floor(left / 1000) % 60;
  return (
    <span className="buy-clock" role="timer" aria-label={`${d} days, ${h} hours and ${m} minutes`}>
      <b>{pad(d)}</b>d <b>{pad(h)}</b>h <b>{pad(m)}</b>m <b>{pad(s)}</b>s
    </span>
  );
}

/** Every wallet in this browser; pick one and confirm in it. Cancel stops waiting, and a late answer is ignored. */
function Picker({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [wallets, setWallets] = useState<WalletInfo[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [err, setErr] = useState<{ rdns: string; kind: string; text: string } | null>(null);
  const run = useRef(0);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const phone = /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const look = () => {
    setWallets(null);
    listWallets().then(setWallets);
  };
  useEffect(look, []);

  const go = async (w: WalletInfo) => {
    const me = ++run.current;
    const live = () => run.current === me;
    setErr(null);
    setAt(w.rdns);
    try {
      const a = await connectWallet(w, live);
      if (!live()) return;
      setAt(null);
      if (a) onDone();
    } catch (e) {
      if (!live()) return;
      setAt(null);
      setErr({ rdns: w.rdns, ...walletError(e, w.name) });
    }
  };
  const line = (w: WalletInfo) =>
    at === w.rdns
      ? `Confirm in ${w.name}`
      : err?.rdns === w.rdns
        ? err.kind === "rejected"
          ? "Closed. Try again"
          : err.kind === "pending"
            ? "A request is open in it"
            : "Didn't connect"
        : w.rdns === "injected"
          ? "In this browser"
          : "Installed";

  return (
    <div className="buy-pick" role="group" aria-label="Choose a wallet">
      <div className="buy-pick-h">
        <b>Choose a wallet</b>
        <button
          type="button"
          className="buy-link"
          onClick={() => {
            run.current++;
            onCancel();
          }}
        >
          Cancel
        </button>
      </div>
      {wallets === null ? (
        <p className="buy-pick-look" role="status">
          Looking for wallets in this browser
        </p>
      ) : wallets.length ? (
        <ul>
          {wallets.map((w) => (
            <li key={w.rdns}>
              <button
                type="button"
                className={`${at === w.rdns ? "is-at" : ""} ${err?.rdns === w.rdns ? "is-bad" : ""}`}
                disabled={!!at}
                aria-busy={at === w.rdns}
                onClick={() => go(w)}
              >
                <span className="buy-pick-ic">{w.icon ? <img src={w.icon} alt="" width={22} height={22} /> : <i className="sq" />}</span>
                <span className="buy-pick-t">
                  <b>{w.name}</b>
                  <small className={err?.rdns === w.rdns ? "is-bad" : undefined}>{line(w)}</small>
                </span>
                <span className="buy-pick-r" aria-hidden="true">
                  {at === w.rdns ? <i className="sq is-tick" /> : "→"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="buy-pick-none">
          <p>
            {phone
              ? "No wallet here. Open this page in your wallet app's own browser."
              : "No wallet in this browser. Install one, then look again."}
          </p>
          <div>
            {phone && <a href={`https://metamask.app.link/dapp/${location.host}${location.pathname}`}>Open in MetaMask</a>}
            <a href="https://metamask.io/download/" target="_blank" rel="noopener">
              MetaMask ↗
            </a>
            <a href="https://rabby.io/" target="_blank" rel="noopener">
              Rabby ↗
            </a>
          </div>
          <button type="button" className="buy-link" onClick={look}>
            Look again
          </button>
        </div>
      )}
      {err && (
        <p className="buy-msg" role="alert">
          <i className="sq" aria-hidden="true" />
          {err.text}
        </p>
      )}
    </div>
  );
}

export function BuyCard({ now, phase, committed, feed }: { now: number | null; phase: SalePhase | null; committed: number; feed: FeedState }) {
  const id = useId();
  const wallet = useWallet();
  const [cur, setCur] = useState(0);
  const [raw, setRaw] = useState("1,000");
  const [blurred, setBlurred] = useState(false);
  const [picking, setPicking] = useState(false);
  const left = Math.max(0, PRESALE.target - committed);
  const c = check(raw, left);
  const error = !c.ok && c.error && (blurred || c.now) ? c.error : null;
  const coin = PRESALE.currencies[cur] ?? PRESALE.currencies[0];
  const where = PRESALE.platform || "the launch platform";
  const amountNow = Number(raw.replace(/[$,\s]/g, ""));

  // what this wallet has committed already, from the sale's record
  const mine =
    wallet && feed.kind === "ok"
      ? feed.feed.items.filter((x) => x.address.toLowerCase() === wallet.toLowerCase()).reduce((s, x) => s + x.usd, 0)
      : 0;

  useEffect(() => {
    if (wallet) setPicking(false);
  }, [wallet]);

  const soon = phase === null || phase === "soon";
  const title = soon ? "One round, one price" : phase === "open" ? "Pre-sale open" : phase === "full" ? "Sold out" : "Closed";
  const sub = soon
    ? `Opens ${OPENS_DAY}, ${OPENS_TIME}${now !== null ? ` (${localOpening()})` : ""}. It closes when ${usd(PRESALE.target)} is committed.`
    : phase === "open"
      ? `${usd(left)} of ${usd(PRESALE.target)} left. It closes when the hard cap is reached.`
      : `$KILL is claimable on Base at TGE, ${TGE_DAY}.`;

  let action: ReactNode;
  if (!wallet) {
    action = picking ? (
      <Picker onDone={() => setPicking(false)} onCancel={() => setPicking(false)} />
    ) : (
      <button className="sbtn sbtn-red buy-go" type="button" onClick={() => setPicking(true)}>
        <span>Connect wallet</span>
        <i aria-hidden="true">
          <b>→</b>
        </i>
      </button>
    );
  } else if (phase === "open" && PRESALE.joinUrl && c.ok) {
    action = (
      <a className="sbtn sbtn-red buy-go" href={PRESALE.joinUrl} target="_blank" rel="noopener">
        <span>{PRESALE.platform ? `Commit on ${PRESALE.platform}` : "Go to the sale"}</span>
        <i aria-hidden="true">
          <b>↗</b>
        </i>
      </a>
    );
  } else {
    const why = soon
      ? `Opens ${OPENS_DAY}`
      : phase === "full"
        ? "Sold out"
        : phase === "closed"
          ? "Closed"
          : !c.ok
            ? "Enter an amount"
            : "The sale link appears here";
    action = (
      <span className="sbtn sbtn-wait buy-go" aria-disabled="true" role="status">
        <span>{why}</span>
      </span>
    );
  }

  return (
    <aside className="buy" aria-label="Buy $KILL">
      <div className="buy-top">
        <div>
          <span className="buy-k">{soon ? "Opens in" : "The sale"}</span>
          {soon ? (
            now === null ? (
              <span className="buy-clock">
                {OPENS_DAY}, {OPENS_TIME}
              </span>
            ) : (
              <Countdown now={now} />
            )
          ) : (
            <span className="buy-clock is-state">
              <i className={`sq ${phase === "open" ? "is-tick" : ""}`} aria-hidden="true" />
              {phase === "open" ? "Open now" : phase === "full" ? "Sold out" : "Closed"}
            </span>
          )}
        </div>
        <div className="buy-price">
          <span className="buy-k">Price per $KILL</span>
          <b>${PRESALE.price}</b>
        </div>
      </div>

      <div className="buy-state">
        <b>{title}</b>
        <p>{sub}</p>
      </div>

      <div className="buy-pool">
        <span>First trading pool</span>
        <b>${PRESALE.price} per $KILL</b>
        <small>At the pre-sale price. Planned, not guaranteed.</small>
      </div>

      {PRESALE.currencies.length > 1 && (
        <div className="buy-cur" role="radiogroup" aria-label="Pay with" style={{ "--n": PRESALE.currencies.length } as CSSProperties}>
          {PRESALE.currencies.map((x, i) => (
            <button key={x} type="button" role="radio" aria-checked={i === cur} onClick={() => setCur(i)}>
              {x}
            </button>
          ))}
        </div>
      )}

      <form className="buy-form" onSubmit={(e) => e.preventDefault()} noValidate>
        <label className="buy-label" htmlFor={`${id}-pay`}>
          You pay
        </label>
        <div className={`buy-field ${error ? "is-bad" : ""}`}>
          <input
            id={`${id}-pay`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="0"
            value={raw}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-msg`}
            onChange={(e) => {
              setRaw(e.target.value);
              if (check(e.target.value, left).ok) setBlurred(false);
            }}
            onBlur={() => setBlurred(true)}
          />
          <span className="buy-coin">{coin}</span>
        </div>
        <div className="buy-quick">
          {QUICK.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={amountNow === v}
              onClick={() => {
                setRaw(v.toLocaleString("en-US"));
                setBlurred(false);
              }}
            >
              {usd(v)}
            </button>
          ))}
        </div>
        <p className="buy-msg" id={`${id}-msg`} aria-live="polite">
          {error && (
            <>
              <i className="sq" aria-hidden="true" />
              {error}
            </>
          )}
        </p>
        <span className="buy-swap" aria-hidden="true">
          ↓
        </span>
        <span className="buy-label" id={`${id}-get-l`}>
          You get
        </span>
        <div className="buy-field">
          <output className={c.ok ? undefined : "is-none"} aria-labelledby={`${id}-get-l`} aria-live="polite">
            {c.ok ? whole(c.amount / PRESALE.price) : "0"}
          </output>
          <span className="buy-coin">
            <Mark />
            $KILL
          </span>
        </div>
        {wallet && (
          <div className="buy-wallet">
            <Identicon address={wallet} size={22} />
            <span title={wallet}>{short(wallet)}</span>
            {mine > 0 && <span className="buy-mine">{usd(mine)} committed</span>}
            <button type="button" className="buy-link" onClick={() => void disconnectWallet()}>
              Disconnect
            </button>
          </div>
        )}
        {action}
      </form>

      <ul className="buy-facts">
        <li>
          <Lock />
          Proceeds held in a multisig, published at close
        </li>
        <li>
          <Code />
          <span>
            Contracts open source,{" "}
            <a href={GITHUB_URL} target="_blank" rel="noopener">
              MIT licence ↗
            </a>
          </span>
        </li>
        <li>
          <Shield />
          30% of the proceeds fund an independent audit
        </li>
      </ul>
      <p className="buy-fine">
        You commit on {where}, under {PRESALE.termsUrl ? <a href={PRESALE.termsUrl} target="_blank" rel="noopener">the sale's terms</a> : "the sale's terms"}. Not
        open in every country. $KILL is claimable on Base at TGE, {TGE_DAY}.
      </p>
    </aside>
  );
}
