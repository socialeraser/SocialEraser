#!/usr/bin/env node
/**
 * Schema 对齐检查
 *
 * 验证 config/default.json / config/remote-example.json 两处 selector schema 完全一致。
 *
 * 目的：避免 X 改版时只更新了其中一个 config 导致远程热修失效。
 * 历史：2026-XX-XX 之前还对比 lib/injector.js 的 DEFAULT_SELECTORS 块，
 *   案例 6 改造后 DEFAULT_SELECTORS 已删除，schema 单一来源是 config 文件
 *   （default 是内置兜底，remote 是远程热修源），二者必须字段对齐。
 *
 * 排除：
 *   - login: 由 content.js 独立 merge，不入此 schema 检查（README 已说明）
 *   - xWebsite: 由 background.js 独立 merge，不入此 schema 检查
 *   - i18n: i18n.js DEFAULT_I18N 已是单一来源，config 里的 i18n 块是远程覆盖
 *   - _comment: 元数据，非 selector
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CFG = path.join(ROOT, 'chrome-extension/config/default.json');
const REMOTE_CFG = path.join(ROOT, 'chrome-extension/config/remote-example.json');

const EXCLUDE_FROM_CHECK = new Set(['login', 'xWebsite', 'i18n']);

function readConfigSelectors(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(j.selectors || {})) {
    // 排除元数据字段（_comment），只比 selector 字段名
    const fields = Object.keys(v).filter(function(name) { return !name.startsWith('_'); });
    out[k] = fields;
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

const cfgA = readConfigSelectors(DEFAULT_CFG);
const cfgB = readConfigSelectors(REMOTE_CFG);

const allKeys = new Set([...Object.keys(cfgA), ...Object.keys(cfgB)]);
for (const k of allKeys) {
  if (EXCLUDE_FROM_CHECK.has(k)) {
    skip(k + ': 独立 merge 路径，不入 schema 检查');
    continue;
  }
  const a = cfgA[k] || [];
  const b = cfgB[k] || [];
  if (arrEq(a, b)) {
    check(`${k}: ${a.length} keys aligned`, true);
  } else {
    check(`${k}: ${a.length} keys aligned`, false,
      `default:  ${a.join(', ')}\n       remote:  ${b.join(', ')}`);
  }
}

console.log(`\nSchema alignment: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
