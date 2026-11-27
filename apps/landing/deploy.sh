#!/usr/bin/env bash
# Builds the landing into dist/ and deploys it to Cloudflare Workers static assets.
set -euo pipefail
cd "$(dirname "$0")"
(cd ../.. && npm run -s landing:build)
npx -y wrangler@4.159.0 deploy
