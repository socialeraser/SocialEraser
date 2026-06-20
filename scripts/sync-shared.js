#!/usr/bin/env node
// Build sync for the X platform.
//
//   platforms/x-project/src/          ← web UI source (single source of truth)
//   platforms/x-project/scripts/      ← core JS: x-automation.js, content.js, i18n.js
//
// This script syncs them to:
//   platforms/x-project/www/           ← consumed by Capacitor (→ Android assets)
//   extensions/chrome-x/               ← the actual Chrome extension folder
//
// For Chrome, the manifest in extensions/chrome-x/ references files in the
// same folder, so the sync copies the necessary scripts/ files alongside
// the src/ files.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLATFORM = path.join(ROOT, 'platforms', 'x-project');
const SRC = path.join(PLATFORM, 'src');
const SCRIPTS = path.join(PLATFORM, 'scripts');
const DST_WEB = path.join(PLATFORM, 'www');
const DST_CHROME = path.join(ROOT, 'extensions', 'chrome-x');

function clean(d) {
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[sync] ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`);
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dst);
  console.log(`[sync] ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`);
}

// 1. platforms/x-project/src/ → platforms/x-project/www/
clean(DST_WEB);
copyDir(SRC, DST_WEB);

// Capacitor requires index.html. The web UI is sidepanel.html, so we
// mirror it as index.html so the Capacitor WebView has an entry point.
const sidepanelHtml = path.join(DST_WEB, 'sidepanel.html');
const indexHtml = path.join(DST_WEB, 'index.html');
if (fs.existsSync(sidepanelHtml)) {
  fs.copyFileSync(sidepanelHtml, indexHtml);
  console.log(`[sync] sidepanel.html -> index.html (Capacitor entry)`);
}

// 2. platforms/x-project/src/ + scripts/ → extensions/chrome-x/
clean(DST_CHROME);
copyDir(SRC, DST_CHROME);
// The Chrome manifest's content.js needs x-automation.js + i18n.js next
// to it, so we copy the shared core scripts into the extension folder.
for (const f of ['x-automation.js', 'i18n.js', 'content.js']) {
  copyFile(path.join(SCRIPTS, f), path.join(DST_CHROME, f));
}
