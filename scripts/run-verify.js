#!/usr/bin/env node
/**
 * 统一 verify 入口
 *
 * 项目用「裸 node verify 脚本」而不是 jest：
 *   - verify 脚本是 grep 源码 + assert() + process.exit(0/1) 的纯静态扫描
 *   - 跑得快（不需要 jsdom）、零依赖、易于写"防 X 改版"类锁
 *   - 详见 docs/lessons-learned.md 第十节「Assert 比注释更长寿」
 *
 * 用法：
 *   npm test                  # 跑全部 verify + check-schema
 *   npm run verify            # 同上
 *   npm run verify:single -- tweets-bug-3
 *   node scripts/run-verify.js                  # 等价 npm test
 *   node scripts/run-verify.js --single tweets-bug-3
 *
 * 退出码：全部通过 → 0；任一失败 → 1
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPTS_DIR = __dirname;

// 跑全部 verify + check-schema（顺序：check-schema 先跑，selector schema 是后续 verify 的基础）
const ALL_SCRIPTS = [
  'check-schema.js',
  'verify-actual-x-selectors.js',
  'verify-config-sync.js',
  'verify-daily-usage-chain.js',
  'verify-following.js',
  'verify-i18n.js',
  'verify-login-detection.js',
  'verify-no-retry.js',
  'verify-processed-count-cumulative.js',
  'verify-scroll-to-bottom.js',
  'verify-setconfig.js',
  'verify-sidepanel-bindings.js',
  'verify-syntax.js',
  'verify-tweets-bug-3.js',
  'verify-tip-model.js',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { single: null, list: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--single' || a === '-s') {
      opts.single = args[++i] || null;
    } else if (a === '--list' || a === '-l') {
      opts.list = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (!opts.single && !a.startsWith('-')) {
      // 允许 `node scripts/run-verify.js tweets-bug-3` 简写
      opts.single = a;
    }
  }
  return opts;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/run-verify.js                       # 跑全部',
    '  node scripts/run-verify.js --single <name>       # 跑单个（name 可省略 verify- 前缀和 .js 后缀）',
    '  node scripts/run-verify.js <name>                # 简写',
    '  node scripts/run-verify.js --list                # 列出所有可用脚本',
    '',
    'Examples:',
    '  node scripts/run-verify.js tweets-bug-3',
    '  node scripts/run-verify.js --single verify-i18n',
    '  npm run verify:single -- tweets-bug-3',
    '',
    '为什么不用 jest？',
    '  本项目 verify 脚本是 grep 源码 + assert() + process.exit(0/1) 的纯静态扫描，',
    '  跑得快（不需要 jsdom）、零依赖、易于写"防 X 改版"类锁。',
    '  详见 docs/lessons-learned.md 第十节。',
  ].join('\n'));
}

function resolveScript(nameOrFile) {
  if (!nameOrFile) return null;
  // 直接给文件名
  if (fs.existsSync(path.join(SCRIPTS_DIR, nameOrFile))) {
    return nameOrFile;
  }
  // 补 verify- 前缀
  if (fs.existsSync(path.join(SCRIPTS_DIR, 'verify-' + nameOrFile + '.js'))) {
    return 'verify-' + nameOrFile + '.js';
  }
  // 补 .js 后缀
  if (fs.existsSync(path.join(SCRIPTS_DIR, nameOrFile + '.js'))) {
    return nameOrFile + '.js';
  }
  return null;
}

function runOne(scriptFile) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptFile);
  const start = Date.now();
  const result = spawnSync('node', [scriptPath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const ms = Date.now() - start;
  return {
    file: scriptFile,
    code: result.status === null ? 1 : result.status,
    ms,
  };
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    return 0;
  }

  if (opts.list) {
    console.log('Available scripts:');
    ALL_SCRIPTS.forEach((s) => console.log('  ' + s));
    return 0;
  }

  let scriptsToRun;
  if (opts.single) {
    const resolved = resolveScript(opts.single);
    if (!resolved) {
      console.error('Error: script not found: ' + opts.single);
      console.error('Run with --list to see available scripts.');
      return 1;
    }
    scriptsToRun = [resolved];
  } else {
    scriptsToRun = ALL_SCRIPTS;
  }

  console.log('Running ' + scriptsToRun.length + ' script(s):\n');

  const results = [];
  for (const f of scriptsToRun) {
    console.log('━━━ ' + f + ' ━━━');
    const r = runOne(f);
    results.push(r);
    console.log('  → exit ' + r.code + ' (' + r.ms + 'ms)\n');
  }

  // 汇总
  const passed = results.filter((r) => r.code === 0);
  const failed = results.filter((r) => r.code !== 0);
  console.log('━'.repeat(50));
  console.log('Summary: ' + passed.length + ' passed, ' + failed.length + ' failed (of ' + results.length + ')');
  if (failed.length > 0) {
    console.log('Failed:');
    failed.forEach((r) => console.log('  ✗ ' + r.file + ' (exit ' + r.code + ')'));
  }
  console.log('━'.repeat(50));

  return failed.length > 0 ? 1 : 0;
}

process.exit(main());
