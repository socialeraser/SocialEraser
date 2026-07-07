#!/usr/bin/env python3
"""Generate expanded sitemap.xml with 136 URLs (8 langs × all page types)."""
import os
from datetime import date

ROOT = "/Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website"
BASE = "https://socialeraser.app"
TODAY = "2026-07-07"

# Per-page priority scheme (existing en sitemap is the reference)
# 1.0  = en homepage
# 0.9  = en platform subpages
# 0.8  = non-en homepages + all guide pages
# 0.7  = support
# 0.5  = help + about
# 0.3  = privacy + terms
# 0.2  = success

LANG_PREFIXES = [
    ("",     0),  # en (root)
    ("zh/",  1),
    ("ja/",  1),
    ("es/",  1),
    ("fr/",  1),
    ("de/",  1),
    ("pt/",  1),
    ("ko/",  1),
]

PLATFORMS = ["x", "tiktok", "youtube", "instagram", "facebook"]
GUIDES = ["twitter", "tiktok", "youtube", "instagram", "facebook"]
CONTENT = [
    ("about",    0.5, "monthly"),
    ("help",     0.5, "monthly"),
    ("support",  0.7, "monthly"),
    ("terms",    0.3, "monthly"),
    ("privacy",  0.3, "monthly"),
    ("success",  0.2, "yearly"),
]


def url_block(loc, priority, changefreq, lastmod=TODAY, image=None):
    parts = ["  <url>"]
    parts.append(f"    <loc>{loc}</loc>")
    parts.append(f"    <lastmod>{lastmod}</lastmod>")
    parts.append(f"    <changefreq>{changefreq}</changefreq>")
    parts.append(f"    <priority>{priority}</priority>")
    if image:
        parts.append("    <image:image>")
        parts.append(f"      <image:loc>{image['loc']}</image:loc>")
        parts.append(f"      <image:title>{image['title']}</image:title>")
        parts.append(f"      <image:caption>{image['caption']}</image:caption>")
        parts.append("    </image:image>")
    parts.append("  </url>")
    return "\n".join(parts)


def build():
    blocks = []
    blocks.append('<?xml version="1.0" encoding="UTF-8"?>')
    blocks.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    blocks.append('        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">')

    # 1) Homepages (8)
    home_images = {
        "en": {
            "loc": f"{BASE}/assets/icons/og-home.png",
            "title": "SocialEraser — Bulk Delete for X, TikTok, YouTube, Instagram &amp; Facebook",
            "caption": "Bulk delete posts, likes, follows, and saved items on 5 social platforms. 100% local, no password."
        }
    }
    for prefix, _ in LANG_PREFIXES:
        if prefix == "":
            loc = f"{BASE}/"
            priority = 1.0
            image = home_images["en"]
        else:
            loc = f"{BASE}/{prefix}"
            priority = 0.8
            image = None
        blocks.append(url_block(loc, priority, "weekly", image=image))

    # 2) Platform subpages (8 langs × 5 = 40)
    for prefix, _ in LANG_PREFIXES:
        for plat in PLATFORMS:
            if prefix == "":
                loc = f"{BASE}/platforms/{plat}/"
            else:
                loc = f"{BASE}/{prefix}platforms/{plat}/"
            priority = 0.9 if prefix == "" else 0.8
            image = None
            if prefix == "" and plat == "x":
                image = {
                    "loc": f"{BASE}/assets/icons/og-x.png",
                    "title": "SocialEraser for X — Bulk Delete Tweets, Likes &amp; Bookmarks",
                    "caption": "Free Chrome extension to bulk delete tweets, retweets, likes, bookmarks, and unfollow on X. 100% local."
                }
            elif prefix == "" and plat == "tiktok":
                image = {
                    "loc": f"{BASE}/assets/icons/og-tiktok.png",
                    "title": "SocialEraser for TikTok — Bulk Delete Videos, Reposts &amp; Likes",
                    "caption": "Free Chrome extension to bulk delete TikTok videos, reposts, likes, favorites, and unfollow. 100% local."
                }
            blocks.append(url_block(loc, priority, "weekly", image=image))

    # 3) Guide pages (8 langs × 5 = 40)
    for prefix, _ in LANG_PREFIXES:
        for guide in GUIDES:
            if prefix == "":
                loc = f"{BASE}/guides/{guide}.html"
            else:
                loc = f"{BASE}/{prefix}guides/{guide}.html"
            priority = 0.8
            blocks.append(url_block(loc, priority, "monthly"))

    # 4) Content pages (8 langs × 6 = 48)
    for prefix, _ in LANG_PREFIXES:
        for name, priority, freq in CONTENT:
            if prefix == "":
                loc = f"{BASE}/{name}.html"
            else:
                loc = f"{BASE}/{prefix}{name}.html"
            blocks.append(url_block(loc, priority, freq))

    blocks.append("</urlset>")
    return "\n".join(blocks) + "\n"


if __name__ == "__main__":
    out = os.path.join(ROOT, "sitemap.xml")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build())
    # Count
    count = build().count("<url>")
    print(f"Wrote {out} with {count} <url> blocks")
