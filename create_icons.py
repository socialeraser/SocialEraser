#!/usr/bin/env python3
"""
Create icon files for X-Eraser app.
Generates trash can icons in 16x16, 48x48, and 128x128 sizes.
"""

import struct
import zlib
import os

def create_minimal_png(size, filename):
    """Create minimal valid orange PNG without PIL."""
    width, height = size, size
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter byte
        for x in range(width):
            raw_data += b'\xf5\x9e\x0b'  # RGB orange
    
    def png_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = zlib.crc32(chunk) & 0xffffffff
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)
    
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', ihdr_data)
    png += png_chunk(b'IDAT', zlib.compress(raw_data))
    png += png_chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(png)
    print(f'Created {filename} (minimal)')


def create_icon_with_pil(size, filename):
    """Create a trash can icon using PIL at the specified size."""
    from PIL import Image, ImageDraw
    
    # Create image with amber background
    img = Image.new('RGBA', (size, size), (245, 158, 11, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw trash can shape
    margin = size // 8
    w = size - margin * 2
    h = size - margin * 2
    
    # Can body
    draw.rectangle([margin + w//6, h//3, margin + w - w//6, h - margin], fill=(9, 9, 11, 255))
    
    # Lid
    draw.rectangle([margin, h//4, margin + w, h//3 + h//10], fill=(9, 9, 11, 255))
    
    # Handle
    handle_w = w // 3
    draw.rectangle([margin + w//2 - handle_w//2, margin, margin + w//2 + handle_w//2, h//4], fill=(9, 9, 11, 255))
    
    # Lines on can
    line_y1 = h//2
    line_y2 = h - h//4
    draw.line([margin + w//4, line_y1, margin + w - w//4, line_y1], fill=(245, 158, 11, 255), width=max(1, size//32))
    draw.line([margin + w//4, line_y2, margin + w - w//4, line_y2], fill=(245, 158, 11, 255), width=max(1, size//32))
    
    img.save(filename)
    print(f'Created {filename}')


if __name__ == '__main__':
    try:
        create_icon_with_pil(16, 'icon16.png')
        create_icon_with_pil(48, 'icon48.png')
        create_icon_with_pil(128, 'icon128.png')
    except ImportError:
        print('PIL not available, creating minimal PNGs...')
        create_minimal_png(16, 'icon16.png')
        create_minimal_png(48, 'icon48.png')
        create_minimal_png(128, 'icon128.png')