#!/usr/bin/env node
/**
 * Copy shared/ sources to consumer directories.
 * Run via: npm run sync
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');

const COPY_MAP = [
  { src: 'injector.js', dests: ['chrome-extension/injector.js', 'www/injector.js'] },
  { src: 'selectorConfig.json', dests: ['www/selectorConfig.json'] },
  { src: 'bridge.js', dests: ['www/bridge.js'] }
];

const GENERATED_HEADER = {
  'injector.js': '/* AUTO-GENERATED from shared/injector.js — do not edit. Run: npm run sync */\n',
  'selectorConfig.json': '',
  'bridge.js': '/* AUTO-GENERATED from shared/bridge.js — do not edit. Run: npm run sync */\n'
};

function copyFile(srcName, destRelPath) {
  const srcPath = path.join(SHARED, srcName);
  const destPath = path.join(ROOT, destRelPath);

  if (!fs.existsSync(srcPath)) {
    console.error(`Missing source: shared/${srcName}`);
    process.exit(1);
  }

  const content = fs.readFileSync(srcPath, 'utf8');
  const header = GENERATED_HEADER[srcName] || '';
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, header + content, 'utf8');
  console.log(`  shared/${srcName} → ${destRelPath}`);
}

console.log('[sync-shared] Copying shared sources...\n');

for (const { src, dests } of COPY_MAP) {
  for (const dest of dests) {
    copyFile(src, dest);
  }
}

console.log('\n[sync-shared] Done.');
