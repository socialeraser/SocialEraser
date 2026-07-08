#!/usr/bin/env node
// One-shot: rebuild sitemap.xml from the actual filesystem so URL formats
// stay in lockstep with the live content.
//
// Behaviour:
//   - Globs every *.html under the marketing-website root (skips scripts/,
//     node_modules/, .git/).
//   - Computes each page's URL: pages served by <path>/index.html get a
//     trailing slash; pages served by a flat *.html file get the path
//     without .html (e.g. /about, /guides/twitter).
//   - Sets <lastmod> to a fixed release date (LASTMOD_DATE). We pin every
//     URL to the same date so the sitemap reflects the date the site went
//     live with the unified /path form, not the mtime of whichever file
//     was touched last in CI. Update LASTMOD_DATE only when the site
//     actually changes in a way that should move every page's freshness
//     signal — for incremental updates, prefer a new sitemap submission
//     without bumping the global date.
//   - For platform subpages, attaches an <image:image> block:
//       - X and TikTok: dedicated OG image (og-x.png / og-tiktok.png)
//       - YouTube / Instagram / Facebook: og-home.png placeholder
//         (matches the og:image the HTML actually points at now).
//   - Home page gets the og-home.png image too.
//
// Run: `node scripts/build-sitemap.js`

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://socialeraser.app';
// Pin every <lastmod> to a single release date so the sitemap's freshness
// signal matches the date the unified /path URL form went live, regardless
// of which files were touched by the build. Bump LASTMOD_DATE whenever the
// site has a release that should reset the freshness signal for all URLs.
const LASTMOD_DATE = '2026-07-07';

const SKIP_DIRS = new Set(['node_modules', 'scripts', '.git']);
const PRIORITY_HOME = '1.0';
const PRIORITY_PLATFORM = '0.9';
const PRIORITY_LANG_HOME = '0.8';
const PRIORITY_LANG_PLATFORM = '0.8';
const PRIORITY_GUIDE = '0.8';
const PRIORITY_SUPPORT = '0.7';
const PRIORITY_ABOUT_HELP = '0.5';
const PRIORITY_LEGAL = '0.3';
const PRIORITY_SUCCESS = '0.2';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function pageUrlFor(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  // Strip a trailing /index.html → directory URL with trailing slash
  if (rel.endsWith('/index.html')) {
    return '/' + rel.slice(0, -'/index.html'.length) + '/';
  }
  // Flat *.html → path without extension
  return '/' + rel.replace(/\.html$/, '');
}

function ymd(_mtime) {
  return LASTMOD_DATE;
}

function classify(url) {
  if (url === '/') return { priority: PRIORITY_HOME, changefreq: 'weekly', image: 'og-home.png' };
  if (/^\/(zh|ja|es|fr|de|pt|ko)\/$/.test(url)) return { priority: PRIORITY_LANG_HOME, changefreq: 'weekly' };
  if (/^\/platforms\/[a-z]+\/$/.test(url)) {
    const plat = url.split('/')[2];
    const platformImages = { x: 'og-x.png', tiktok: 'og-tiktok.png' };
    return { priority: PRIORITY_PLATFORM, changefreq: 'weekly', image: platformImages[plat] || 'og-home.png' };
  }
  if (/^\/(zh|ja|es|fr|de|pt|ko)\/platforms\/[a-z]+\/$/.test(url)) {
    const plat = url.split('/')[3];
    const platformImages = { x: 'og-x.png', tiktok: 'og-tiktok.png' };
    return { priority: PRIORITY_LANG_PLATFORM, changefreq: 'weekly', image: platformImages[plat] || 'og-home.png' };
  }
  if (/^\/(guides|zh\/guides|ja\/guides|es\/guides|fr\/guides|de\/guides|pt\/guides|ko\/guides)\/[a-z]+$/.test(url))
    return { priority: PRIORITY_GUIDE, changefreq: 'monthly' };
  if (/^\/(support|zh\/support|ja\/support|es\/support|fr\/support|de\/support|pt\/support|ko\/support)$/.test(url))
    return { priority: PRIORITY_SUPPORT, changefreq: 'monthly' };
  if (/^\/(about|help|zh\/about|zh\/help|ja\/about|ja\/help|es\/about|es\/help|fr\/about|fr\/help|de\/about|de\/help|pt\/about|pt\/help|ko\/about|ko\/help)$/.test(url))
    return { priority: PRIORITY_ABOUT_HELP, changefreq: 'monthly' };
  if (/^\/(terms|privacy|zh\/terms|zh\/privacy|ja\/terms|ja\/privacy|es\/terms|es\/privacy|fr\/terms|fr\/privacy|de\/terms|de\/privacy|pt\/terms|pt\/privacy|ko\/terms|ko\/privacy)$/.test(url))
    return { priority: PRIORITY_LEGAL, changefreq: 'monthly' };
  if (/^\/(success|zh\/success|ja\/success|es\/success|fr\/success|de\/success|pt\/success|ko\/success)$/.test(url))
    return { priority: PRIORITY_SUCCESS, changefreq: 'yearly' };
  return { priority: '0.5', changefreq: 'monthly' };
}

const files = walk(ROOT);
// 404 is a noindex page (see <meta name="robots" content="noindex, follow">)
// and a duplicate of an HTTP 404 response — it should not appear in the
// sitemap. Excluding it here keeps the sitemap's URL set clean and avoids
// sending crawlers a path that explicitly asks them not to index.
const realFiles = files.filter(f => {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  return rel !== '404.html';
});
const entries = realFiles.map(f => {
  const url = pageUrlFor(f);
  const stat = fs.statSync(f);
  return { url, mtime: stat.mtime, ...classify(url) };
});

// Sort: home first, then language homepages, then by URL for stable ordering.
entries.sort((a, b) => a.url.localeCompare(b.url));

const out = [];
out.push('<?xml version="1.0" encoding="UTF-8"?>');
out.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
out.push('        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">');

for (const e of entries) {
  out.push('  <url>');
  out.push(`    <loc>${SITE}${e.url}</loc>`);
  out.push(`    <lastmod>${ymd(e.mtime)}</lastmod>`);
  out.push(`    <changefreq>${e.changefreq}</changefreq>`);
  out.push(`    <priority>${e.priority}</priority>`);
  if (e.image) {
    out.push('    <image:image>');
    out.push(`      <image:loc>${SITE}/assets/icons/${e.image}</image:loc>`);
    out.push('    </image:image>');
  }
  out.push('  </url>');
}
out.push('</urlset>');
out.push('');

const sitemapPath = path.join(ROOT, 'sitemap.xml');
fs.writeFileSync(sitemapPath, out.join('\n'));
console.log(`build-sitemap: ${entries.length} URLs written to sitemap.xml`);
