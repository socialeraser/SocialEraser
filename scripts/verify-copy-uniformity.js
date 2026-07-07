// 回归检查：营销站"Free During Launch" / "Free forever" 统一为"Tip-Supported"
//
// 背景：2026-07-07 决定将 33 处不一致的"Free During Launch"/"Free forever"两种说法
// 统一为"Tip-Supported"框架（跟 business-model.md / ROADMAP.md / README.md 已有的
// "Tip-supported, never paywalled" 措辞 100% 对齐）。
//
// 原因：① "Free During Launch" 暗示"launch 之后会收费"→ 用户紧迫感/反感
//      ② "Free forever" 太绝对 → 未来加 opt-in subscription 时"打脸"风险
//      ③ 两种说法混用 → 内部不一致
//
// 方案 1（采用）：统一用 "Free · Tip-Supported" / "Tip-supported" / "Free, tip-supported"
//                 措辞不暗示过期、不绝对承诺、跟 tip model 一致
//
// 本脚本锁住不变量：
//   1. 全部 33 处统一改完，"Free During Launch"/"Free forever" 0 残留
//   2. 每个目标位置都出现新文案（"Tip-Supported" 或 "tip-supported"）
//   3. 营销站关键页面 section heading / FAQ 答案 / meta description 全部一致
//   4. 文档（business-model.md / README.md / llms.txt）也同步更新
//
// 豁免（不检查）：
//   - "Install Free" 按钮文字（描述从 Chrome 商店安装动作，不是"免费"声明）
//   - "Free from the Chrome Web Store"（同上）
//   - "Free for everyone" / "free tier"（中性描述，不是"免费"声明）
//   - "free" 单字（无 "during launch" / "forever" 修饰）
//   - 平台子页的 "Add to Chrome — Free" 按钮（按钮文字）
//
// 任一断言失败 → 退 1；CI 即挂。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MW = path.join(ROOT, 'packages/marketing-website');

const FORBIDDEN_PATTERNS = [
  /Free\s+During\s+Launch/gi,
  /Free\s+during\s+launch/gi,
  /free\s+during\s+launch/gi,
  /Free\s+forever/gi,
  /free\s+forever/gi,
];

// 豁免文件 — about.html 含 "Free should mean free" 项目原则宣示，非价格声明
const EXEMPT_FILES = new Set([
  path.join(MW, 'about.html'),
  path.join(MW, 'success.html'),
]);

const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fail.push({ name, detail });
}

// ---- 收集目标文件 ----
const allHtml = [
  path.join(MW, 'index.html'),
  path.join(MW, 'zh', 'index.html'),
  path.join(MW, 'ja', 'index.html'),
  path.join(MW, 'privacy.html'),
  path.join(MW, 'terms.html'),
  path.join(MW, 'support.html'),
  path.join(MW, 'help.html'),
  path.join(MW, 'platforms', 'x', 'index.html'),
  path.join(MW, 'platforms', 'tiktok', 'index.html'),
  path.join(MW, 'platforms', 'youtube', 'index.html'),
  path.join(MW, 'platforms', 'instagram', 'index.html'),
  path.join(MW, 'platforms', 'facebook', 'index.html'),
  path.join(MW, 'guides', 'twitter.html'),
  path.join(MW, 'guides', 'tiktok.html'),
];
const docFiles = [
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'docs', 'business-model.md'),
  path.join(MW, 'llms.txt'),
];
const allTargets = [...allHtml, ...docFiles].filter(f => fs.existsSync(f));

// ---- Section 1: 旧文案 0 残留 ----
let oldCopyCount = 0;
const oldCopyHits = [];
for (const f of allTargets) {
  if (EXEMPT_FILES.has(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const pat of FORBIDDEN_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(src)) !== null) {
      oldCopyCount++;
      const line = src.slice(0, m.index).split('\n').length;
      oldCopyHits.push(`${path.relative(ROOT, f)}:${line}  →  "${m[0]}"`);
    }
  }
}
check('营销站 + 文档 旧文案 0 残留（Free During Launch / Free forever）',
  oldCopyCount === 0,
  oldCopyHits.length ? oldCopyHits.slice(0, 5).join('\n  ') : '');

// ---- Section 2: 关键文件含新文案 ----
function hasAnyNewCopy(src) {
  return /Tip-Supported|tip-supported|Tip-supported/.test(src);
}

const newCopyExpected = [
  path.join(MW, 'index.html'),
  path.join(MW, 'zh', 'index.html'),
  path.join(MW, 'ja', 'index.html'),
  path.join(MW, 'support.html'),
  path.join(MW, 'terms.html'),
  path.join(MW, 'platforms', 'x', 'index.html'),
  path.join(MW, 'platforms', 'tiktok', 'index.html'),
  path.join(MW, 'platforms', 'youtube', 'index.html'),
  path.join(MW, 'platforms', 'instagram', 'index.html'),
  path.join(MW, 'platforms', 'facebook', 'index.html'),
  path.join(MW, 'guides', 'twitter.html'),
  path.join(MW, 'guides', 'tiktok.html'),
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'docs', 'business-model.md'),
  path.join(MW, 'llms.txt'),
];

for (const f of newCopyExpected) {
  if (!fs.existsSync(f)) {
    check(`${path.relative(ROOT, f)} 含新文案（Tip-Supported / tip-supported）`,
      false, '文件不存在');
    continue;
  }
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  check(`${rel} 含新文案（Tip-Supported / tip-supported）`,
    hasAnyNewCopy(src),
    '找不到 Tip-Supported / tip-supported 字符串');
}

// ---- Section 3: 关键位置精确文案锁定 ----
const platformNames = ['X', 'TikTok', 'YouTube', 'Instagram', 'Facebook'];
for (let i = 0; i < 5; i++) {
  const f = path.join(MW, 'platforms', platformNames[i].toLowerCase(), 'index.html');
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const expected = `SocialEraser for ${platformNames[i]} · Free · Tip-Supported`;
  check(`platforms/${platformNames[i].toLowerCase()}/index.html hero eyebrow 精确文案`,
    src.includes(expected),
    `期望含 "${expected}"`);
}

for (let i = 0; i < 5; i++) {
  const f = path.join(MW, 'platforms', platformNames[i].toLowerCase(), 'index.html');
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  check(`platforms/${platformNames[i].toLowerCase()}/index.html 底部 eyebrow 精确文案`,
    src.includes('Free · Tip-Supported · No Signup'),
    '期望含 "Free · Tip-Supported · No Signup"');
}

{
  const f = path.join(MW, 'index.html');
  if (fs.existsSync(f)) {
    const src = fs.readFileSync(f, 'utf8');
    check('index.html Support section heading 精确文案',
      src.includes('Free. Tip-supported. A tip jar is welcome, never required.'),
      '期望含精确 heading 字符串');
  }
}

{
  const f = path.join(MW, 'terms.html');
  if (fs.existsSync(f)) {
    const src = fs.readFileSync(f, 'utf8');
    check('terms.html §6 heading 精确文案',
      /6\.\s*Free,\s*Tip-Supported/.test(src),
      '期望 §6 heading 改为 "Free, Tip-Supported"');
  }
}

{
  const f = path.join(ROOT, 'docs', 'business-model.md');
  if (fs.existsSync(f)) {
    const src = fs.readFileSync(f, 'utf8');
    check('docs/business-model.md TL;DR 含 "tip-supported"',
      /tip-supported/i.test(src),
      'TL;DR 应明确说 tip-supported');
  }
}

// ---- 输出 ----
console.log('=== verify-copy-uniformity.js ===');
console.log('营销站"Free During Launch" / "Free forever" 统一为"Tip-Supported"框架守门\n');
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'}  ${c.name}${c.detail && !c.ok ? '\n      ' + c.detail : ''}`);
}
const passed = checks.filter(c => c.ok).length;
const failed = checks.length - passed;
console.log(`\n=== summary ===`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
console.log(`  checked: ${allTargets.length} files, ${checks.length} assertions`);
if (failed > 0) {
  console.log(`\nFAIL: ${failed} check(s) failed`);
  process.exit(1);
} else {
  console.log(`OK: 全部文案统一为 "Tip-Supported" 框架`);
  process.exit(0);
}
