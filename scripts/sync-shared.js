#!/usr/bin/env node
// Build sync for ALL platforms.
//
//   platforms/<name>-project/
//     src/             ← web UI source (single source of truth for that platform)
//     scripts/         ← core JS for that platform
//     chrome-source/   ← Chrome-specific source (manifest.json, background.js, ...)
//     firefox-source/  ← Firefox-specific source (future)
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
//                    (chrome-source/ → extensions/chrome-<prefix>/,
//                     firefox-source/ → extensions/firefox-<prefix>/, etc.)
//                    where <prefix> is the part before "-project" in the folder
//                    name (e.g. platforms/x-project → chrome-x / firefox-x).
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
  // Find all chrome-source/, firefox-source/, edge-source/, etc.
  const platformEntries = fs.readdirSync(platformDir, { withFileTypes: true });
  const browserSources = platformEntries.filter(e =>
    e.isDirectory() && /-(?:source|template)$/.test(e.name)
  );
  if (fs.existsSync(scripts) || browserSources.length > 0) {
    for (const srcEntry of browserSources) {
      const browser = srcEntry.name.replace(/-source$/, '').replace(/-template$/, '');
      const extDir = path.join(EXTENSIONS_DIR, `${browser}-${prefix}`);
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
