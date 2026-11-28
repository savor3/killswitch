// Connecting the owner's wallet: every wallet installed in this browser, by its own name and icon (EIP-6963),
// and what is happening with the one chosen: waiting for the person to confirm in it, waiting for it to move to
// the app's network, connected, or why it didn't connect (closed by the person, the network switch refused, a
// request already open in the wallet, no answer). A wallet that stays quiet gets a hint after a few seconds and a
// way to stop waiting. With no wallet installed, where to get one, and on a phone, how to open the app inside a
// wallet's own browser.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Btn, Px, Sq } from "./kit";
import { chainOf, listWallets, walletError, type Config, type WalletInfo } from "./lib";
import { Icon } from "./ui";

type Step = "account" | "network" | "done";
const QUIET_MS = 6000;

export function ConnectStep({ cfg, onConnect, onDev }: {
  cfg: Config;
  onConnect: (w: WalletInfo, step: (s: "account" | "network") => void, live: () => boolean) => Promise<void>;
  onDev: () => void;
}) {
  const [wallets, setWallets] = useState<WalletInfo[] | null>(null);
  const [at, setAt] = useState<{ rdns: string; step: Step } | null>(null);
  const [err, setErr] = useState<{ rdns: string; kind: string; text: string } | null>(null);
  const [quiet, setQuiet] = useState(false);
  // every try gets a number: stopping, or a newer try, makes an older try's late answer count for nothing
  const run = useRef(0);
  const net = chainOf(cfg).name;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  // iPads call themselves Macs, but have a touch screen
  const phone = /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const nameOf = (rdns: string) => wallets?.find((w) => w.rdns === rdns)?.name ?? "your wallet";

  const look = () => {
    setWallets(null);
    listWallets().then(setWallets);
  };
  useEffect(look, []);

  // the wallet has said nothing for a while: its window may be hidden behind this one
  useEffect(() => {
    setQuiet(false);
    if (!at || at.step === "done") return;
    const t = setTimeout(() => setQuiet(true), QUIET_MS);
    return () => clearTimeout(t);
  }, [at]);

  const go = async (w: WalletInfo) => {
    const me = ++run.current;
    const live = () => run.current === me;
    const now: { step: Step } = { step: "account" };
    setErr(null);
    setAt({ rdns: w.rdns, step: now.step });
    try {
      await onConnect(
        w,
        (s) => {
          now.step = s;
          if (live()) setAt({ rdns: w.rdns, step: s });
        },
        live,
      );
      if (live()) setAt({ rdns: w.rdns, step: "done" });
    } catch (e) {
      if (!live()) return;
      setAt(null);
      const why = walletError(e, w.name);
      // refused at the network step: the address was shared by then, so say what was refused
      setErr(
        now.step === "network" && why.kind === "rejected"
          ? { rdns: w.rdns, kind: "network", text: `${w.name} stayed on another network. Killswitch runs on ${net}: try again and accept the switch.` }
          : { rdns: w.rdns, ...why },
      );
    }
  };
  const stop = () => {
    run.current++;
    setAt(null);
  };

  const line = (w: WalletInfo) => {
    if (at?.rdns === w.rdns)
      return at.step === "account" ? `Confirm in ${w.name}` : at.step === "network" ? `Switch to ${net} in ${w.name}` : "Connected";
    if (err?.rdns === w.rdns)
      return err.kind === "rejected"
        ? "Closed. Try again"
        : err.kind === "network"
          ? "Network not switched"
          : err.kind === "pending"
            ? "A request is open in it"
            : "Didn't connect";
    return w.rdns === "injected" ? "In this browser" : "Installed";
  };

  return (
    <>
      <h2>Connect your wallet</h2>
      <p>It becomes the master key: only it can change limits, approve payments or stop agents.</p>

      {wallets === null ? (
        <div className="wl-look" role="status">
          <Px /> Looking for wallets in this browser
        </div>
      ) : wallets.length ? (
        <ul className="wl" aria-label="Wallets in this browser">
          {wallets.map((w, k) => {
            const mine = at?.rdns === w.rdns;
            return (
              <li key={w.rdns} style={{ "--i": k } as CSSProperties}>
                <button
                  type="button"
                  className={`wl-i ${mine ? `is-${at!.step}` : ""} ${err?.rdns === w.rdns ? "is-bad" : ""}`}
                  disabled={!!at}
                  aria-busy={mine && at!.step !== "done"}
                  onClick={() => go(w)}
                >
                  <span className="wl-ic">{w.icon ? <img src={w.icon} alt="" width={28} height={28} /> : <Icon name="wallet" size={18} />}</span>
                  <span className="wl-t">
                    <b>{w.name}</b>
                    <span className="lbl">{line(w)}</span>
                  </span>
                  <span className="wl-r">{mine ? at!.step === "done" ? <Sq s="ok" /> : <Px /> : <Icon name="chevron" size={16} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="wl-none">
          <Sq s="off" lg />
          <b>No wallet in this browser</b>
          <p>
            {phone
              ? "On a phone, open this page in your wallet app's own browser, or install a wallet app first."
              : "Install a browser wallet, then come back to this page. Your wallet stays yours: Killswitch only asks it to sign."}
          </p>
          <div className="wl-get">
            {phone && (
              <a className="btn ink" href={`https://metamask.app.link/dapp/${location.host}${location.pathname}`}>
                Open in MetaMask
              </a>
            )}
            <a href="https://metamask.io/download/" target="_blank" rel="noopener">
              MetaMask <Icon name="external" size={13} />
            </a>
            <a href="https://rabby.io/" target="_blank" rel="noopener">
              Rabby <Icon name="external" size={13} />
            </a>
            <a href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noopener">
              Coinbase Wallet <Icon name="external" size={13} />
            </a>
          </div>
          <button type="button" className="wl-again" onClick={look}>
            I've installed one: look again
          </button>
        </div>
      )}

      {quiet && at && at.step !== "done" && (
        <p className="wl-quiet" role="status">
          {phone ? `Can't see the request? Open ${nameOf(at.rdns)}.` : `Can't see ${nameOf(at.rdns)}'s window? Click its icon in the browser's toolbar.`}{" "}
          <button type="button" className="linkish" onClick={stop}>
            Stop waiting
          </button>
        </p>
      )}

      {err && (
        <p className="wl-err" role="alert">
          <Sq s="bad" />
          {err.text}
        </p>
      )}

      {cfg.chainId === 31337 && (
        <Btn kind="grey" size="lg" full disabled={!!at} onClick={onDev}>
          Use the local test wallet
        </Btn>
      )}

      <p className="muted wl-note">
        Connecting shares your wallet's public address, nothing else. Your keys never leave your wallet, and nobody
        will ask for your recovery phrase.
      </p>
    </>
  );
}
