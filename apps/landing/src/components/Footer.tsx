// The footer, after the reference's: a "get started" block over a field of dots in which the Killswitch mark
// shows as a light passes through it; the links on a four-column grid of hairlines; then the wordmark across
// the full width, its letters rising one after another out of the bottom edge as it comes into view.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WORDMARK } from "../brand/brand-geometry";
import { Mark } from "../brand/Logo";
import { APP_URL, DOCS_URL, GITHUB_URL, PRESALE_URL, WHITEPAPER_URL } from "../config";
import { goToApp } from "../lib/launch";
import { useInView } from "../lib/motion";
import { homeLink, usePath } from "../site/where";
import { DitherField } from "./DitherField";
import { WordReveal } from "./WordReveal";

// the wordmark letter by letter: K is three outlines, every other letter one
const OUTLINES = WORDMARK.path.split(/(?=M)/);
const LETTERS = [OUTLINES.slice(0, 3).join(""), ...OUTLINES.slice(3)];

export function Footer() {
  const path = usePath();
  const at = (hash: string) => homeLink(path, hash);
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
            <a className="sbtn sbtn-red" href={APP_URL} onClick={goToApp}>
              <span>Launch App</span>
              <i aria-hidden="true">
                <b>→</b>
              </i>
            </a>
            <a className="sbtn sbtn-dark" href={DOCS_URL}>
              <span>Read the Docs</span>
              <i aria-hidden="true">
                <b>→</b>
              </i>
            </a>
          </div>
        </div>
      </section>

      <div className="ftr-grid">
        <a className="ftr-brand" href={path === "/" ? "#top" : "/"} aria-label={path === "/" ? "Killswitch, back to top" : "Killswitch home"} data-rv="up">
          <Mark />
        </a>
        <nav aria-label="Product" data-rv="up" style={{ "--rv-i": 1 } as CSSProperties}>
          <h3>Product</h3>
          <a href={at("#how")}>How It Works</a>
          <a href={at("#security")}>Security</a>
          <a href={at("#developers")}>Developers</a>
          <a href={PRESALE_URL}>$KILL Pre-sale</a>
        </nav>
        <nav aria-label="Resources" data-rv="up" style={{ "--rv-i": 2 } as CSSProperties}>
          <h3>Resources</h3>
          <a href={APP_URL} onClick={goToApp}>
            Launch App
          </a>
          <a href={DOCS_URL}>Docs</a>
          <a href={WHITEPAPER_URL} target="_blank" rel="noopener">
            Whitepaper
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener">
            GitHub
          </a>
        </nav>
        <nav aria-label="Legal" data-rv="up" style={{ "--rv-i": 3 } as CSSProperties}>
          <h3>Legal</h3>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Use</a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noopener">
            MIT License
          </a>
          <p className="ftr-note">
            Killswitch runs on the Base Sepolia test network and has not been audited yet. Do not use it with real funds.
            Nothing on this site is financial advice.
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
