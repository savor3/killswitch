// The page for an address with nothing at it, everything on one centre line: "404" in red squares on a dark
// LED grid, then the words and the ways back. The squares light up column by column as the page opens, each
// flashing white before it settles red (as the pre-sale bar fills); then every few seconds a light runs
// through them, the way the opening's square runs through the wordmark; and red squares follow the pointer
// across the panel, as on the home page's cards. All of it is CSS but the pointer, so it plays before any
// script has run; with reduced motion the digits are simply there.
import type { CSSProperties } from "react";
import { PixelTrail } from "../components/PixelTrail";
import { APP_URL, DOCS_URL, PRESALE_URL } from "../config";
import { goToApp } from "../lib/launch";
import { Shell } from "../site/Shell";

// 3 x 5 squares a digit, a blank column between them
const GLYPHS: Record<string, string[]> = {
  "4": ["101", "101", "111", "001", "001"],
  "0": ["111", "101", "101", "101", "111"],
};
const ROWS = 5;
const COLS = ["4", "0", "4"].flatMap((g, i) => [...(i ? [null] : []), 0, 1, 2].map((c) => (c === null ? null : { g, c })));

export function NotFoundPage() {
  return (
    <Shell path="/404" className="pg pg-404">
      <section className="nf" aria-labelledby="nf-h">
        <div className="nf-panel">
          <PixelTrail />
          <div className="nf-in">
            <div className="nf-digits" aria-hidden="true" style={{ "--cols": COLS.length } as CSSProperties}>
              {Array.from({ length: ROWS }, (_, r) =>
                COLS.map((col, c) => {
                  const on = col !== null && GLYPHS[col.g][r][col.c] === "1";
                  return <i key={`${r}-${c}`} className={on ? "is-on" : undefined} style={{ "--c": c, "--r": r } as CSSProperties} />;
                }),
              )}
            </div>
            <span className="eyebrow">
              <i aria-hidden="true" />
              Error 404
            </span>
            <h1 id="nf-h" className="nf-h1">
              There is no page here.
            </h1>
            <p className="nf-lead">The link may be old, or the address mistyped. Nothing else is wrong.</p>
            <div className="nf-cta">
              <a className="sbtn sbtn-red" href="/">
                <span>Back to Home</span>
                <i aria-hidden="true">
                  <b>→</b>
                </i>
              </a>
              <a className="sbtn sbtn-glass" href={DOCS_URL}>
                <span>Read the Docs</span>
                <i aria-hidden="true">
                  <b>→</b>
                </i>
              </a>
            </div>
            <p className="nf-more">
              Or go to the <a href={PRESALE_URL}>$KILL pre-sale</a>, or{" "}
              <a href={APP_URL} onClick={goToApp}>
                open the web app
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
