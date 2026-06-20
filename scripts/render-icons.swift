#!/usr/bin/env swift
import Cocoa

let emoji = "🗑️"
let chromeDir = "/Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/icons"

// Matches .btn-primary in platforms/x-project/src/sidepanel.html (linear-gradient
// 135deg #f59e0b → #d97706); we use the lighter end of the gradient as the
// solid background so toolbar icons read at small sizes.
let backgroundColor = NSColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1.0)

// iOS-style app icon: 22% corner radius, 14% inner padding so the emoji
// floats with breathing room.
let cornerRatio: CGFloat = 0.22
let paddingRatio: CGFloat = 0.14

let androidBuckets: [(String, Int)] = [
    ("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)
]
let androidBase = "/Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/android/app/src/main/res"

// AppleColorEmoji is a fixed-size bitmap font: it renders at native sizes of
// 16/20/24/32/40/48/64 px regardless of the requested point size, but
// .size() on the attributed string returns the nominal (requested) size, not
// the actual glyph extent. So we render at 64pt once and use the natural
// glyph size of 64x64 as the source for all downscales.
let nativeSize = 64

func renderNativeEmoji() -> NSImage? {
    let desc = NSFontDescriptor(name: "AppleColorEmoji", size: CGFloat(nativeSize))
    guard let font = NSFont(descriptor: desc, size: CGFloat(nativeSize)) else {
        print("  ! AppleColorEmoji font unavailable"); return nil
    }
    let attr = NSAttributedString(string: emoji, attributes: [
        .font: font,
        .foregroundColor: NSColor.black
    ])
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: nativeSize, pixelsHigh: nativeSize,
        bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.clear.set()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: nativeSize, height: nativeSize)).fill()
    let ts = attr.size()
    let x = (CGFloat(nativeSize) - ts.width) / 2
    let y = (CGFloat(nativeSize) - ts.height) / 2
    attr.draw(at: NSPoint(x: x, y: y))
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { return nil }
    return NSImage(data: png)
}

// Composite the source emoji onto a colored rounded-square background.
// Pass backgroundColor = nil to keep a transparent background (used for
// Android adaptive-icon foregrounds, which get their background from
// @color/ic_launcher_background).
func renderIcon(source: NSImage, size: Int,
                backgroundColor: NSColor?,
                cornerRatio: CGFloat, paddingRatio: CGFloat) -> Data? {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // Background (clipped to rounded rect)
    if let bg = backgroundColor {
        let radius = CGFloat(size) * cornerRatio
        let path = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: size, height: size),
                                xRadius: radius, yRadius: radius)
        path.addClip()
        bg.set()
        NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()
    }

    // Emoji: scale 64x64 source into a centered square with padding.
    let inner = CGFloat(size) * (1 - 2 * paddingRatio)
    let offset = (CGFloat(size) - inner) / 2
    source.draw(
        in: NSRect(x: offset, y: offset, width: inner, height: inner),
        from: NSRect(x: 0, y: 0, width: nativeSize, height: nativeSize),
        operation: .sourceOver, fraction: 1.0
    )

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])
}

guard let source = renderNativeEmoji() else {
    print("Failed to render native emoji."); exit(1)
}
print("Source 64x64 emoji rendered. Background: #f59e0b (amber-500).")

print("\n== Chrome extension (yellow rounded bg) ==")
for size in [16, 48, 128] {
    // At 16px the rounded corners are basically invisible; skip them.
    let cr = size >= 48 ? cornerRatio : 0
    guard let png = renderIcon(
        source: source, size: size,
        backgroundColor: backgroundColor,
        cornerRatio: cr, paddingRatio: paddingRatio
    ) else { print("  ! failed \(size)"); continue }
    let path = "\(chromeDir)/icon\(size).png"
    try? png.write(to: URL(fileURLWithPath: path))
    print("  ✓ \(path) (\(png.count) bytes)")
}

print("\n== Android legacy icons (yellow rounded bg) ==")
for (bucket, side) in androidBuckets {
    for variant in ["ic_launcher", "ic_launcher_round"] {
        // Round variant: fill full square; the system clips it to a circle
        // when the device launcher supports round icons. So we draw a full
        // square background (no rounded corners) to avoid the yellow ring
        // artifact on adaptive-icon-capable devices.
        let cr = variant == "ic_launcher" ? cornerRatio : 0
        guard let png = renderIcon(
            source: source, size: side,
            backgroundColor: backgroundColor,
            cornerRatio: cr, paddingRatio: paddingRatio
        ) else { continue }
        let path = "\(androidBase)/mipmap-\(bucket)/\(variant).png"
        try? png.write(to: URL(fileURLWithPath: path))
        print("  ✓ \(path) (\(png.count) bytes)")
    }
}

print("\n== Android adaptive foreground (transparent bg, ~66% safe zone) ==")
// Adaptive-icon foregrounds must be 108dp (or 432px at xxxhdpi) with the
// emoji inside the central 72dp safe zone (so we use paddingRatio 0.33).
// Background comes from values/ic_launcher_background.xml (#f59e0b).
for (bucket, side) in androidBuckets {
    let fgSide = side * 108 / 48
    guard let png = renderIcon(
        source: source, size: fgSide,
        backgroundColor: nil,
        cornerRatio: 0, paddingRatio: 0.33
    ) else { continue }
    let path = "\(androidBase)/mipmap-\(bucket)/ic_launcher_foreground.png"
    try? png.write(to: URL(fileURLWithPath: path))
    print("  ✓ \(path) (\(png.count) bytes)")
}

print("\nDone.")
