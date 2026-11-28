/// <reference types="vite/client" />

// the docs articles and the legal pages, made from the Markdown in src/docs and src/legal (site/vite-plugin.ts)
declare module "virtual:docs" {
  export type Heading = { id: string; text: string; depth: number };
  export type Article = {
    slug: string;
    path: string;
    group: string;
    title: string;
    description: string;
    html: string;
    headings: Heading[];
    source: string;
  };
  export type LegalDoc = { title: string; updated: string; html: string; headings: Heading[] };
  const docs: Article[];
  export default docs;
  export const legal: Record<"privacy" | "terms", LegalDoc>;
}
