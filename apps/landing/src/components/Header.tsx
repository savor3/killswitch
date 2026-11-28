// The bar along the top. It sticks; it steps out of the way while you read down the page and comes back as
// soon as you scroll up; past the top it gets a white ground. The sections sit together in the middle as one
// strip, split by the same dashed rule as the buttons; the section or page you are on is marked with a red
// square, and a label decodes from binary under the pointer. On the home page the sections are jumps within
// the page; from any other page they lead back to them.
import { useEffect, useState, type CSSProperties } from "react";
import { Logo } from "../brand/Logo";
import { APP_URL, DOCS_URL, PRESALE_URL } from "../config";
import { goToApp } from "../lib/launch";
import { short, useWallet } from "../lib/wallet";
import { Identicon } from "./Identicon";
import { homeLink, usePath } from "../site/where";
import { Decode } from "./Decode";

const SECTIONS = [
  { hash: "#how", label: "How It Works" },
  { hash: "#security", label: "Security" },
  { hash: "#developers", label: "Developers" },
];

export function Header() {
  const path = usePath();
  const home = path === "/";
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const [hover, setHover] = useState("");
  const wallet = useWallet();
  const links = [
    ...SECTIONS.map((s) => ({ href: homeLink(path, s.hash), label: s.label, on: home && active === s.hash })),
    { href: PRESALE_URL, label: "Pre-sale", on: path === PRESALE_URL },
  ];
  const inDocs = path === DOCS_URL || path.startsWith(`${DOCS_URL}/`);

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

  // on the home page: which section is in the middle of the screen
  useEffect(() => {
    if (!home) return;
    const els = SECTIONS.map((s) => document.querySelector(s.hash)).filter(Boolean) as Element[];
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
  }, [home]);

  return (
    <header className={`hdr ${scrolled ? "is-scrolled" : ""} ${hidden && !open ? "is-hidden" : ""}`}>
      <a className="hdr-logo" href={home ? "#top" : "/"} aria-label={home ? "Killswitch, back to top" : "Killswitch home"}>
        <Logo />
      </a>
      <nav className="hdr-nav" aria-label="Sections">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className={l.on ? "is-on" : ""}
            aria-current={l.on ? (l.href === path ? "page" : "true") : undefined}
            onMouseEnter={() => setHover(l.href)}
            onMouseLeave={() => setHover("")}
          >
            <Decode text={l.label} run={hover === l.href} ms={380} />
          </a>
        ))}
      </nav>
      <div className="hdr-cta">
        <a className={`sbtn sbtn-grey ${inDocs ? "is-on" : ""}`} href={DOCS_URL} aria-current={inDocs ? "page" : undefined}>
          <span>Docs</span>
          <i aria-hidden="true">
            <b>→</b>
          </i>
        </a>
        {wallet && (
          <a className="hdr-wallet" href={APP_URL} onClick={goToApp} title={`Connected: ${wallet}`}>
            <Identicon address={wallet} size={22} />
            <span className="sr-only">Connected wallet </span>
            {short(wallet)}
          </a>
        )}
        <a className="sbtn sbtn-ink" href={APP_URL} onClick={goToApp}>
          <span>{wallet ? "Open App" : "Launch App"}</span>
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
          {[...links, { href: DOCS_URL, label: "Docs", on: inDocs }].map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              className={l.on ? "is-on" : ""}
              aria-current={l.on && l.href === path ? "page" : undefined}
              onClick={() => setOpen(false)}
              style={{ "--i": i } as CSSProperties}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="menu-cta" style={{ "--i": links.length + 1 } as CSSProperties}>
          <a className="pill pill-white" href={APP_URL} onClick={goToApp}>
            {wallet ? "Open App" : "Launch App"}
          </a>
          {wallet && (
            <span className="menu-wallet">
              <Identicon address={wallet} size={22} />
              Connected {short(wallet)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
