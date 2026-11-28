// The $KILL token, as whitepaper v1.1 chapter 15 states it. Facts only, with the paper's own notice.
import type { CSSProperties } from "react";
import { PRESALE_URL, WHITEPAPER_URL } from "../config";
import { Presale } from "./Presale";
import { WordReveal } from "./WordReveal";

export function Token() {
  return (
    <section className="token" id="token" aria-labelledby="token-h">
      <div className="token-top">
        <h2 id="token-h" className="token-label">
          The $KILL token
        </h2>
        <WordReveal as="p" className="token-big" text={"Pre-sale December~3.\n*TGE* *December~9.*"} start={0.95} end={0.5} />
      </div>
      <div data-rv="up">
        <Presale />
      </div>
      <div className="token-mid">
        <p className="token-label token-label-r" data-rv="fade">
          Four jobs on the guardian network
        </p>
        <WordReveal as="p" className="token-jobs" text="Guardian bonds. Review fees. Blocklist stakes. Governance." start={0.98} end={0.55} />
      </div>
      <div className="token-bottom">
        <div className="token-copy" data-rv="up">
          <p>
            $KILL is the bond and the unit of payment for a network of independent guardians. Your caps never depend on it:
            no cap, pause or kill switch needs the token.
          </p>
          <div className="token-links">
            <a className="sbtn sbtn-red" href={PRESALE_URL}>
              <span>The Pre-sale</span>
              <i aria-hidden="true">
                <b>→</b>
              </i>
            </a>
            <a className="token-link" href={WHITEPAPER_URL} target="_blank" rel="noopener">
              Read the token chapter
            </a>
          </div>
        </div>
        <dl className="token-facts">
          {[
            ["Fixed supply", "1,000,000,000"],
            ["Pre-sale price", "$0.0025"],
            ["Offered in the pre-sale", "10%"],
            ["Network", "Base"],
          ].map(([k, v], i) => (
            <div key={k} data-rv="up" style={{ "--rv-i": i + 1 } as CSSProperties}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="token-note" data-rv="fade">
        For information only, not financial advice or a promise of return. The sale is subject to its published terms and
        is not open in every country. None of the token’s jobs is live at TGE.
      </p>
      <span className="px" aria-hidden="true" />
    </section>
  );
}
