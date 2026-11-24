import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../../dist/dashboard", import.meta.url)), emptyOutDir: true },
  server: {
    port: 5175,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    proxy: { "/v1": "http://localhost:8787" },
  },
});
