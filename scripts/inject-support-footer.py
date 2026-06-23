#!/usr/bin/env python3
"""Batch insert Support link into Product footer of marketing pages."""
import re
import sys
from pathlib import Path

ROOT = Path("/Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website")
# Files where Support is already inserted manually
SKIP = {"support.html", "success.html"}

TARGETS = [
    "index.html",
    "zh/index.html",
    "ja/index.html",
    "about.html",
    "help.html",
    "privacy.html",
    "terms.html",
    "platforms/x/index.html",
    "platforms/tiktok/index.html",
    "platforms/instagram/index.html",
    "platforms/facebook/index.html",
    "platforms/youtube/index.html",
]

# Match any leading whitespace + the Source Code <li>
PATTERN = re.compile(
    r'^(\s*)<li><a href="https://github\.com/socialeraser/SocialEraser">Source Code</a></li>\s*$',
    re.MULTILINE,
)

SUPPORT_LINK = '<li><a href="/support.html">☕ Support</a></li>'

changed = 0
skipped = 0
missing = []

for rel in TARGETS:
    path = ROOT / rel
    if not path.exists():
        missing.append(rel)
        continue
    text = path.read_text(encoding="utf-8")

    def repl(m):
        indent = m.group(1)
        return f"{indent}{SUPPORT_LINK}\n{indent}{m.group(0).lstrip()}"

    new_text, n = PATTERN.subn(repl, text)
    if n == 0:
        skipped += 1
        print(f"  [SKIP] {rel}: no Source Code match found")
    elif n > 1:
        # Should never happen — only one Source Code per file
        print(f"  [WARN] {rel}: matched {n} times, expected 1")
    else:
        path.write_text(new_text, encoding="utf-8")
        changed += 1
        print(f"  [OK]   {rel}")

print(f"\nChanged: {changed}  Skipped: {skipped}  Missing: {len(missing)}")
if missing:
    for m in missing:
        print(f"  ! {m}")
    sys.exit(1)
