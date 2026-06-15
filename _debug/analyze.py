#!/usr/bin/env python3
import re
import sys

path = sys.argv[1]
keyword = sys.argv[2]  # 'Delete' or 'Undo repost' or 'Undo'

with open(path, 'r') as f:
    html = f.read()

# Find all menuitem start tags (including any other tag attributes)
# Use a flexible regex
menuitem_pattern = re.compile(r'role="menuitem"[^>]{0,500}>')
menuitems = []
for m in menuitem_pattern.finditer(html):
    # Find the start of the < tag
    start = m.start()
    # Walk back to find < tag start
    while start > 0 and html[start] != '<':
        start -= 1
    # Extract full opening tag (may span > 200 chars)
    end = m.end()
    tag = html[start:end]
    # Check testid
    testid_m = re.search(r'data-testid="([^"]*)"', tag)
    testid = testid_m.group(1) if testid_m else 'NO_TESTID'
    # Get just the role attr and class
    menuitems.append((start, end, testid, tag[:300]))

print(f'=== {path} ===')
print(f'Total menuitems: {len(menuitems)}')
print()

# Find keyword positions
kw_pattern = re.compile(r'>' + re.escape(keyword) + r'<')
kw_positions = [m.start() for m in kw_pattern.finditer(html)]
print(f'Total "{keyword}" text: {len(kw_positions)}')
print()

# For each keyword, find the containing menuitem
for ki, kp in enumerate(kw_positions):
    containing = None
    for mi, (ms, me, tid, tag) in enumerate(menuitems):
        if ms < kp:
            containing = (mi, ms, me, tid, tag)
        else:
            break
    if containing:
        mi, ms, me, tid, tag = containing
        print(f'--- "{keyword}" #{ki+1} at pos {kp} ---')
        print(f'  menuitem #{mi+1}, testid="{tid}"')
        # Show the tag
        print(f'  TAG: {tag[:250]}')
        print()
    else:
        print(f'--- "{keyword}" #{ki+1} at pos {kp}: NOT inside any menuitem ---')
