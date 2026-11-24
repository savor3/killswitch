#!/usr/bin/env bash
# Builds dist/ (adds the HTML skeleton around index.html) and deploys to Cloudflare Workers static assets.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist && cp -r img dist/
cp ../dashboard/public/icon.svg ../dashboard/public/icon-192.png dist/
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="icon.svg"><link rel="apple-touch-icon" href="icon-192.png"><meta name="theme-color" content="#08090c"><meta property="og:title" content="Killswitch"><meta property="og:description" content="Give your AI a budget. Not your keys. On-chain spending limits and an emergency stop for AI agents."><meta property="og:image" content="img/killall.jpg">'
  cat index.html; } > dist/index.html
npx -y wrangler@4.159.0 deploy
