// The docs: the articles in reading order down the left (with a search over every article's words), the
// article in the middle, its sections on the right with the one you are reading marked. Every article has its
// own address and its own HTML file (site/vite-plugin.ts); moving between them happens in place, without
// loading the page again, and the address, title and description follow.
import docs, { type Article } from "virtual:docs";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { GITHUB_URL } from "../config";
import { DOCS_NAV } from "../docs/nav";
import { PAGES, SITE_URL } from "../site/pages";
import { Shell } from "../site/Shell";

const HOME = PAGES.find((p) => p.path === "/docs")!;
const clean = (p: string) => p.replace(/\/+$/, "") || "/";
const byPath = (p: string) => docs.find((d) => d.path === p);
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ");

type Hit = { a: Article; at?: { id: string; text: string }; snippet: string };

function search(q: string, index: { a: Article; text: string }[]): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (Hit & { score: number })[] = [];
  for (const { a, text } of index) {
    const hay = `${a.title} ${a.description} ${text}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const title = a.title.toLowerCase();
    const head = a.headings.find((h) => words.every((w) => h.text.toLowerCase().includes(w)));
    const score = (words.every((w) => title.includes(w)) ? 10 : 0) + (head ? 4 : 0) + (a.description.toLowerCase().includes(words[0]) ? 2 : 0);
    const at = text.toLowerCase().indexOf(words[0]);
    const snippet = at < 0 ? a.description : `${at > 40 ? "…" : ""}${text.slice(Math.max(0, at - 40), at + 90).trim()}…`;
    hits.push({ a, at: head ? { id: head.id, text: head.text } : undefined, snippet, score });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, 8);
}

export function DocsPage({ path: first }: { path: string }) {
  const [path, setPath] = useState(clean(first));
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [onId, setOnId] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const a = byPath(path) ?? docs[0];
  const i = docs.indexOf(a);
  const prev = docs[i - 1];
  const next = docs[i + 1];
  const index = useMemo(() => docs.map((d) => ({ a: d, text: plain(d.html) })), []);
  const hits = useMemo(() => search(q, index), [q, index]);

  // the address, the title and the description follow the article; a move scrolls to its top (or its section)
  useEffect(() => {
    document.title = a.slug ? `${a.title} · Killswitch docs` : HOME.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", a.slug ? a.description : HOME.description);
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", SITE_URL + a.path);
    if (!moved.current) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    else window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    title.current?.focus({ preventScroll: true });
  }, [a]);

  useEffect(() => {
    const back = () => {
      moved.current = true;
      setPath(clean(location.pathname));
    };
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);

  // "/" goes to the search, Escape leaves it
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setMenu(true);
        field.current?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  // the section being read, for the list on the right
  useEffect(() => {
    const hs = [...(body.current?.querySelectorAll<HTMLElement>("h2[id], h3[id]") ?? [])];
    if (!hs.length) return setOnId("");
    const io = new IntersectionObserver(
      (es) => {
        const seen = es.filter((e) => e.isIntersecting).map((e) => e.target.id);
        if (seen.length) setOnId(seen[0]);
      },
      { rootMargin: "-90px 0px -70% 0px" },
    );
    hs.forEach((h) => io.observe(h));
    setOnId("");
    return () => io.disconnect();
  }, [a]);

  /** follow a link to another article in place; copy a code block */
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const t = e.target as Element;
    const copy = t.closest(".code-copy");
    if (copy) {
      const code = copy.closest(".code")?.querySelector("pre code")?.textContent ?? "";
      navigator.clipboard?.writeText(code).then(
        () => {
          copy.textContent = "Copied";
          copy.classList.add("is-done");
          setTimeout(() => {
            copy.textContent = "Copy";
            copy.classList.remove("is-done");
          }, 1600);
        },
        () => (copy.textContent = "Press Ctrl+C"),
      );
      return;
    }
    const link = t.closest("a");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target) return;
    const url = new URL(link.href, location.href);
    const to = byPath(clean(url.pathname));
    if (url.origin !== location.origin || !to) return;
    e.preventDefault();
    setMenu(false);
    setQ("");
    if (to === a && url.hash) {
      history.pushState(null, "", url.hash);
      document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    history.pushState(null, "", to.path + url.hash);
    moved.current = true;
    setPath(to.path);
  };

  return (
    <Shell path={a.path} className="pg pg-docs">
      <div className={`docs ${menu ? "is-menu" : ""}`} onClick={onClick}>
        <div className="docs-bar">
          <button type="button" className="docs-bar-btn" aria-expanded={menu} aria-controls="docs-nav" onClick={() => setMenu(!menu)}>
            <i aria-hidden="true" />
            {menu ? "Close" : "Docs menu"}
          </button>
          <span className="docs-bar-at">
            {a.group} / {a.title}
          </span>
        </div>

        <aside className="docs-side" id="docs-nav" aria-label="Docs">
          <div className="docs-search" role="search">
            <input
              ref={field}
              type="search"
              value={q}
              placeholder="Search the docs"
              aria-label="Search the docs"
              aria-controls="docs-results"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQ("");
                if (e.key === "Enter" && hits[0]) {
                  const h = hits[0];
                  history.pushState(null, "", h.a.path + (h.at ? `#${h.at.id}` : ""));
                  moved.current = true;
                  setQ("");
                  setMenu(false);
                  setPath(h.a.path);
                }
              }}
            />
            <kbd aria-hidden="true">/</kbd>
          </div>
          {q.trim() ? (
            <div className="docs-results" id="docs-results" aria-live="polite">
              {hits.length ? (
                <ul>
                  {hits.map((h) => (
                    <li key={h.a.path + (h.at?.id ?? "")}>
                      <a href={h.a.path + (h.at ? `#${h.at.id}` : "")}>
                        <b>{h.a.title}</b>
                        {h.at && <span className="docs-results-at">{h.at.text}</span>}
                        <span>{h.snippet}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="docs-none">
                  <i className="sq" aria-hidden="true" />
                  Nothing in the docs matches “{q.trim()}”. Try “kill all”, “MCP” or “cap”.
                </p>
              )}
            </div>
          ) : (
            <nav className="docs-nav">
              {DOCS_NAV.map((g) => (
                <div key={g.group}>
                  <p className="docs-label">{g.group}</p>
                  <ul>
                    {g.pages.map((slug) => {
                      const d = byPath(slug ? `/docs/${slug}` : "/docs")!;
                      return (
                        <li key={d.path}>
                          <a href={d.path} className={d === a ? "is-on" : undefined} aria-current={d === a ? "page" : undefined}>
                            {d.title}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </aside>

        <article className="docs-main">
          <p className="docs-crumbs">
            <a href="/docs">Docs</a>
            <span aria-hidden="true">/</span>
            {a.group}
          </p>
          <h1 className="docs-h1" ref={title} tabIndex={-1}>
            {a.title}
          </h1>
          <p className="docs-lead">{a.description}</p>
          <div className="prose" ref={body} dangerouslySetInnerHTML={{ __html: a.html }} />
          <nav className="docs-pager" aria-label="Next and previous">
            {prev ? (
              <a href={prev.path} className="docs-pager-prev">
                <small>Previous</small>
                <b>{prev.title}</b>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a href={next.path} className="docs-pager-next">
                <small>Next</small>
                <b>{next.title}</b>
              </a>
            )}
          </nav>
          <p className="docs-edit">
            <a href={`${GITHUB_URL}/edit/main/${a.source}`} target="_blank" rel="noopener">
              Edit this page on GitHub
            </a>
          </p>
        </article>

        <nav className="docs-toc" aria-label="On this page">
          {a.headings.length > 0 && (
            <>
              <p className="docs-label">On this page</p>
              <ul>
                {a.headings.map((h) => (
                  <li key={h.id} className={`d${h.depth} ${onId === h.id ? "is-on" : ""}`}>
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>
      </div>
    </Shell>
  );
}
