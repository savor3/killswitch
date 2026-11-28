// Build-time only (site/vite-plugin.ts loads it): renders a page to HTML with the same components the browser
// runs, so the browser takes the page over (hydrates it) instead of drawing it again.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { DocsPage } from "../pages/DocsPage";
import { LegalPage } from "../pages/LegalPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PresalePage } from "../pages/PresalePage";

export function render(path: string): string {
  const page =
    path === "/presale" ? (
      <PresalePage />
    ) : path === "/docs" || path.startsWith("/docs/") ? (
      <DocsPage path={path} />
    ) : path === "/privacy" || path === "/terms" ? (
      <LegalPage name={path.slice(1) as "privacy" | "terms"} />
    ) : path === "/404" ? (
      <NotFoundPage />
    ) : null;
  if (!page) throw new Error(`nothing to prerender at ${path}`);
  return renderToString(<StrictMode>{page}</StrictMode>);
}
