// Bundles the MCP server into packages/mcp/dist/server.mjs (one file, runnable with `npx @killswitch/mcp`).
//   npm run mcp:package          build only
//   npm run mcp:pack             build + `npm pack` (a .tgz you can test with `npx -y <path-to.tgz>`)
import { build } from "esbuild";
import { chmodSync } from "node:fs";

const outfile = "packages/mcp/dist/server.mjs";
await build({
  entryPoints: ["packages/mcp/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile,
  logLevel: "warning",
  banner: { js: "#!/usr/bin/env node\nimport{createRequire}from'module';const require=createRequire(import.meta.url);" },
});
try { chmodSync(outfile, 0o755); } catch {}
console.log(`built ${outfile}`);
