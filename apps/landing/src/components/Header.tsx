// The bar along the top. It sticks; it steps out of the way while you read down the page and comes back as
// soon as you scroll up; past the top it gets a white ground. The sections sit together in the middle as one
// strip, split by the same dashed rule as the buttons; the section you are in is marked with a red square,
// and a label decodes from binary under the pointer.
import { useEffect, useState, type CSSProperties } from "react";
import { Logo } from "../brand/Logo";
import { APP_URL, DOCS_URL } from "../config";
import { Decode } from "./Decode";

const LINKS = [
  { href: "#how", label: "How It Works" },
  { href: "#security", label: "Security" },
  { href: "#developers", label: "Developers" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const [hover, setHover] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("is-menu", open);
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open]);

  // hide on the way down, show on the way up
  useEffect(() => {
    let last = scrollY;
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = scrollY;
        setScrolled(y > 8);
        if (Math.abs(y - last) < 6) return;
        setHidden(y > last && y > 240);
        last = y;
      });
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => {
      removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);

  // which section is in the middle of the screen
  useEffect(() => {
    const els = LINKS.map((l) => document.querySelector(l.href)).filter(Boolean) as Element[];
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setActive(`#${e.target.id}`);
      },
      { rootMargin: "-45% 0px -54% 0px" },
    );
    els.forEach((el) => io.observe(el));
    const top = () => scrollY < 300 && setActive("");
    addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      removeEventListener("scroll", top);
    };
  }, []);

  return (
    <header className={`hdr ${scrolled ? "is-scrolled" : ""} ${hidden && !open ? "is-hidden" : ""}`}>
      <a className="hdr-logo" href="#top" aria-label="Killswitch, back to top">
        <Logo />
      </a>
      <nav className="hdr-nav" aria-label="Sections">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className={active === l.href ? "is-on" : ""}
            aria-current={active === l.href ? "true" : undefined}
            onMouseEnter={() => setHover(l.href)}
            onMouseLeave={() => setHover("")}
          >
            <Decode text={l.label} run={hover === l.href} ms={380} />
          </a>
        ))}
      </nav>
      <div className="hdr-cta">
        <a className="sbtn sbtn-grey" href={DOCS_URL} target="_blank" rel="noopener">
          <span>Docs</span>
          <i aria-hidden="true">
            <b>↗</b>
          </i>
        </a>
        <a className="sbtn sbtn-ink" href={APP_URL} target="_blank" rel="noopener">
          <span>Launch App</span>
          <i aria-hidden="true">
            <b>→</b>
          </i>
        </a>
      </div>
      <button className="hdr-menu" type="button" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(!open)}>
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <i />
        <i />
      </button>
      <div className={`menu ${open ? "is-open" : ""}`} id="menu" inert={!open}>
        <nav aria-label="Menu">
          {LINKS.map((l, i) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ "--i": i } as CSSProperties}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="menu-cta" style={{ "--i": LINKS.length } as CSSProperties}>
          <a className="pill pill-white" href={APP_URL} target="_blank" rel="noopener">
            Launch App
          </a>
          <a className="pill pill-ghost" href={DOCS_URL} target="_blank" rel="noopener">
            Docs
          </a>
        </div>
      </div>
    </header>
  );
}
