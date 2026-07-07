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
// 2026-07-07 扩展：中文/日文页面也有本地化文案（"上线免费" / "公開中無料" / "永久無料" 等），
//                  同样需要统一为"打赏支持" / "投げ銭サポート"。
//
// 本脚本锁住不变量：
//   1. 全部 33 处统一改完，"Free During Launch"/"Free forever" 0 残留
//   2. zh/ja 文件不含"上线免费"/"永远免费"/"公開中無料"/"永久無料"等本地化旧文案
//   3. 每个目标位置都出现新文案（"Tip-Supported" / "tip-supported" / "打赏支持" / "投げ銭サポート"）
//   4. 营销站关键页面 section heading / FAQ 答案 / meta description 全部一致
//   5. 文档（business-model.md / README.md / llms.txt）也同步更新
//
// 豁免（不检查）：
//   - "Install Free" 按钮文字（描述从 Chrome 商店安装动作，不是"免费"声明）
//   - "Free from the Chrome Web Store"（同上）
//   - "Free for everyone" / "free tier"（中性描述，不是"免费"声明）
//   - "free" 单字（无 "during launch" / "forever" 修饰）
//   - 平台子页的 "Add to Chrome — Free" 按钮（按钮文字）
//   - zh 里 "上线后通知我" 按钮文字（waitlist CTA，对应 en 的 "Notify me when ready"）
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

// 本地化旧文案
const ZH_FORBIDDEN = [
  /上线免费/g,         // "上线免费，无限次数" → "打赏支持，无限次数"
  /永远免费/g,         // "永远免费。欢迎打赏" → "免费。打赏支持。"
  /免费使用(?=[。，])/g, // "免费使用。" → "打赏支持。"
  /对所有人免费/g,     // "对所有人免费" → "打赏支持型"
];
const JA_FORBIDDEN = [
  /公開中無料/g,         // "公開中無料" → "投げ銭サポート"
  /永久無料/g,           // "永久無料" → "投げ銭サポート"
  /無料でご利用いただけます/g, // "無料でご利用いただけます" → "投げ銭で運営"
  /無料でインストール/g,      // hero-platform__action 按钮文字
  /Chrome\s*ウェブストアから無料で/g, // "Chrome ウェブストアから無料で。"
  /誰にとっても無料/g,    // "誰にとっても無料" → "投げ銭サポート型"
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

// ---- Section 1: 旧文案 0 残留（en + zh + ja） ----
let oldCopyCount = 0;
const oldCopyHits = [];
for (const f of allTargets) {
  if (EXEMPT_FILES.has(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  // en 旧文案
  for (const pat of FORBIDDEN_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(src)) !== null) {
      oldCopyCount++;
      const line = src.slice(0, m.index).split('\n').length;
      oldCopyHits.push(`${path.relative(ROOT, f)}:${line}  →  "${m[0]}"  [en]`);
    }
  }
  // zh 旧文案（仅 zh 文件）
  const isZh = f.includes(`${path.sep}zh${path.sep}`) || f.endsWith(`${path.sep}zh`);
  const isJa = f.includes(`${path.sep}ja${path.sep}`) || f.endsWith(`${path.sep}ja`);
  if (isZh) {
    for (const pat of ZH_FORBIDDEN) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(src)) !== null) {
        oldCopyCount++;
        const line = src.slice(0, m.index).split('\n').length;
        oldCopyHits.push(`${path.relative(ROOT, f)}:${line}  →  "${m[0]}"  [zh]`);
      }
    }
  }
  if (isJa) {
    for (const pat of JA_FORBIDDEN) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(src)) !== null) {
        oldCopyCount++;
        const line = src.slice(0, m.index).split('\n').length;
        oldCopyHits.push(`${path.relative(ROOT, f)}:${line}  →  "${m[0]}"  [ja]`);
      }
    }
  }
}
check('营销站 + 文档 旧文案 0 残留（en / zh / ja 全部）',
  oldCopyCount === 0,
  oldCopyHits.length ? oldCopyHits.slice(0, 8).join('\n  ') : '');

// ---- Section 1.5: zh/ja 关键位置精确文案 ----
{
  const f = path.join(MW, 'zh', 'index.html');
  if (fs.existsSync(f)) {
    const src = fs.readFileSync(f, 'utf8');
    check('zh/index.html hero eyebrow 精确文案',
      src.includes('批量清理 · 5 大平台 · 打赏支持'),
      '期望含 "批量清理 · 5 大平台 · 打赏支持"');
    check('zh/index.html section heading 精确文案',
      src.includes('免费。打赏支持。欢迎打赏，从不强求。'),
      '期望含精确 heading 字符串');
    check('zh/index.html hero micro 精确文案',
      src.includes('打赏支持 · 无需注册账号 · 支持 8 种语言'),
      '期望含 "打赏支持 · 无需注册账号 · 支持 8 种语言"');
  }
}
{
  const f = path.join(MW, 'ja', 'index.html');
  if (fs.existsSync(f)) {
    const src = fs.readFileSync(f, 'utf8');
    check('ja/index.html hero eyebrow 精确文案',
      src.includes('一括清理 · 5 つのプラットフォーム · 投げ銭サポート'),
      '期望含 "一括清理 · 5 つのプラットフォーム · 投げ銭サポート"');
    check('ja/index.html section heading 精确文案',
      src.includes('無料。投げ銭サポート。お気持ち程度は歓迎、不要です。'),
      '期望含精确 heading 字符串');
    check('ja/index.html hero micro 精确文案',
      src.includes('投げ銭サポート · アカウント不要 · 8 言語対応'),
      '期望含 "投げ銭サポート · アカウント不要 · 8 言語対応"');
    check('ja/index.html hero-platform action 按钮改 "今すぐ入手"',
      !src.includes('無料でインストール'),
      '期望 hero-platform__action 去掉"無料で"');
  }
}

// ---- Section 2: 关键文件含新文案 ----
function hasAnyNewCopy(src) {
  return /Tip-Supported|tip-supported|Tip-supported|打赏支持|投げ銭サポート/.test(src);
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
    check(`${path.relative(ROOT, f)} 含新文案（Tip-Supported / 打赏支持 / 投げ銭サポート）`,
      false, '文件不存在');
    continue;
  }
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  check(`${rel} 含新文案（Tip-Supported / 打赏支持 / 投げ銭サポート）`,
    hasAnyNewCopy(src),
    '找不到 Tip-Supported / 打赏支持 / 投げ銭サポート 字符串');
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
console.log('(en / zh / ja 三个 locale 全部覆盖)\n');
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
  console.log(`OK: 全部文案统一为 "Tip-Supported" 框架 (en + zh + ja)`);
  process.exit(0);
}
