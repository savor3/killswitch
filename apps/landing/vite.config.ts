import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { site } from "./src/site/vite-plugin";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root,
  // site(): the pages and their heads (src/site/pages.ts), the docs, prerendering, sitemap.xml and robots.txt
  plugins: [react(), site({ root })],
  // wrangler.toml publishes ./dist, so the build stays inside this folder.
  build: { outDir: fileURLToPath(new URL("./dist", import.meta.url)), emptyOutDir: true },
  server: {
    port: 5230,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
  preview: { port: 5230, strictPort: true },
});
