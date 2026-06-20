#!/usr/bin/env bash
# Deploy SocialEraser website to Cloudflare Pages
# Usage: ./scripts/deploy-website.sh
#
# Prerequisites:
#   1. npm i -g wrangler
#   2. wrangler login (one-time, opens browser)
#   3. wrangler pages project create socialeraser (one-time)
#   4. socialeraser.app DNS in Cloudflare (auto-configured if domain is on Cloudflare)
#
# After first deploy, configure custom domain in Cloudflare Dashboard:
#   Pages → socialeraser → Custom domains → socialeraser.app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBSITE_DIR="$ROOT_DIR/packages/marketing-website"

echo "==> Deploying website from $WEBSITE_DIR"
cd "$WEBSITE_DIR"

# Optional: build step (for EJS templates — not yet, P0 is static HTML)
# if [ -f "build.js" ]; then
#   echo "==> Building static site from templates"
#   node build.js
# fi

# Optional: dry-run check
# wrangler pages deploy . --project-name=socialeraser --dry-run

echo "==> Deploying to Cloudflare Pages (project: socialeraser)"
wrangler pages deploy . --project-name=socialeraser --commit-dirty=true

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
