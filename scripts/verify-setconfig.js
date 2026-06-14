#!/usr/bin/env node
/**
 * setConfig 字段级合并单元测试
 *
 * 覆盖场景：
 * 1. config=null → merged 等于 DEFAULT_SELECTORS 浅拷贝
 * 2. config.selectors={} → 同上
 * 3. 远程提供 like.unlikeButtons（覆盖 DEFAULT）→ 远程数组生效
 * 4. 远程只提供 like.container（缺 unlikeButtons）→ 仍保留 DEFAULT.unlikeButtons [关键修复]
 * 5. 远程提供完全未知的 type（DEFAULT 没有的）→ 远程块被采纳
 * 6. 远程写 merged 后，DEFAULT_SELECTORS 原始对象不被污染
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INJECTOR = path.join(ROOT, 'chrome-extension/lib/injector.js');
const src = fs.readFileSync(INJECTOR, 'utf8');

const sandbox = {
  console: console,
  document: { querySelector: function() { return null; }, querySelectorAll: function() { return []; } },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  Date: Date, Math: Math, JSON: JSON, Object: Object,
  Array: Array, Set: Set, Map: Map,
  String: String, Number: Number, Boolean: Boolean
};
sandbox.window = sandbox;
sandbox.document = { querySelector: function() { return null; }, querySelectorAll: function() { return []; } };

const ctx = vm.createContext(sandbox);
vm.runInContext(src, ctx);
const { XEraserInjector } = sandbox.window;

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function arrayEq(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const base = new XEraserInjector();
base.setConfig(null);
const DEFAULT_LIKE_CONTAINER = base.config.like.container;
const DEFAULT_LIKE_UNLIKE = base.config.like.unlikeButtons.slice();
const DEFAULT_BOOKMARK_REMOVE = base.config.bookmark.removeButtons.slice();

console.log('[1] config=null → merged 等于 DEFAULT 浅拷贝');
{
  const i = new XEraserInjector();
  i.setConfig(null);
  assert('like.container 保留', i.config.like.container === DEFAULT_LIKE_CONTAINER);
  assert('like.unlikeButtons 保留', arrayEq(i.config.like.unlikeButtons, DEFAULT_LIKE_UNLIKE));
  assert('bookmark.removeButtons 保留', arrayEq(i.config.bookmark.removeButtons, DEFAULT_BOOKMARK_REMOVE));
}

console.log('\n[2] config={selectors:{}} → 同上');
{
  const i = new XEraserInjector();
  i.setConfig({ selectors: {} });
  assert('like.unlikeButtons 保留', arrayEq(i.config.like.unlikeButtons, DEFAULT_LIKE_UNLIKE));
}

console.log('\n[3] 远程提供 like.unlikeButtons → 远程数组生效');
{
  const i = new XEraserInjector();
  const remote = ["[data-testid='custom-unlike']"];
  i.setConfig({ selectors: { like: { unlikeButtons: remote } } });
  assert('like.unlikeButtons 等于远程', arrayEq(i.config.like.unlikeButtons, remote));
  assert('like.container 仍等于 DEFAULT', i.config.like.container === DEFAULT_LIKE_CONTAINER);
}

console.log('\n[4] 远程只覆盖 like.container（缺 unlikeButtons）→ 保留 DEFAULT.unlikeButtons [关键修复]');
{
  const i = new XEraserInjector();
  i.setConfig({ selectors: { like: { container: "[data-testid='custom-tweet']" } } });
  assert('like.container 等于远程（覆盖）', i.config.like.container === "[data-testid='custom-tweet']");
  assert('like.unlikeButtons 仍等于 DEFAULT（不被丢）', arrayEq(i.config.like.unlikeButtons, DEFAULT_LIKE_UNLIKE));
  assert('like.unlikeButtons 不是 undefined', i.config.like.unlikeButtons !== undefined);
}

console.log('\n[5] 远程提供未知 type → 远程块被采纳');
{
  const i = new XEraserInjector();
  i.setConfig({ selectors: { unknownType: { container: "X" } } });
  assert('unknownType.container 存在', i.config.unknownType && i.config.unknownType.container === 'X');
  assert('原有 like 块仍存在', i.config.like && i.config.like.container === DEFAULT_LIKE_CONTAINER);
}

console.log('\n[6] 远程写入不污染 DEFAULT_SELECTORS 原始对象');
{
  const i = new XEraserInjector();
  const beforeContainer = base.config.like.container;
  const beforeUnlike = base.config.like.unlikeButtons.slice();
  i.setConfig({ selectors: { like: { container: "MUTATED" } } });
  i.config.like.container = "MUTATED_AGAIN";
  i.config.like.unlikeButtons.push("MUTATED");
  assert('基准 like.container 未被改', base.config.like.container === beforeContainer);
  assert('基准 like.unlikeButtons 未被改（深一层）', arrayEq(base.config.like.unlikeButtons, beforeUnlike));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
