// Every page of the site: its address, the HTML file it is built from, and the title and description that go
// into its <head> for search results and link previews. The build (vite-plugin.ts) fills each page's head from
// this table, lists the pages in sitemap.xml and prerenders the ones marked `prerender`. The docs articles
// are added from src/docs (each with its own title and description), so they are not listed here.

/** The site's public address, where the web app also runs (at /app/). Change it here when it moves. */
export const SITE_URL = "https://app-killswitch.storygame.io";

export type Page = {
  /** the address, without a trailing slash ("/" for the home page) */
  path: string;
  /** the HTML entry in apps/landing */
  file: string;
  title: string;
  description: string;
  /** the link-preview picture under public/, 1200 x 630; og.jpg when not set */
  image?: string;
  imageAlt?: string;
  /** written into the HTML at build time, so the words are there before any script runs */
  prerender?: boolean;
  /** kept out of search results and the sitemap */
  noindex?: boolean;
};

export const PAGES: Page[] = [
  {
    path: "/",
    file: "index.html",
    title: "Killswitch: give your AI a budget, not your keys",
    description:
      "Hard spending limits and an emergency stop for every AI agent that touches your money. The limits live in a wallet contract you own.",
  },
  {
    path: "/presale",
    file: "presale.html",
    title: "The $KILL pre-sale, December 3 · Killswitch",
    description:
      "100,000,000 $KILL, 10% of a fixed supply, at $0.0025 each. Opens Thursday, December 3, 2026 at 15:00 UTC. Tokens unlock in full at TGE on December 9.",
    image: "og-presale.jpg",
    imageAlt: "The $KILL pre-sale. December 3, 2026, 15:00 UTC. 100,000,000 $KILL at $0.0025.",
    prerender: true,
  },
  {
    path: "/docs",
    file: "docs.html",
    title: "Killswitch docs: spending limits for AI agents",
    description:
      "How Killswitch works and how to use it: the protected wallet, agent grants, the guardian, the kill switch, and the SDK, MCP server and relay API.",
    prerender: true,
  },
  {
    path: "/privacy",
    file: "privacy.html",
    title: "Privacy Policy · Killswitch",
    description:
      "What the Killswitch website and web app collect, what they never collect, and where your data goes. No cookies, no analytics, no accounts.",
    prerender: true,
  },
  {
    path: "/terms",
    file: "terms.html",
    title: "Terms of Use · Killswitch",
    description:
      "The terms for using the Killswitch website, web app and open-source software on test networks, and how they relate to the $KILL sale terms.",
    prerender: true,
  },
  {
    path: "/404",
    file: "404.html",
    title: "Page not found · Killswitch",
    description: "There is no page at this address.",
    prerender: true,
    noindex: true,
  },
];
