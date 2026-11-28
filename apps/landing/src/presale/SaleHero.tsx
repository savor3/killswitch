// The top of the pre-sale page: what is sold and at what price, a reminder for the opening, how far the sale has
// got, and beside it the card to buy with (BuyCard.tsx: the countdown, the price, what you pay and get, the
// wallet), all over the home page's red aurora, arched for this panel. Before the page has started in the
// browser the card shows the date instead of a countdown, so the prerendered HTML is never wrong.
import { useState } from "react";
import { PRESALE, WHITEPAPER_URL } from "../config";
import { SITE_URL } from "../site/pages";
import { HeroPixel } from "../components/HeroPixel";
import { PixelTrail } from "../components/PixelTrail";
import { Presale } from "../components/Presale";
import type { FeedState } from "../lib/feed";
import { committedNow, OPENS, phaseAt, useNow } from "../lib/presale";
import { BuyCard } from "./BuyCard";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, ""); // 20261203T150000Z

const EVENT = {
  title: "$KILL pre-sale opens",
  details: `100,000,000 $KILL at $${PRESALE.price}. The link to the sale is on ${SITE_URL}/presale`,
  start: stamp(OPENS),
  end: stamp(OPENS + 3_600_000),
};
const GOOGLE =
  "https://calendar.google.com/calendar/render?action=TEMPLATE" +
  `&text=${encodeURIComponent(EVENT.title)}&dates=${EVENT.start}/${EVENT.end}&details=${encodeURIComponent(EVENT.details)}`;

/** An .ics file for Apple Calendar, Outlook and the rest, made in the browser from the terms in config.ts. */
function downloadIcs() {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Killswitch//Pre-sale//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:kill-presale-${EVENT.start}@killswitch`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${EVENT.start}`,
    `DTEND:${EVENT.end}`,
    `SUMMARY:${EVENT.title}`,
    `DESCRIPTION:${EVENT.details.replace(/,/g, "\\,")}`,
    `URL:${SITE_URL}/presale`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:The $KILL pre-sale opens in 30 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "kill-presale.ics" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaleHero({ feed }: { feed: FeedState }) {
  const now = useNow(1000);
  const [base] = useState(committedNow);
  const committed = feed.kind === "ok" ? feed.feed.committed : base;
  const phase = now === null ? null : phaseAt(now, committed);

  return (
    <section className="sale-hero" aria-labelledby="sale-h">
      <div className="sale-panel">
        {/* the home page's red aurora, drawn for this panel (HeroPixel "sale"), and the pointer's red squares */}
        <div className="sale-art" aria-hidden="true">
          <HeroPixel look="sale" />
        </div>
        <PixelTrail />
        <div className="sale-main">
          <div className="sale-copy">
            <span className="eyebrow">
              <i aria-hidden="true" />
              The $KILL pre-sale
            </span>
            <h1 id="sale-h" className="sale-h1">
              100,000,000 $KILL <span className="nowrap">at $0.0025.</span>
            </h1>
            <p className="sale-lead">A tenth of the fixed supply of the token that will bond Killswitch's guardians.</p>
          </div>

          <div className="sale-cta">
            {(phase === null || phase === "soon") && (
              <>
                <button className="sbtn sbtn-glass sbtn-down" type="button" onClick={downloadIcs}>
                  <span>Add to Calendar</span>
                  <i aria-hidden="true">
                    <b>↓</b>
                  </i>
                </button>
                <a className="sale-cal" href={GOOGLE} target="_blank" rel="noopener">
                  or Google Calendar
                </a>
              </>
            )}
            <a className="sbtn sbtn-glass" href={WHITEPAPER_URL} target="_blank" rel="noopener">
              <span>Whitepaper</span>
              <i aria-hidden="true">
                <b>↗</b>
              </i>
            </a>
          </div>

          <Presale head={false} committed={feed.kind === "ok" ? feed.feed.committed : undefined} />
        </div>

        <BuyCard now={now} phase={phase} committed={committed} feed={feed} />
      </div>
    </section>
  );
}
