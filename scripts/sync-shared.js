#!/usr/bin/env node
// Build sync for ALL platforms.
//
//   platforms/<name>-project/
//     src/             ← web UI source (single source of truth for that platform)
//     scripts/         ← core JS for that platform
//     chrome-source/   ← Chrome/Edge-specific source (manifest.json, background.js, ...)
//     android/         ← Capacitor Android (optional, present after `npx cap add android`)
//     ios/             ← Capacitor iOS (optional)
//     capacitor.config.json
//     www/             ← build output (gitignored)
//
// This script iterates every platforms/<name>-project/ that has a `src/`
// folder and, for each one:
//   1. Syncs src/  →  <platform>/www/         (Capacitor webDir)
//                    + mirrors sidepanel.html as index.html (Capacitor entry point)
//   2. Syncs src/  +  scripts/  +  *-source/  →  extensions/<browser>-<prefix>/
//                    (chrome-source/ → extensions/chrome-<prefix>/ and edge-<prefix>/,
//                     see BROWSER_ALIASES below for the alias map. A more specific
//                     source like edge-source/, if present, takes over edge-<prefix>.)
//                    where <prefix> is the part before "-project" in the folder
//                    name (e.g. platforms/x-project → chrome-x / edge-x).
//   3. If capacitor.config.json exists, runs `npx cap copy` in the platform
//                    dir to copy www/ into android/ and ios/ assets.
//
// Platforms without an src/ folder (e.g. empty placeholders) are silently
// skipped so you can drop a new platforms/<name>-project/ folder in and have
// it auto-pick-up once you start adding files.
//
// Usage:
//   node scripts/sync-shared.js         # sync + cap copy
//   node scripts/sync-shared.js --no-cap # sync only (skip cap copy)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PLATFORMS_DIR = path.join(ROOT, 'platforms');
const EXTENSIONS_DIR = path.join(ROOT, 'extensions');
const SKIP_CAP = process.argv.includes('--no-cap');

// Browser source aliases: one source folder can produce multiple extension
// builds. Edge is Chromium-based and accepts the same MV3 manifest as Chrome
// (service worker + side_panel), so chrome-source/ serves both browsers.
// Add more aliases here if you need other forks (e.g. brave → brave + chrome).
const BROWSER_ALIASES = {
  chrome: ['chrome', 'edge'],
};

function rmrf(d) {
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
  console.log(`  [cp] ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`);
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dst);
  console.log(`  [cp] ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`);
}

function syncPlatform(platformDir) {
  const name = path.basename(platformDir);          // e.g. "x-project"
  const prefix = name.replace(/-project$/, '');     // e.g. "x"
  const src = path.join(platformDir, 'src');
  const scripts = path.join(platformDir, 'scripts');
  const www = path.join(platformDir, 'www');
  const chromeExt = path.join(EXTENSIONS_DIR, `chrome-${prefix}`);

  console.log(`\n=== Platform: ${name} ===`);

  if (!fs.existsSync(src)) {
    console.log(`  no src/ — skipping`);
    return;
  }

  // 1. src/ → www/  (Capacitor webDir)
  rmrf(www);
  copyDir(src, www);
  // Capacitor requires index.html. The web UI is sidepanel.html, so we
  // mirror it as index.html so the Capacitor WebView has an entry point.
  const sidepanelHtml = path.join(www, 'sidepanel.html');
  const indexHtml = path.join(www, 'index.html');
  if (fs.existsSync(sidepanelHtml)) {
    fs.copyFileSync(sidepanelHtml, indexHtml);
    console.log(`  [cp] sidepanel.html -> index.html (Capacitor entry)`);
  }

  // 2. src/ + scripts/ + *-source/ → extensions/<browser>-<prefix>/
  // Find all chrome-source/, edge-source/, etc. Each source may produce
  // multiple extension folders via BROWSER_ALIASES (chrome-source/ → both
  // extensions/chrome-x/ and extensions/edge-x/ BY DEFAULT). If a more
  // specific source exists for an aliased target (e.g. edge-source/ for the
  // 'edge' target), the more specific source owns the target and the alias
  // is skipped — so chrome-source/ won't overwrite edge-source/'s output.
  const platformEntries = fs.readdirSync(platformDir, { withFileTypes: true });
  const browserSources = platformEntries.filter(e =>
    e.isDirectory() && /-(?:source|template)$/.test(e.name)
  );

  // First pass: each source claims its own target first (no alias needed),
  // so a direct source like edge-source/ outranks chrome-source/'s alias
  // for the 'edge' target. Only after direct claims do alias targets get
  // assigned to whichever source first offered them.
  const targetOwner = new Map(); // target browser name → source folder name
  for (const srcEntry of browserSources) {
    const browser = srcEntry.name.replace(/-source$/, '').replace(/-template$/, '');
    targetOwner.set(browser, srcEntry.name);
  }
  for (const srcEntry of browserSources) {
    const browser = srcEntry.name.replace(/-source$/, '').replace(/-template$/, '');
    const targets = BROWSER_ALIASES[browser] || [browser];
    for (const t of targets) {
      if (!targetOwner.has(t)) targetOwner.set(t, srcEntry.name);
    }
  }

  if (fs.existsSync(scripts) || browserSources.length > 0) {
    for (const srcEntry of browserSources) {
      const browser = srcEntry.name.replace(/-source$/, '').replace(/-template$/, '');
      const targetBrowsers = BROWSER_ALIASES[browser] || [browser];
      for (const targetBrowser of targetBrowsers) {
        // Skip if a more specific source already owns this target.
        if (targetOwner.get(targetBrowser) !== srcEntry.name) continue;
        const extDir = path.join(EXTENSIONS_DIR, `${targetBrowser}-${prefix}`);
        rmrf(extDir);
        // copy src/ first
        if (fs.existsSync(src)) copyDir(src, extDir);
        // copy scripts/ on top
        if (fs.existsSync(scripts)) {
          for (const f of fs.readdirSync(scripts)) {
            copyFile(path.join(scripts, f), path.join(extDir, f));
          }
        }
        // copy <browser>-source/ on top
        copyDir(path.join(platformDir, srcEntry.name), extDir);
      }
    }
  }

  // 3. npx cap copy (if Capacitor is set up)
  if (SKIP_CAP) {
    console.log(`  --no-cap set, skipping cap copy`);
    return;
  }
  const capConfig = path.join(platformDir, 'capacitor.config.json');
  if (!fs.existsSync(capConfig)) {
    console.log(`  no capacitor.config.json — skipping cap copy`);
    return;
  }
  try {
    execSync('npx cap copy', { cwd: platformDir, stdio: 'inherit' });
  } catch (e) {
    console.error(`  cap copy failed for ${name}`);
    process.exit(1);
  }
}

// Main: iterate over all platforms/*/
const platforms = fs.readdirSync(PLATFORMS_DIR)
  .map(name => path.join(PLATFORMS_DIR, name))
  .filter(p => fs.statSync(p).isDirectory());

if (platforms.length === 0) {
  console.log('No platforms found.');
  process.exit(0);
}

for (const p of platforms) {
  syncPlatform(p);
}

console.log(`\nDone. Synced ${platforms.length} platform(s).`);
