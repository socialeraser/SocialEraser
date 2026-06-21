#!/usr/bin/env node
/**
 * setConfig 单元测试（2026-XX-XX 重构后版本）
 *
 * 重构后行为：
 *   - setConfig(config) 直接用 config.selectors 作为 this.config
 *   - 不再有 DEFAULT_SELECTORS 兜底（background.js 3 层回退保证 config 永远有值）
 *   - 浅拷贝：防止 processXxx 写入 this.config 污染 source config
 *
 * 覆盖场景：
 *   1. config=null → this.config = {}（空对象）
 *   2. config={} → this.config = {}
 *   3. config={selectors:{}} → this.config = {}
 *   4. config.selectors={like:{unlikeButtons:[...]}} → 直接生效
 *   5. config.selectors 多个 type 字段都生效
 *   6. 未知 type 字段也被采纳
 *   7. 写入 this.config 不污染 source config（浅拷贝生效）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INJECTOR = path.join(ROOT, 'platforms/x-project/scripts/x-automation.js');
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

console.log('[1] config=null → this.config = {}');
{
  const i = new XEraserInjector();
  i.setConfig(null);
  assert('this.config 是空对象', i.config && Object.keys(i.config).length === 0);
}

console.log('\n[2] config={} → this.config = {}');
{
  const i = new XEraserInjector();
  i.setConfig({});
  assert('this.config 是空对象', i.config && Object.keys(i.config).length === 0);
}

console.log('\n[3] config={selectors:{}} → this.config = {}');
{
  const i = new XEraserInjector();
  i.setConfig({ selectors: {} });
  assert('this.config 是空对象', i.config && Object.keys(i.config).length === 0);
}

console.log('\n[4] 远程提供 like.unlikeButtons → 远程数组生效');
{
  const i = new XEraserInjector();
  const remote = ["[data-testid='custom-unlike']"];
  i.setConfig({ selectors: { like: { unlikeButtons: remote } } });
  assert('like.unlikeButtons 等于远程', JSON.stringify(i.config.like.unlikeButtons) === JSON.stringify(remote));
}

console.log('\n[5] 远程提供多个 type → 全部生效');
{
  const i = new XEraserInjector();
  const cfg = {
    selectors: {
      tweet: { moreButtons: ['[data-testid="more"]'] },
      like: { unlikeButtons: ['[data-testid="unlike"]'] },
      bookmark: { removeButtons: ['[data-testid="bookmark"]'] },
      following: { unfollowButtons: ['[data-testid="unfollow"]'] },
      common: { confirmButton: ['[data-testid="confirm"]'] }
    }
  };
  i.setConfig(cfg);
  assert('tweet.moreButtons 生效', i.config.tweet.moreButtons[0] === '[data-testid="more"]');
  assert('like.unlikeButtons 生效', i.config.like.unlikeButtons[0] === '[data-testid="unlike"]');
  assert('bookmark.removeButtons 生效', i.config.bookmark.removeButtons[0] === '[data-testid="bookmark"]');
  assert('following.unfollowButtons 生效', i.config.following.unfollowButtons[0] === '[data-testid="unfollow"]');
  assert('common.confirmButton 生效', i.config.common.confirmButton[0] === '[data-testid="confirm"]');
}

console.log('\n[6] 远程提供未知 type → 远程块被采纳');
{
  const i = new XEraserInjector();
  i.setConfig({ selectors: { unknownType: { container: 'X' } } });
  assert('unknownType.container 存在', i.config.unknownType && i.config.unknownType.container === 'X');
}

console.log('\n[7] 写入 this.config 不污染 source config（浅拷贝）');
{
  const sourceRemote = ["[data-testid='source-unlike']"];
  const cfg = { selectors: { like: { unlikeButtons: sourceRemote } } };
  const i = new XEraserInjector();
  i.setConfig(cfg);
  i.config.like.unlikeButtons.push('MUTATED');
  assert('source config 的 unlikeButtons 不被污染',
    cfg.selectors.like.unlikeButtons.length === 1 &&
    cfg.selectors.like.unlikeButtons[0] === "[data-testid='source-unlike']");
  assert('this.config 的 unlikeButtons 长度 = 2',
    i.config.like.unlikeButtons.length === 2);
}

console.log('\n[8] 嵌套对象也浅拷贝（userInfo 等）');
{
  const cfg = { selectors: { common: { userInfo: { userCell: ['a'], userName: ['b'], userDescription: ['c'] } } } };
  const i = new XEraserInjector();
  i.setConfig(cfg);
  i.config.common.userInfo.userCell.push('MUTATED');
  assert('source config 的 userInfo.userCell 不被污染',
    cfg.selectors.common.userInfo.userCell.length === 1);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);