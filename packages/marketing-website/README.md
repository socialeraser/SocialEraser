# packages/marketing-website

Marketing website for [socialeraser.app](https://socialeraser.app).

Static HTML/CSS (no build step). Deployed to Cloudflare Pages via
`scripts/deploy-website.sh`.

## Pages

- `index.html` — landing page (5-platform overview, time estimator, FAQ)
- `platforms/x/index.html` — X (Twitter) landing page
- `platforms/tiktok/index.html` — TikTok landing page
- `platforms/youtube/index.html` — YouTube landing page
- `platforms/instagram/index.html` — Instagram landing page
- `platforms/facebook/index.html` — Facebook landing page
- `help.html` — FAQ / how-to
- `privacy.html`, `terms.html` — legal

## SEO & discovery

- `sitemap.xml` — full URL list, referenced from every page's `<head>` via `<link rel="sitemap">`
- `robots.txt` — allows full crawl, blocks `/assets/`, references sitemap
- `llms.txt` — LLM-facing project description and page index
- Every page includes Open Graph + Twitter Card meta + JSON-LD (`SoftwareApplication`, `FAQPage`, `Organization`)

## Assets

- `assets/styles.css` — design tokens (CSS custom properties), reset, base styles
- `assets/app.css` — components (header, hero, cards, estimator, FAQ, footer, etc.)
- `assets/app.js` — vanilla JS: time estimator, tabs
- `assets/icons/` — SVG marks for X, TikTok, YouTube, Instagram, Facebook, Chrome, Edge, Android, iOS, SocialEraser brand mark
- `CNAME` — custom domain config for Cloudflare Pages
- `_headers` — Cloudflare Pages response headers (cache-control, security)

## Deploy

### One-time setup

1. Create a Cloudflare account and add `socialeraser.app` (if not already on Cloudflare DNS).
2. Create a Cloudflare API token at <https://dash.cloudflare.com/profile/api-tokens>:
   - Template: **Edit Cloudflare Pages** (or Custom Token with `Cloudflare Pages: Edit` permission)
   - Account Resources: your account
   - Zone Resources: `socialeraser.app` (or All zones)
   - Copy the token immediately — Cloudflare only shows it once.
3. Create the Pages project (one-time):
   ```bash
   cd packages/marketing-website
   CLOUDFLARE_API_TOKEN=xxx npx --yes wrangler pages project create socialeraser --production-branch=main
   ```
4. Make the deploy script executable (one-time, after cloning the repo):
   ```bash
   chmod +x scripts/deploy-website.sh
   ```

### Deploy

```bash
# Easiest: token via stdin (not stored in shell history)
read -s CF_TOKEN
cd /Volumes/XPSSD/workspaces/SocialEraser
CLOUDFLARE_API_TOKEN="$CF_TOKEN" ./scripts/deploy-website.sh
unset CF_TOKEN
```

The script:
1. Locates `wrangler` (local `node_modules/.bin/wrangler` → global → `npx --yes wrangler` fallback)
2. Runs `wrangler pages deploy . --project-name=socialeraser --commit-dirty=true`
3. Prints the deployment URL

### After first deploy

- Cloudflare Dashboard → **Pages** → `socialeraser` → **Custom domains** → add `socialeraser.app`
- If the domain is NOT on Cloudflare DNS, add a CNAME at the registrar: `socialeraser.app` → `socialeraser.pages.dev`
- Update the Chrome Web Store listing: Privacy URL = `https://socialeraser.app/privacy.html`

### Local preview

```bash
cd packages/marketing-website
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Current deployment status

- **Default URL:** <https://socialeraser.pages.dev> (provisioned after first successful deploy)
- **Custom URL:** <https://socialeraser.app> (after DNS + custom domain setup)
- **Production branch:** `main`
- **Build command:** none (static site)
- **Output directory:** `/` (repo root of `packages/marketing-website`)
- **Compatibility flags:** none
- **Environment variables:** none at deploy time; `CLOUDFLARE_API_TOKEN` is consumed locally by wrangler, not stored on Cloudflare

## Local development

- No build step. Edit HTML/CSS/JS directly. Refresh browser to see changes.
- `assets/styles.css` defines the design tokens. Adjust there first.
- `assets/app.css` defines components. Reuse existing classes before adding new ones.
- Keep Open Graph + JSON-LD meta in sync across all 6 pages when product copy changes.
