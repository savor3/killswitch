// What the $250,000 pays for (whitepaper v1.1 table 15.5): a bar of 100 squares, one for each percent, coloured
// by use. Pointing at a use picks out its squares.
import { useState, type CSSProperties } from "react";
import { PRESALE } from "../config";
import { usd } from "../lib/presale";

const USES = [
  { key: "audit", name: "Security audit and bug bounty", share: 30 },
  { key: "build", name: "Guardian network and staking contracts", share: 30 },
  { key: "liquidity", name: "Liquidity at TGE", share: 20 },
  { key: "legal", name: "Legal and compliance", share: 10 },
  { key: "ops", name: "Infrastructure and operations", share: 10 },
];

export function Proceeds() {
  const [pick, setPick] = useState<string | null>(null);
  return (
    <section className="pg-block proceeds" id="proceeds" aria-labelledby="proceeds-h">
      <div className="pg-in">
        <div className="pg-head">
          <span className="eyebrow">
            <i aria-hidden="true" />
            Use of proceeds
          </span>
          <h2 id="proceeds-h" className="pg-h2">
            Where the {usd(PRESALE.target)} goes.
          </h2>
        </div>
        <div className={`proceeds-bar ${pick ? "is-picking" : ""}`} aria-hidden="true">
          {USES.flatMap((u) => Array.from({ length: u.share }, (_, j) => <i key={`${u.key}${j}`} data-u={u.key} className={pick === u.key ? "is-pick" : undefined} />))}
        </div>
        <ol className="proceeds-uses" onMouseLeave={() => setPick(null)}>
          {USES.map((u) => (
            <li
              key={u.key}
              style={{ "--w": u.share } as CSSProperties}
              className={pick === u.key ? "is-pick" : undefined}
              onMouseEnter={() => setPick(u.key)}
            >
              <i className="proceeds-key" data-u={u.key} aria-hidden="true" />
              <b>{usd((PRESALE.target * u.share) / 100)}</b>
              <span>{u.name}</span>
              <small>{u.share}%</small>
            </li>
          ))}
        </ol>
        <p className="pg-note">Held in a multisig. Its address and signers are published when the sale closes.</p>
      </div>
    </section>
  );
}
