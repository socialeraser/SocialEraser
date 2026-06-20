#!/usr/bin/env bash
# Deploy SocialEraser website to Cloudflare Pages
# Usage:
#   ./scripts/deploy-website.sh                              # uses wrangler on PATH (preferred)
#   CLOUDFLARE_API_TOKEN=xxx ./scripts/deploy-website.sh     # CI / non-interactive
#   npx wrangler pages deploy . --project-name=socialeraser  # one-off
#
# Prerequisites:
#   1. wrangler installed locally: cd packages/marketing-website && npm install
#      (or globally: npm i -g wrangler)
#   2a. wrangler login (one-time, opens browser)             — for interactive use
#   2b. Or set CLOUDFLARE_API_TOKEN                          — for CI / non-interactive
#   3. wrangler pages project create socialeraser (one-time)
#   4. socialeraser.app DNS in Cloudflare (auto-configured if domain is on Cloudflare)
#
# After first deploy, configure custom domain in Cloudflare Dashboard:
#   Pages → socialeraser → Custom domains → socialeraser.app
#
# To create an API token for CI use:
#   Cloudflare Dashboard → My Profile → API Tokens → Create Token
#   → Edit Cloudflare Pages template (or Custom Token with Pages:Edit permission)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBSITE_DIR="$ROOT_DIR/packages/marketing-website"

echo "==> Deploying website from $WEBSITE_DIR"
cd "$WEBSITE_DIR"

# Locate wrangler: local node_modules > global > npx fallback
WRANGLER_BIN=""
if [ -x "node_modules/.bin/wrangler" ]; then
  WRANGLER_BIN="./node_modules/.bin/wrangler"
elif command -v wrangler >/dev/null 2>&1; then
  WRANGLER_BIN="wrangler"
else
  echo "==> wrangler not on PATH. Falling back to 'npx --yes wrangler' (downloads to npm cache)."
  WRANGLER_BIN="npx --yes wrangler"
fi

# Optional: build step (for EJS templates — not yet, P0 is static HTML)
# if [ -f "build.js" ]; then
#   echo "==> Building static site from templates"
#   node build.js
# fi

# Optional: dry-run check
# $WRANGLER_BIN pages deploy . --project-name=socialeraser --dry-run

echo "==> Deploying to Cloudflare Pages (project: socialeraser)"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "==> Using CLOUDFLARE_API_TOKEN from env (CI mode)"
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" $WRANGLER_BIN pages deploy . --project-name=socialeraser --commit-dirty=true
else
  $WRANGLER_BIN pages deploy . --project-name=socialeraser --commit-dirty=true
fi

echo ""
echo "✅ Deployed!"
echo ""
echo "Default URL:  https://socialeraser.pages.dev"
echo "Custom URL:   https://socialeraser.app  (after DNS + custom domain setup)"
echo ""
echo "Next steps:"
echo "  1. Cloudflare Dashboard → Pages → socialeraser → Custom domains → add 'socialeraser.app'"
echo "  2. If domain is NOT on Cloudflare DNS: add CNAME 'socialeraser.app' → 'socialeraser.pages.dev' at registrar"
echo "  3. Update Chrome Web Store listing: Privacy URL = https://socialeraser.app/privacy.html"
