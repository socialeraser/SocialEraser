#!/usr/bin/env node
/**
 * Schema 对齐检查
 *
 * 验证 DEFAULT_SELECTORS（lib/injector.js）/ config/default.json /
 * config/remote-example.json 三处的 selector schema 完全一致。
 *
 * 目的：避免 X 改版时只更新了 config 没更新 DEFAULT_SELECTORS 导致
 *       远程热修失效的设计原则违反。
 *
 * 排除：
 *   - login: 由 config.js 独立 merge（content.js 消费），不入 DEFAULT_SELECTORS
 *   - xWebsite: 由 config.js 独立 merge（background.js 消费），不入 DEFAULT_SELECTORS
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INJECTOR = path.join(ROOT, 'chrome-extension/lib/injector.js');
const DEFAULT_CFG = path.join(ROOT, 'chrome-extension/config/default.json');
const REMOTE_CFG = path.join(ROOT, 'chrome-extension/config/remote-example.json');

const EXCLUDE_FROM_DEFAULT = new Set(['login', 'xWebsite']);

function readDefaultSelectors() {
  const src = fs.readFileSync(INJECTOR, 'utf8');
  const m = src.match(/const DEFAULT_SELECTORS = \{(.+?)\n  \};/s);
  if (!m) throw new Error('DEFAULT_SELECTORS block not found');
  const body = m[1];
  // split by top-level "key: {" pattern
  const sections = body.split(/\n\s+(\w+):\s*\{/);
  const out = {};
  // sections = ['', 'like', '{...', 'bookmark', '{...', ...]
  for (let i = 1; i < sections.length; i += 2) {
    const k = sections[i];
    const sub = sections[i + 1] || '';
    const end = sub.search(/\n  \},?\s*\n/);
    const block = end >= 0 ? sub.slice(0, end) : sub;
    const keys = new Set();
    const re = /^\s*(\w+)\s*:/gm;
    let mm;
    while ((mm = re.exec(block)) !== null) keys.add(mm[1]);
    out[k] = Array.from(keys);
  }
  return out;
}

function readConfigSelectors(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(j.selectors || {})) {
    out[k] = Object.keys(v);
  }
  return out;
}

function arrEq(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(), sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('[OK]   ' + name); }
  else {
    fail++;
    console.log('[FAIL] ' + name);
    if (extra !== undefined) console.log('       ' + extra);
  }
}
function skip(name) { console.log('[SKIP] ' + name); }

const def = readDefaultSelectors();
const cfgA = readConfigSelectors(DEFAULT_CFG);
const cfgB = readConfigSelectors(REMOTE_CFG);

const allKeys = new Set([...Object.keys(def), ...Object.keys(cfgA), ...Object.keys(cfgB)]);
for (const k of allKeys) {
  if (EXCLUDE_FROM_DEFAULT.has(k)) {
    skip(k + ': 仅在 config 中（独立 merge 路径，不入 DEFAULT_SELECTORS）');
    continue;
  }
  const d = def[k] || [];
  const a = cfgA[k] || [];
  const b = cfgB[k] || [];
  const dStr = d.length ? d.join(', ') : '(empty)';
  if (arrEq(d, a) && arrEq(d, b)) {
    check(`${k}: ${d.length} keys aligned`, true);
  } else {
    check(`${k}: ${d.length} keys aligned`, false, `DEFAULT: ${dStr}\n       cfgA:  ${a.join(', ')}\n       cfgB:  ${b.join(', ')}`);
  }
}

console.log(`\nSchema alignment: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
