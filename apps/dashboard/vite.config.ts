import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
// Keep the signer on the server. Override with KS_RELAY_PROXY only when developing
// against a separate local relay (for example, an Anvil setup).
const relayProxy = process.env.KS_RELAY_PROXY ?? "https://app-killswitch.storygame.io";
export default defineConfig(({ command }) => ({
  root,
  base: command === "build" ? "/app/" : "/",
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../../dist/dashboard", import.meta.url)), emptyOutDir: true },
  server: {
    port: 5175,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    proxy: { "/v1": { target: relayProxy, changeOrigin: true } },
  },
}));
