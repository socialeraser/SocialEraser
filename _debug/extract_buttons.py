#!/usr/bin/env python3
import re
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    html = f.read()

# Find the 2nd Delete text occurrence (1st is "Delete post?" title)
delete_match = list(re.finditer(r'Delete(?![A-Za-z])', html))
print(f'Found {len(delete_match)} "Delete" matches')
print()

# Get position of the 2nd one (button text, not title)
# Actually, let me find the one that is the actual delete action button
# Strategy: find <button ...> that contains ">Delete</"
button_with_delete = re.compile(r'<button[^>]*>(?:(?!</button>).)*?>Delete<', re.DOTALL)
matches = list(button_with_delete.finditer(html))
print(f'Found {len(matches)} <button> elements containing ">Delete<"')
print()

for i, m in enumerate(matches):
    btn_start = m.start()
    # Find end of button
    depth = 0
    end = btn_start
    for mm in re.finditer(r'<(/?)button[^>]*>', html[btn_start:]):
        if mm.group(1) == '/':
            depth -= 1
            if depth == 0:
                end = btn_start + mm.end()
                break
        else:
            depth += 1

    btn_text = html[btn_start:end]
    # Get just the opening tag
    open_tag_end = btn_text.find('>') + 1
    open_tag = btn_text[:open_tag_end]

    # Get testid
    testid_m = re.search(r'data-testid="([^"]*)"', open_tag)
    testid = testid_m.group(1) if testid_m else 'NO_TESTID'

    print(f'--- Button #{i+1} ---')
    print(f'  testid: "{testid}"')
    print(f'  OPEN TAG: {open_tag}')
    print()

# Also find Cancel button
print('=' * 60)
print()
cancel_match = re.search(r'<button[^>]*>.*?>Cancel<.*?</button>', html, re.DOTALL)
if cancel_match:
    btn_start = cancel_match.start()
    end = cancel_match.end()
    btn_text = html[btn_start:end]
    open_tag_end = btn_text.find('>') + 1
    open_tag = btn_text[:open_tag_end]
    testid_m = re.search(r'data-testid="([^"]*)"', open_tag)
    testid = testid_m.group(1) if testid_m else 'NO_TESTID'
    print(f'--- Cancel button ---')
    print(f'  testid: "{testid}"')
    print(f'  OPEN TAG: {open_tag}')
