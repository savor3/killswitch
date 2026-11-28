import { useRef, type CSSProperties, type ReactNode } from "react";
import payS from "../assets/media/card-pay-640.webp";
import pay from "../assets/media/card-pay.webp";
import phoneS from "../assets/media/card-phone-640.webp";
import phone from "../assets/media/card-phone.webp";
import signalsS from "../assets/media/card-signals-640.webp";
import signals from "../assets/media/card-signals.webp";
import trackS from "../assets/media/card-track-640.webp";
import track from "../assets/media/card-track.webp";
import { APP_URL } from "../config";
import { goToApp } from "../lib/launch";
import { reduceMotion, useScrollFrame } from "../lib/motion";
import { HeroPixel } from "./HeroPixel";
import { PixelTrail } from "./PixelTrail";

// The first screen: a dark panel on the white page, after Arvion's hero: a red aurora of square
// pixels arching over the words, which sit centred under it. As the page scrolls away the words drift up and
// fade, a little faster than the light behind them, so the panel has depth as it leaves.

// The four cards in the reference's form: a title, one picture, one line, nothing explained inside. Two
// key features and the two problems they answer. The pictures are grainy long exposures with one red light
// (signals past a night train, the owner's phone, a card tapped on a terminal, a car's tail lights). They
// rise into place one after another as they come into view.
type Card = { kind: "Feature" | "Problem"; title: string; line: ReactNode; picture: string; small: string };
const CARDS: Card[] = [
  { kind: "Feature", title: "Spending caps", line: "A daily budget for each agent, enforced by your own wallet contract.", picture: signals, small: signalsS },
  { kind: "Feature", title: "Kill switch", line: "One signature from you stops every agent at once.", picture: phone, small: phoneS },
  { kind: "Problem", title: "Prompt injection", line: "A planted instruction can’t move money past the allowlist or the cap.", picture: pay, small: payS },
  { kind: "Problem", title: "Leaked keys", line: "A stolen agent key can only ever spend its own budget.", picture: track, small: trackS },
];
// a card is a little taller than wide, so its square picture is drawn at about 1.1 times the card's width:
// four across on wide screens, two from 1100px, one from 640px
const CARD_SIZES = "(max-width: 640px) 110vw, (max-width: 1100px) 55vw, 27vw";

export function Hero() {
  const top = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);

  // the panel's depth as it scrolls away: the words rise and fade, the light slips the other way, slower
  useScrollFrame(() => {
    const el = top.current;
    if (!el || reduceMotion()) return;
    const h = el.offsetHeight || 1;
    const p = Math.min(1.2, Math.max(0, window.scrollY / h));
    if (copy.current) {
      copy.current.style.transform = p ? `translate3d(0, ${(-p * 90).toFixed(1)}px, 0)` : "";
      copy.current.style.opacity = p ? String(Math.max(0, 1 - p * 1.5)) : "";
    }
    if (art.current) art.current.style.transform = p ? `translate3d(0, ${(p * 70).toFixed(1)}px, 0)` : "";
  });

  return (
    <section className="hero" aria-labelledby="hero-h1">
      <div className="hero-top" ref={top}>
        <div className="hero-art" ref={art}>
          <HeroPixel />
        </div>
        <div className="hero-copy" ref={copy}>
          <h1 id="hero-h1" className="hero-h1" style={{ "--d": 0 } as CSSProperties}>
            Give your AI a budget,
            <br className="hero-br" /> not your keys.
          </h1>
          <p className="hero-lead" style={{ "--d": 1 } as CSSProperties}>
            Limits it can&rsquo;t cross. One switch to stop every agent.
          </p>
          <div className="hero-cta" style={{ "--d": 2 } as CSSProperties}>
            <a className="sbtn sbtn-red" href={APP_URL} onClick={goToApp}>
              <span>Launch App</span>
              <i aria-hidden="true">
                <b>→</b>
              </i>
            </a>
            <a className="sbtn sbtn-glass sbtn-down" href="#how">
              <span>How It Works</span>
              <i aria-hidden="true">
                <b>↓</b>
              </i>
            </a>
          </div>
        </div>
      </div>
      <div className="stats">
        {CARDS.map((c, i) => (
          <article key={i} className="stat" data-rv="self" style={{ "--i": i } as CSSProperties}>
            <img
              className="card-media"
              src={c.picture}
              srcSet={`${c.small} 640w, ${c.picture} 960w`}
              sizes={CARD_SIZES}
              alt=""
              decoding="async"
            />
            <div className="stat-head">
              <span className={`stat-kind ${c.kind === "Problem" ? "is-problem" : ""}`}>{c.kind}</span>
              <h2 className="stat-title">{c.title}</h2>
            </div>
            <p className="stat-cap">{c.line}</p>
            <PixelTrail />
            <span className="px" aria-hidden="true" />
          </article>
        ))}
      </div>
    </section>
  );
}
