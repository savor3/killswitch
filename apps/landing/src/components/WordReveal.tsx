// Text that writes itself in as it scrolls into view: each word arrives in red and settles to the text
// colour a few words later. Words wrapped in *asterisks* stay red; a ~ joins two words with a no-break
// space; a newline forces a line break. The whole sentence is always in the DOM.
import { Fragment, useEffect, useMemo, useRef, type ElementType } from "react";
import { reduceMotion, useScrollFrame } from "../lib/motion";

const TRAIL = 3; // words that are red at once while the front moves
const NBSP = String.fromCharCode(0xa0);

export function WordReveal({ text, as: Tag = "p", className = "", id, start = 0.9, end = 0.42 }: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** where the element's top sits (as a share of the viewport height) when the reveal starts and ends */
  start?: number;
  end?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  // a newline in `text` forces a line break there
  const words = useMemo(
    () =>
      text
        .split("\n")
        .flatMap((line, li) =>
          line
            .trim()
            .split(/\s+/)
            .map((w, wi) => {
              const accent = /^\*.*\*[.,;:!?]?$/.test(w);
              const t = (accent ? w.replace(/\*/g, "") : w).replace(/~/g, NBSP);
              return { t, accent, br: li > 0 && wi === 0 };
            }),
        ),
    [text],
  );
  const last = useRef(-1);
  // only sentences near the screen measure themselves on a scroll frame; the rest keep still, so a frame
  // never reads the layout of every heading on the page. Coming near also measures once, for a page that
  // jumped there without further scrolling.
  const near = useRef(true);
  const update = useRef<() => void>(() => {});
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        near.current = e.isIntersecting;
        if (e.isIntersecting) raf = requestAnimationFrame(() => update.current());
      },
      { rootMargin: "30% 0px 30% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  useScrollFrame(() => update.current(), [words, start, end]);
  update.current = () => {
    const el = ref.current;
    if (!el || !near.current) return;
    const spans = el.querySelectorAll<HTMLSpanElement>("[data-w]");
    if (reduceMotion()) {
      spans.forEach((s) => (s.dataset.s = "2"));
      return;
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh * start - r.top) / (vh * (start - end))));
    const front = p * (spans.length + TRAIL);
    const key = Math.round(front * 8);
    if (key === last.current) return;
    last.current = key;
    spans.forEach((s, i) => {
      const st = front <= i ? "0" : front < i + TRAIL ? "1" : "2";
      if (s.dataset.s !== st) s.dataset.s = st;
    });
  };

  return (
    <Tag ref={ref} id={id} className={`wr ${className}`}>
      {words.map((w, i) => (
        <Fragment key={i}>
          {w.br && <br />}
          <span data-w="" data-s="0" className={w.accent ? "wr-a" : undefined}>
            {w.t}
          </span>
          {/* a space even before a line break, so the words still part where narrow screens drop the break */}
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}
