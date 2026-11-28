// Build-time only: vite.config.ts uses this, the pages never import it. It makes apps/landing a site of several
// pages:
//  - every page's <head> (title, description, canonical address, link-preview tags, icons) comes from pages.ts
//  - the Markdown articles in src/docs become the docs (the module "virtual:docs"), and each article gets its
//    own HTML file, so it has its own address, title and description
//  - the pages marked `prerender` are rendered into their HTML at build time, so their words are there before
//    any script runs
//  - sitemap.xml and robots.txt are written from the same table
//  - the dev and preview servers answer clean addresses (/presale, /docs/quick-start) and unknown ones with the
//    404 page, the way Cloudflare serves the built files (see wrangler.toml)
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { Marked, type Tokens } from "marked";
import { createServer, type Connect, type Plugin, type ResolvedConfig } from "vite";
import { DOCS_NAV } from "../docs/nav";
import { PAGES, SITE_URL, type Page } from "./pages";

export type Heading = { id: string; text: string; depth: number };
export type Article = {
  slug: string;
  path: string;
  group: string;
  title: string;
  description: string;
  html: string;
  headings: Heading[];
  /** the Markdown file, relative to the repo root */
  source: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* ------------------------------------------------------------------ code colouring */
// A few token kinds, in the classes of the landing's code window (t-k keyword, t-s string, t-c comment, t-f
// call or command): enough to read a snippet at a glance, nothing that needs a parser.
const span = (k: string, s: string) => `<span class="t-${k}">${esc(s)}</span>`;
function paint(code: string, re: RegExp, kind: (m: RegExpExecArray) => [string, string][]) {
  let out = "";
  let at = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    out += esc(code.slice(at, m.index));
    for (const [k, s] of kind(m)) out += k ? span(k, s) : esc(s);
    at = m.index + m[0].length;
  }
  return out + esc(code.slice(at));
}
const TS_KEYWORDS =
  "import|from|export|const|let|var|await|async|function|return|if|else|new|type|as|for|of|while|true|false|null|undefined|throw|try|catch";
const SOL_KEYWORDS =
  "function|external|internal|public|private|view|pure|returns|return|if|else|for|revert|emit|unchecked|require|uint256|uint128|uint64|address|bytes32|bytes4|bytes|bool|struct|mapping|memory|calldata|storage|error|event|contract|is|new|true|false|onlyOwner";
function highlight(code: string, lang: string) {
  if (/^(ts|tsx|js|jsx|typescript|javascript)$/.test(lang)) {
    const re = new RegExp(
      `(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|\\b(${TS_KEYWORDS})\\b|\\b([A-Za-z_$][\\w$]*)(?=\\()`,
      "g",
    );
    return paint(code, re, (m) => [[m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : "f", m[0]]]);
  }
  if (/^(sol|solidity)$/.test(lang)) {
    const re = new RegExp(`(\\/\\/[^\\n]*)|("(?:[^"\\\\\\n]|\\\\.)*")|\\b(${SOL_KEYWORDS})\\b|\\b([A-Za-z_][\\w]*)(?=\\()`, "g");
    return paint(code, re, (m) => [[m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : "f", m[0]]]);
  }
  if (lang === "json") {
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b/g;
    return paint(code, re, (m) => (m[1] ? [[m[2] ? "f" : "s", m[1]], ["", m[2] ?? ""]] : [["k", m[0]]]));
  }
  if (lang === "http") {
    return paint(code, /^(GET|POST|PUT|DELETE)\b|("(?:[^"\\]|\\.)*")/gm, (m) => [[m[1] ? "k" : "s", m[0]]]);
  }
  if (/^(sh|bash|shell|console|ps|powershell)$/.test(lang)) {
    // the first word of a line is the command, unless the line before ended in a backslash
    let more = false;
    return code
      .split("\n")
      .map((line) => {
        const comment = /^(\s*)(#.*)$/.exec(line);
        let out = "";
        let rest = line;
        if (comment) out = esc(comment[1]) + span("c", comment[2]);
        else {
          const first = more ? null : /^(\s*)(\S+)/.exec(line);
          if (first) {
            out = esc(first[1]) + span("f", first[2]);
            rest = line.slice(first[0].length);
          }
          out += paint(rest, /("(?:[^"\\]|\\.)*"|'[^']*')|(\s#.*$)/g, (m) => [[m[1] ? "s" : "c", m[0]]]);
        }
        more = /\\\s*$/.test(line);
        return out;
      })
      .join("\n");
  }
  return esc(code);
}
const LANG_LABEL: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  json: "JSON",
  sh: "Terminal",
  bash: "Terminal",
  ps: "PowerShell",
  powershell: "PowerShell",
  sol: "Solidity",
  solidity: "Solidity",
  http: "HTTP",
  text: "",
};

/* ------------------------------------------------------------------ Markdown */
function frontMatter(src: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  const data: Record<string, string> = {};
  if (m)
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
    }
  return { data, body: m ? src.slice(m[0].length) : src };
}

function renderMarkdown(md: string) {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = unesc(inner.replace(/<[^>]+>/g, ""));
        let id = slugify(text);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id += `-${n}`;
        if (depth === 2 || depth === 3) headings.push({ id, text, depth });
        return `<h${depth} id="${id}"><a class="h-link" href="#${id}">${inner}</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        const l = (lang ?? "").trim().toLowerCase();
        const label = LANG_LABEL[l] ?? l.toUpperCase();
        return (
          `<figure class="code"><div class="code-bar"><span class="code-lang">${esc(label)}</span>` +
          `<button class="code-copy" type="button">Copy</button></div>` +
          `<pre><code>${highlight(text.replace(/\n$/, ""), l)}</code></pre></figure>\n`
        );
      },
      table(t: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: "th" | "td") =>
          `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        return (
          `<div class="table"><table><thead><tr>${t.header.map((c) => cell(c, "th")).join("")}</tr></thead>` +
          `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("")}</tbody></table></div>\n`
        );
      },
      blockquote({ tokens }) {
        return `<aside class="note">${this.parser.parse(tokens)}</aside>\n`;
      },
      link({ href, tokens }) {
        const out = /^https?:\/\//.test(href);
        return `<a href="${esc(href)}"${out ? ' target="_blank" rel="noopener"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  return { html: marked.parse(md) as string, headings };
}

export function loadDocs(root: string): Article[] {
  const out: Article[] = [];
  for (const g of DOCS_NAV)
    for (const slug of g.pages) {
      const name = `${slug || "index"}.md`;
      const file = path.join(root, "src/docs", name);
      const { data, body } = frontMatter(fs.readFileSync(file, "utf8"));
      if (!data.title || !data.description) throw new Error(`${file}: the front matter needs a title and a description`);
      const { html, headings } = renderMarkdown(body);
      out.push({
        slug,
        path: slug ? `/docs/${slug}` : "/docs",
        group: g.group,
        title: data.title,
        description: data.description,
        html,
        headings,
        source: `apps/landing/src/docs/${name}`,
      });
    }
  return out;
}

/** The legal pages, src/legal/<name>.md: the date they were last changed and their text. */
export type LegalDoc = { title: string; updated: string; html: string; headings: Heading[] };
export function loadLegal(root: string): Record<string, LegalDoc> {
  const out: Record<string, LegalDoc> = {};
  for (const name of ["privacy", "terms"]) {
    const file = path.join(root, "src/legal", `${name}.md`);
    const { data, body } = frontMatter(fs.readFileSync(file, "utf8"));
    if (!data.title || !data.updated) throw new Error(`${file}: the front matter needs a title and an updated date`);
    out[name] = { title: data.title, updated: data.updated, ...renderMarkdown(body) };
  }
  return out;
}

/* ------------------------------------------------------------------ <head> */
type Meta = { path: string; title: string; description: string; image?: string; imageAlt?: string; noindex?: boolean };
const DEFAULT_ALT = "Killswitch. Give your AI a budget, not your keys.";

function metaTags(m: Meta) {
  const url = SITE_URL + m.path;
  const img = `${SITE_URL}/${m.image ?? "og.jpg"}`;
  const alt = esc(m.imageAlt ?? DEFAULT_ALT);
  return [
    "<!--meta-->",
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    m.noindex ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Killswitch" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
    "<!--/meta-->",
  ].join("\n    ");
}

// the same on every page: icons, the font the first words need, and a mark that scripts run (so content that
// waits for the scroll is only hidden when something will bring it in)
const SHARED = [
  `<meta name="theme-color" content="#ffffff" />`,
  `<link rel="icon" href="/favicon.ico" sizes="48x48" />`,
  `<link rel="icon" href="/icon.svg" type="image/svg+xml" />`,
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
  `<link rel="manifest" href="/site.webmanifest" />`,
  `<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />`,
  `<script>document.documentElement.classList.add("js")</script>`,
].join("\n    ");

const docMeta = (a: Article, docsHome: Page): Meta =>
  a.slug
    ? { path: a.path, title: `${a.title} · Killswitch docs`, description: a.description }
    : { path: a.path, title: docsHome.title, description: docsHome.description, image: docsHome.image };

/* ------------------------------------------------------------------ the plugins */
const VIRTUAL = "virtual:docs";

/** The docs articles (default export) and the legal pages (`legal`) as a module, rebuilt when a Markdown file
 *  changes. */
export function docsModule(root: string): Plugin {
  let docs = loadDocs(root);
  let legal = loadLegal(root);
  return {
    name: "killswitch-docs",
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return;
      return `export default ${JSON.stringify(docs)};\nexport const legal = ${JSON.stringify(legal)};`;
    },
    configureServer(server) {
      const dirs = [path.join(root, "src/docs"), path.join(root, "src/legal")];
      const reload = (f: string) => {
        if (!dirs.some((d) => f.startsWith(d)) || !f.endsWith(".md")) return;
        try {
          docs = loadDocs(root);
          legal = loadLegal(root);
        } catch (e) {
          server.config.logger.error(String(e));
          return;
        }
        const mod = server.moduleGraph.getModuleById(`\0${VIRTUAL}`);
        if (mod) server.reloadModule(mod);
      };
      server.watcher.add(dirs);
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
    },
  };
}

export function site({ root }: { root: string }): Plugin[] {
  const docsHome = PAGES.find((p) => p.path === "/docs")!;
  const byFile = new Map(PAGES.map((p) => [p.file, p]));
  const byPath = new Map(PAGES.map((p) => [p.path, p]));
  let config: ResolvedConfig;

  /** /presale/ and /presale are the same page; a page has no file extension */
  const clean = (url: string) => {
    const u = new URL(url, "http://x");
    return { p: u.pathname.replace(/\/+$/, "") || "/", q: u.search };
  };
  const isPage = (p: string) => !path.extname(p) && !/^\/(@|src\/|node_modules\/|__)/.test(p);

  return [
    docsModule(root),
    {
      name: "killswitch-site",
      config: () => ({
        appType: "mpa",
        build: {
          rollupOptions: {
            input: Object.fromEntries(PAGES.map((p) => [p.file.replace(/\.html$/, "").replace(/\W/g, "_"), path.join(root, p.file)])),
          },
        },
      }),
      configResolved(c) {
        config = c;
      },

      transformIndexHtml: {
        order: "pre",
        handler(html, ctx) {
          const file = path.relative(root, ctx.filename).replace(/\\/g, "/");
          const page = byFile.get(file);
          if (!page) return html;
          let meta: Meta = page;
          // the dev server answers every docs address with docs.html: give it that article's head
          if (page === docsHome && ctx.originalUrl) {
            const a = loadDocs(root).find((d) => d.path === clean(ctx.originalUrl!).p);
            if (a) meta = docMeta(a, docsHome);
          }
          return html.replace("</head>", `    ${metaTags(meta)}\n    ${SHARED}\n  </head>`);
        },
      },

      configureServer(server) {
        server.middlewares.use(((req, res, next) => {
          const { p, q } = clean(req.url ?? "/");
          const page = byPath.get(p);
          if (page && page.path !== "/") req.url = `/${page.file}${q}`;
          else if (p.startsWith("/docs/") && loadDocs(root).some((d) => d.path === p)) req.url = `/docs.html${q}`;
          else if (p !== "/" && isPage(p)) {
            // the 404 page, drawn by the dev server, with a 404 status
            server
              .transformIndexHtml("/404.html", fs.readFileSync(path.join(root, "404.html"), "utf8"), req.originalUrl)
              .then((html) => {
                res.statusCode = 404;
                res.setHeader("content-type", "text/html; charset=utf-8");
                res.end(html);
              }, next);
            return;
          }
          next();
        }) as Connect.NextHandleFunction);
      },

      configurePreviewServer(server) {
        const dist = config.build.outDir;
        server.middlewares.use(((req, res, next) => {
          const { p, q } = clean(req.url ?? "/");
          if (p === "/" || !isPage(p)) return next();
          if (fs.existsSync(path.join(dist, `${p}.html`))) {
            req.url = `${p}.html${q}`;
            return next();
          }
          res.statusCode = 404;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(fs.readFileSync(path.join(dist, "404.html")));
        }) as Connect.NextHandleFunction);
      },

      async closeBundle() {
        if (config.command !== "build" || config.build.ssr) return;
        const dist = config.build.outDir;
        const docs = loadDocs(root);
        const read = (f: string) => fs.readFileSync(path.join(dist, f), "utf8");
        const write = (f: string, s: string) => {
          fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true });
          fs.writeFileSync(path.join(dist, f), s);
        };

        // render the prerendered pages with the same modules the browser runs
        const server = await createServer({
          configFile: false,
          root,
          // the built pages run in production mode, so the prerender does too (import.meta.env.DEV is false)
          mode: "production",
          logLevel: "error",
          appType: "custom",
          plugins: [react(), docsModule(root)],
          server: { middlewareMode: true, hmr: false, ws: false },
          optimizeDeps: { noDiscovery: true, include: [] },
        });
        try {
          const { render } = (await server.ssrLoadModule("/src/site/prerender.tsx")) as { render: (path: string) => string };
          const fill = (html: string, p: string) => {
            if (!html.includes('<div id="root"></div>')) throw new Error(`no empty #root to prerender ${p} into`);
            return html.replace('<div id="root"></div>', `<div id="root">${render(p)}</div>`);
          };
          for (const page of PAGES) if (page.prerender && page !== docsHome) write(page.file, fill(read(page.file), page.path));
          // every docs article from docs.html, with its own head
          const shell = read(docsHome.file);
          for (const a of docs) {
            const html = shell.replace(/<!--meta-->[\s\S]*?<!--\/meta-->/, metaTags(docMeta(a, docsHome)));
            write(a.slug ? `docs/${a.slug}.html` : docsHome.file, fill(html, a.path));
          }
        } finally {
          await server.close();
        }

        const urls = [
          ...PAGES.filter((p) => !p.noindex && p !== docsHome).map((p) => p.path),
          ...docs.map((a) => a.path),
        ];
        write(
          "sitemap.xml",
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
            .map((u) => `  <url><loc>${SITE_URL}${u === "/" ? "/" : u}</loc></url>`)
            .join("\n")}\n</urlset>\n`,
        );
        write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
      },
    },
  ];
}
