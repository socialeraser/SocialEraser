#!/usr/bin/env python3
import re
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    html = f.read()

# Find the "Delete" text that's inside a button (the actual delete button, not the title)
# Strategy: find the 2nd "Delete" occurrence (1st is "Delete post?" title, 2nd is button text)
delete_positions = [m.start() for m in re.finditer(r'>Delete<', html)]
print(f'Found {len(delete_positions)} occurrences of ">Delete<"')
print()

# Show the full tag structure around the 2nd Delete (button text)
if len(delete_positions) >= 2:
    pos = delete_positions[1]
    # Walk back to find the most recent <button ...> open tag
    # Look for the closest <button that contains this position
    button_pattern = re.compile(r'<button[^>]*>')
    buttons_before = [(m.start(), m.end()) for m in button_pattern.finditer(html[:pos])]
    if buttons_before:
        btn_start, btn_end = buttons_before[-1]
        # Now find the matching </button> by counting
        depth = 0
        i = btn_start
        # Find matching close
        open_count = 0
        for mm in re.finditer(r'<(/?)button[^>]*>', html[btn_start:]):
            if mm.group(1) == '/':
                open_count -= 1
                if open_count == 0:
                    end_pos = btn_start + mm.end()
                    break
            else:
                open_count += 1
        else:
            end_pos = pos + 100
        # Get the full button
        btn_text = html[btn_start:min(end_pos, pos+200)]
        print(f'--- Delete button (pos {pos}) ---')
        print(f'Button start: {btn_start}, end: {end_pos}')
        print(f'BUTTON TAG: {html[btn_start:btn_end]}')
        print()
        # Also show 50 chars of context after
        print(f'CONTEXT AFTER: {html[pos:pos+50]}')

# Also look for Cancel button
print()
print('=' * 50)
print()
cancel_positions = [m.start() for m in re.finditer(r'>Cancel<', html)]
print(f'Found {len(cancel_positions)} occurrences of ">Cancel<"')

if cancel_positions:
    pos = cancel_positions[0]
    button_pattern = re.compile(r'<button[^>]*>')
    buttons_before = [(m.start(), m.end()) for m in button_pattern.finditer(html[:pos])]
    if buttons_before:
        btn_start, btn_end = buttons_before[-1]
        print(f'--- Cancel button (pos {pos}) ---')
        print(f'BUTTON TAG: {html[btn_start:btn_end]}')
