// The docs, in reading order. Each slug is a Markdown file in this folder ("" is index.md, the docs home at
// /docs); the file's front matter gives the article its title and description. To add an article, write the
// file and put its slug here.
export const DOCS_NAV: { group: string; pages: string[] }[] = [
  { group: "Get started", pages: ["", "quick-start", "connect-your-ai", "app"] },
  { group: "How it works", pages: ["protected-wallet", "grants", "lifecycle", "guardian", "stopping-agents", "security"] },
  { group: "Build", pages: ["sdk", "mcp", "api", "contract"] },
  { group: "Project", pages: ["token", "roadmap", "glossary", "faq"] },
];
