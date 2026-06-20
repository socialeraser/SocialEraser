#!/usr/bin/env node
// Sync shared web assets from chrome-extension/ to www/ for Capacitor.
// chrome-extension/ is the single source of truth for the web bundle
// used by Chrome extension, Android (via Capacitor) and iOS (via Capacitor).
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'chrome-extension');
const DST = path.join(__dirname, '..', 'www');

if (fs.existsSync(DST)) {
  fs.rmSync(DST, { recursive: true, force: true });
}
fs.mkdirSync(DST, { recursive: true });
fs.cpSync(SRC, DST, { recursive: true });

// Capacitor requires an index.html as the web entry point. The Chrome
// extension's main UI lives in sidepanel.html, so we use it as the
// mobile/web entry point too.
const sidepanelSrc = path.join(DST, 'sidepanel.html');
const indexDst = path.join(DST, 'index.html');
if (fs.existsSync(sidepanelSrc)) {
  fs.copyFileSync(sidepanelSrc, indexDst);
  console.log(`[sync-shared] sidepanel.html -> index.html (Capacitor entry)`);
}

console.log(`[sync-shared] ${SRC} -> ${DST}`);
