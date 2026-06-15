#!/usr/bin/env python3
import re
import sys

path = sys.argv[1]
keyword = sys.argv[2]
before_window = int(sys.argv[3]) if len(sys.argv) > 3 else 800
after_window = int(sys.argv[4]) if len(sys.argv) > 4 else 100

with open(path, 'r') as f:
    html = f.read()

print(f'=== {path} (looking for "{keyword}", before={before_window}) ===')
print()

for m in re.finditer(keyword, html):
    pos = m.start()
    before = html[max(0, pos-before_window):pos]
    after = html[pos:pos+after_window]
    last_lt = before.rfind('<')
    if last_lt >= 0:
        tag = before[last_lt:]
    else:
        tag = before
    print(f'--- "{keyword}" at pos {pos} ---')
    print(f'  BEFORE TAG (last 800): ...{tag}')
    print(f'  AFTER: {after}')
    print()
