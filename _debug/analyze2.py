#!/usr/bin/env python3
import re
import sys

path = sys.argv[1]
keyword = sys.argv[2]
window = int(sys.argv[3]) if len(sys.argv) > 3 else 400

with open(path, 'r') as f:
    html = f.read()

print(f'=== {path} (looking for "{keyword}") ===')
print()

for m in re.finditer(keyword, html):
    pos = m.start()
    before = html[max(0, pos-window):pos]
    after = html[pos:pos+window]
    last_lt = before.rfind('<')
    if last_lt >= 0:
        tag = before[last_lt:]
    else:
        tag = before
    print(f'--- "{keyword}" at pos {pos} ---')
    print(f'  TAG: {tag}')
    print(f'  AFTER: {after[:150]}')
    print()
