// The footer, after the reference's: a "get started" block over a field of dots in which the Killswitch mark
// shows as a light passes through it; the links on a four-column grid of hairlines; then the wordmark across
// the full width, its letters rising one after another out of the bottom edge as it comes into view.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WORDMARK } from "../brand/brand-geometry";
import { Mark } from "../brand/Logo";
import { APP_URL, GITHUB_URL, WHITEPAPER_URL } from "../config";
import { useInView } from "../lib/motion";
import { DitherField } from "./DitherField";
import { WordReveal } from "./WordReveal";

// the wordmark letter by letter: K is three outlines, every other letter one
const OUTLINES = WORDMARK.path.split(/(?=M)/);
const LETTERS = [OUTLINES.slice(0, 3).join(""), ...OUTLINES.slice(3)];

export function Footer() {
  const word = useRef<HTMLDivElement>(null);
  const seen = useInView(word, 0.35);
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (seen) setUp(true);
  }, [seen]);

  return (
    <footer className="ftr">
      <div className="ftr-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <section className="ftr-go" aria-labelledby="ftr-h">
        <DitherField />
        <div className="ftr-go-in">
          <span className="ftr-eyebrow">
            <i className="hatch" aria-hidden="true" />
            Get started
          </span>
          <WordReveal as="h2" id="ftr-h" className="ftr-h2" text={"Humans set the limits.\n*Machines* *obey.*"} start={0.95} end={0.55} />
          <p className="ftr-lead" data-rv="up">
            Give each agent a budget, not your keys. Open source, on the Base Sepolia test network.
          </p>
          <div className="ftr-cta" data-rv="up" style={{ "--rv-i": 1 } as CSSProperties}>
            <a className="sbtn sbtn-red" href={APP_URL} target="_blank" rel="noopener">
              <span>Launch App</span>
              <i aria-hidden="true">
                <b>→</b>
              </i>
            </a>
            <a className="sbtn sbtn-dark" href={WHITEPAPER_URL} target="_blank" rel="noopener">
              <span>Read the Whitepaper</span>
              <i aria-hidden="true">
                <b>↗</b>
              </i>
            </a>
          </div>
        </div>
      </section>

      <div className="ftr-grid">
        <a className="ftr-brand" href="#top" aria-label="Killswitch, back to top" data-rv="up">
          <Mark />
        </a>
        <nav aria-label="Product" data-rv="up" style={{ "--rv-i": 1 } as CSSProperties}>
          <h3>Product</h3>
          <a href="#how">How It Works</a>
          <a href="#security">Security</a>
          <a href="#developers">Developers</a>
          <a href="#token">$KILL</a>
        </nav>
        <nav aria-label="Use it" data-rv="up" style={{ "--rv-i": 2 } as CSSProperties}>
          <h3>Use It</h3>
          <a href={APP_URL} target="_blank" rel="noopener">
            Launch App
          </a>
          <a href={WHITEPAPER_URL} target="_blank" rel="noopener">
            Whitepaper
          </a>
        </nav>
        <nav aria-label="Code" data-rv="up" style={{ "--rv-i": 3 } as CSSProperties}>
          <h3>Code</h3>
          <a href={GITHUB_URL} target="_blank" rel="noopener">
            GitHub
          </a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noopener">
            MIT License
          </a>
          <p className="ftr-note">
            Killswitch runs on the Base Sepolia test network and has not been audited yet. Do not use it with real funds.
            Nothing on this page is financial advice.
          </p>
        </nav>
      </div>

      <div className={`ftr-word ${up ? "is-up" : ""}`} ref={word} aria-hidden="true">
        <svg viewBox={WORDMARK.viewBox}>
          {LETTERS.map((d, i) => (
            <path key={i} d={d} style={{ "--i": i } as CSSProperties} />
          ))}
        </svg>
      </div>
      <p className="ftr-copy">© 2026 Killswitch. Open source under the MIT license.</p>
    </footer>
  );
}
