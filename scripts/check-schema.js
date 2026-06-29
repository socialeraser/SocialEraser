#!/usr/bin/env node
/**
 * Schema 对齐检查（多平台）
 *
 * 验证每个 platforms/*-project/ 下的 default.json 和 *-remote-example.json
 * 两处 selector schema 完全一致。
 *
 * 目的：避免平台改版时只更新了其中一个 config 导致远程热修失效。
 * 之前还对比 lib/injector.js 的 DEFAULT_SELECTORS 块，2026-XX-XX 改造后
 * DEFAULT_SELECTORS 已删除，schema 单一来源是 config 文件
 * （default 是内置兜底，remote 是远程热修源），二者必须字段对齐。
 *
 * 每平台独立 EXCLUDE 块（独立 merge 路径的 selector 不参与 schema 比对）：
 *   - x-project:     login, xWebsite, i18n
 *   - tiktok-project: login, tiktokWebsite, i18n
 *   - 未来新平台:     按需在 PLATFORM_EXCLUDES 加
 *
 * 排除 _comment 字段（元数据，非 selector）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(ROOT, 'platforms');

// 平台 -> 独立 merge 路径的 selector 块（不入 schema 比对）
const PLATFORM_EXCLUDES = {
  'x-project':     new Set(['login', 'xWebsite', 'i18n']),
  'tiktok-project': new Set(['login', 'tiktokWebsite', 'i18n']),
};

function readConfigSelectors(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(j.selectors || {})) {
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

function findPlatforms() {
  if (!fs.existsSync(PLATFORMS_DIR)) return [];
  return fs.readdirSync(PLATFORMS_DIR).filter(name => {
    const p = path.join(PLATFORMS_DIR, name);
    return fs.statSync(p).isDirectory() && /-project$/.test(name);
  });
}

function findConfigPair(platformDir) {
  // default.json 是固定名；remote 文件命名约定是 <platform-prefix>-remote-example.json
  // x-project: x-remote-example.json
  // tiktok-project: tiktok-remote-example.json
  const configDir = path.join(platformDir, 'src', 'config');
  if (!fs.existsSync(configDir)) return null;
  const defaultPath = path.join(configDir, 'default.json');
  if (!fs.existsSync(defaultPath)) return null;
  const files = fs.readdirSync(configDir);
  const remoteFile = files.find(f => /-remote-example\.json$/.test(f) && f !== 'default.json');
  if (!remoteFile) return null;
  return {
    defaultPath: defaultPath,
    remotePath: path.join(configDir, remoteFile),
    remoteName: remoteFile
  };
}

let totalPass = 0, totalFail = 0;
function check(name, cond, extra) {
  if (cond) { totalPass++; console.log('  [OK]   ' + name); }
  else {
    totalFail++;
    console.log('  [FAIL] ' + name);
    if (extra !== undefined) console.log('         ' + extra);
  }
}
function skip(name) { console.log('  [SKIP] ' + name); }

const platforms = findPlatforms();
if (platforms.length === 0) {
  console.log('[WARN] No platforms found under platforms/');
  process.exit(0);
}

for (const platformName of platforms) {
  const platformDir = path.join(PLATFORMS_DIR, platformName);
  const pair = findConfigPair(platformDir);
  if (!pair) {
    console.log('\n[' + platformName + '] no config pair (default.json + *-remote-example.json) — SKIP');
    continue;
  }

  const excludes = PLATFORM_EXCLUDES[platformName] || new Set();
  console.log('\n[' + platformName + '] default.json ↔ ' + pair.remoteName);

  let cfgA, cfgB;
  try { cfgA = readConfigSelectors(pair.defaultPath); }
  catch (e) { console.log('  [FAIL] default.json parse error: ' + e.message); totalFail++; continue; }
  try { cfgB = readConfigSelectors(pair.remotePath); }
  catch (e) { console.log('  [FAIL] ' + pair.remoteName + ' parse error: ' + e.message); totalFail++; continue; }

  const allKeys = new Set([...Object.keys(cfgA), ...Object.keys(cfgB)]);
  for (const k of allKeys) {
    if (excludes.has(k)) {
      skip(k + ': 独立 merge 路径，不入 schema 检查');
      continue;
    }
    const a = cfgA[k] || [];
    const b = cfgB[k] || [];
    if (arrEq(a, b)) {
      check(`${k}: ${a.length} keys aligned`, true);
    } else {
      check(`${k}: ${a.length} keys aligned`, false,
        `default:  ${a.join(', ')}\n         remote:  ${b.join(', ')}`);
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Schema alignment: ${totalPass} pass, ${totalFail} fail (across ${platforms.length} platform(s))`);
process.exit(totalFail === 0 ? 0 : 1);
