#!/usr/bin/env node
// verify-i18n-coverage.js
// Scans every HTML file under packages/marketing-website/ and verifies:
//   1. Exactly one <html lang="xx"> tag and lang value matches the file's path prefix.
//   2. Exactly 9 <link rel="alternate" hreflang="..."> tags (8 alternates + 1 x-default).
//   3. A <link rel="canonical" href="..."> tag whose URL matches the file's served path.
//   4. Each hreflang href points to an existing HTML file (either same-page-in-lang or lang-homepage fallback).
//   5. The 8 homepages include <script defer src="/assets/lang-switcher.js">.
//   6. lang-switcher.js LANGS array includes all 8 codes.
// Exits 1 on any failure, 0 on all pass.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'assets', 'scripts', '.git']);
const LANGS = ['en', 'zh', 'ja', 'es', 'fr', 'de', 'pt', 'ko'];
const LOCALE_MAP = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  ko: 'ko-KR',
};

let total = 0;
let pass = 0;
let fail = 0;
const failures = [];

function listHtmlFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      out.push(...listHtmlFiles(p));
    } else if (s.isFile() && name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

// Map a file path to its served URL path
function fileToServedPath(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
  if (rel === 'index.html') return '';
  if (rel.endsWith('/index.html')) return rel.slice(0, -'/index.html'.length) + '/';
  return rel;
}

function fileToLang(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep);
  if (rel[0] && LANGS.includes(rel[0])) return rel[0];
  return null;
}

function fileToHomepageLang(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
  if (rel === 'index.html') return 'en';
  if (rel.endsWith('/index.html') && LANGS.includes(rel.split('/')[0])) {
    return rel.split('/')[0];
  }
  return null;
}

function isExistingFile(servedPath) {
  // servedPath e.g. '' or 'zh/' or 'platforms/x/' or 'guides/twitter.html' or 'about.html'
  let fsPath;
  if (servedPath === '') {
    fsPath = path.join(ROOT, 'index.html');
  } else if (servedPath.endsWith('/')) {
    fsPath = path.join(ROOT, servedPath, 'index.html');
  } else {
    fsPath = path.join(ROOT, servedPath);
  }
  return fs.existsSync(fsPath);
}

function check(filePath) {
  total++;
  const rel = path.relative(ROOT, filePath);
  const html = fs.readFileSync(filePath, 'utf8');
  const fileFailures = [];
  const relPath = rel.split(path.sep).join('/');
  const servedPath = fileToServedPath(filePath);
  const fileLang = fileToLang(filePath);
  const isHomepage = fileToHomepageLang(filePath) !== null;

  // 1. <html lang>
  const htmlTagMatch = html.match(/<html[^>]*>/i);
  if (!htmlTagMatch) {
    fileFailures.push('1. <html> tag not found');
  } else {
    const langVal = (htmlTagMatch[0].match(/lang\s*=\s*"([^"]*)"/i) || [])[1];
    if (!langVal) {
      fileFailures.push('1. <html lang="..."> missing');
    } else if (fileLang) {
      const expected = LOCALE_MAP[fileLang];
      if (langVal !== expected && !(fileLang === 'en' && langVal === 'en')) {
        fileFailures.push(`1. <html lang="${langVal}"> does not match expected "${expected}" for path prefix /${fileLang}/`);
      }
    }
  }

  // 2. canonical link
  const canonicalMatch = html.match(/<link[^>]+rel\s*=\s*"canonical"[^>]*>/i);
  if (!canonicalMatch) {
    fileFailures.push('2. <link rel="canonical"> missing');
  } else {
    const canonicalHref = (canonicalMatch[0].match(/href\s*=\s*"([^"]*)"/i) || [])[1];
    const expectedCanonical = `https://socialeraser.app/${servedPath}`;
    if (canonicalHref !== expectedCanonical) {
      fileFailures.push(`2. canonical href "${canonicalHref}" != expected "${expectedCanonical}"`);
    }
  }

  // 3. hreflang alternates — exactly 9
  const hreflangMatches = html.match(/<link[^>]+rel\s*=\s*"alternate"[^>]+hreflang\s*=\s*"([^"]+)"[^>]*>/gi) || [];
  const hreflangCodes = hreflangMatches.map(m => {
    return (m.match(/hreflang\s*=\s*"([^"]+)"/i) || [])[1];
  });
  if (hreflangMatches.length !== 9) {
    fileFailures.push(`3. hreflang count = ${hreflangMatches.length}, expected 9 (8 alternates + 1 x-default)`);
  }
  for (const code of LANGS) {
    if (!hreflangCodes.includes(code)) {
      fileFailures.push(`3. missing hreflang="${code}"`);
    }
  }
  if (!hreflangCodes.includes('x-default')) {
    fileFailures.push(`3. missing hreflang="x-default"`);
  }
  // Check each alternate's href points to an existing file
  for (const m of hreflangMatches) {
    const code = (m.match(/hreflang\s*=\s*"([^"]+)"/i) || [])[1];
    const href = (m.match(/href\s*=\s*"([^"]+)"/i) || [])[1];
    if (!href) {
      fileFailures.push(`3. hreflang="${code}" missing href attribute`);
      continue;
    }
    if (!href.startsWith('https://socialeraser.app/')) {
      fileFailures.push(`3. hreflang="${code}" href "${href}" must start with https://socialeraser.app/`);
      continue;
    }
    const linkPath = href.slice('https://socialeraser.app/'.length);
    if (code === 'x-default') {
      // x-default should be the same as canonical
      if (linkPath !== servedPath) {
        fileFailures.push(`3. hreflang="x-default" href "${linkPath}" should match served path "${servedPath}"`);
      }
    }
    if (!isExistingFile(linkPath)) {
      fileFailures.push(`3. hreflang="${code}" href "${linkPath}" points to non-existing file`);
    }
  }

  // 4. Homepage includes lang-switcher.js
  if (isHomepage) {
    if (!/src\s*=\s*"\/assets\/lang-switcher\.js"/i.test(html)) {
      fileFailures.push('4. homepage missing <script src="/assets/lang-switcher.js">');
    }
  }

  if (fileFailures.length === 0) {
    pass++;
    return { ok: true, rel: relPath };
  } else {
    fail++;
    failures.push({ file: relPath, issues: fileFailures });
    return { ok: false, rel: relPath };
  }
}

function checkLangSwitcher() {
  total++;
  const filePath = path.join(ROOT, 'assets', 'lang-switcher.js');
  if (!fs.existsSync(filePath)) {
    fail++;
    failures.push({ file: 'assets/lang-switcher.js', issues: ['5. file not found'] });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const fileFailures = [];
  for (const code of LANGS) {
    if (!content.includes(`code: '${code}'`)) {
      fileFailures.push(`5. LANGS missing code '${code}'`);
    }
  }
  if (fileFailures.length === 0) {
    pass++;
  } else {
    fail++;
    failures.push({ file: 'assets/lang-switcher.js', issues: fileFailures });
  }
}

function main() {
  const files = listHtmlFiles(ROOT);
  for (const f of files) {
    check(f);
  }
  checkLangSwitcher();

  console.log('');
  console.log('=== i18n Coverage Verification ===');
  console.log(`Total checks: ${total}`);
  console.log(`Pass: ${pass}`);
  console.log(`Fail: ${fail}`);
  if (fail > 0) {
    console.log('');
    console.log('=== Failures ===');
    for (const f of failures) {
      console.log(`\n${f.file}:`);
      for (const issue of f.issues) {
        console.log(`  - ${issue}`);
      }
    }
    process.exit(1);
  } else {
    console.log('');
    console.log('All checks passed.');
    process.exit(0);
  }
}

main();
