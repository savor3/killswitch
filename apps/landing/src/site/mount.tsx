import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

/** Starts a page: takes over the HTML the build prerendered into #root, or renders it there (dev server). */
export function mount(page: ReactNode) {
  const el = document.getElementById("root")!;
  const app = <StrictMode>{page}</StrictMode>;
  if (el.firstElementChild) hydrateRoot(el, app);
  else createRoot(el).render(app);
}
