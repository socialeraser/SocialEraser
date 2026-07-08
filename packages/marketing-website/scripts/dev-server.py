#!/usr/bin/env python3
"""Local dev server that mirrors Cloudflare Pages' clean-URL + 404.html behaviour.

The marketing site uses /path URLs everywhere (no .html suffix). On
Cloudflare Pages, /guides/twitter serves /guides/twitter.html, /404 returns
404.html, etc. The default `python3 -m http.server` doesn't do that — bare
paths return 404 and the server renders its own 404 page instead of ours.
That mismatch made the local dev preview lie about which paths actually
work in production.

This handler implements the same lookup rules as Cloudflare Pages for a
static site:

  1. /foo           → /foo.html if it exists
  2. /foo/          → /foo/index.html if it exists
  3. /foo.html      → /foo.html (direct)
  4. /assets/* and other static files served verbatim
  5. Anything else  → 404.html with HTTP 404

The redirect-style rules in _redirects are intentionally NOT honoured here.
They're already deployed at the edge, and the canonical URLs are the bare
path form, so testing with `_redirects` would mask bugs that only surface
when the rewrite path is missing.
"""
import os
import sys
import posixpath
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class CleanUrlHandler(SimpleHTTPRequestHandler):
    """Same handler surface as SimpleHTTPRequestHandler, but resolves
    /path → /path.html / index.html, and 404s via 404.html."""

    def translate_path(self, path: str) -> str:
        # Strip query string for filesystem lookup
        path = path.split("?", 1)[0].split("#", 1)[0]
        # %-decode and strip leading slashes
        path = unquote(path)
        path = path.lstrip("/")
        candidate = os.path.normpath(os.path.join(ROOT, path))
        # Block path traversal
        if not candidate.startswith(ROOT):
            return ""
        return candidate

    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        path = unquote(path).lstrip("/")

        # 1. Direct file — /assets/foo.css, /foo.html, /sitemap.xml, etc.
        direct = os.path.join(ROOT, path)
        if path and os.path.isfile(direct):
            return super().send_head()

        # 2. Clean URL: /foo → /foo.html
        if path and not path.endswith("/"):
            html = direct + ".html"
            if os.path.isfile(html):
                # Rewrite self.path so SimpleHTTPRequestHandler reads from .html
                self.path = "/" + path + ".html"
                return super().send_head()

        # 3. Directory index: /foo/ → /foo/index.html
        if path.endswith("/") or path == "":
            idx = os.path.join(direct, "index.html")
            if os.path.isfile(idx):
                target = path if path.endswith("/") else path + "/"
                self.path = "/" + target + "index.html"
                return super().send_head()

        # 4. Directory without trailing slash — try /foo/index.html by appending /
        if path and os.path.isdir(direct) and not path.endswith("/"):
            idx = os.path.join(direct, "index.html")
            if os.path.isfile(idx):
                # 308 (permanent) so clients update bookmarks; matches the
                # canonical /foo/ URL in hreflang / sitemap.
                self.send_response(308)
                self.send_header("Location", "/" + path + "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None

        # 5. Fallback — serve 404.html with HTTP 404
        not_found = os.path.join(ROOT, "404.html")
        if os.path.isfile(not_found):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            with open(not_found, "rb") as f:
                fs = os.fstat(f.fileno())
                self.send_header("Content-Length", str(fs.st_size))
                self.end_headers()
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"404 Not Found")
        return None

    def log_message(self, format, *args):  # noqa: A002
        sys.stderr.write("%s - - [%s] %s\n" % (
            self.address_string(), self.log_date_time_string(), format % args
        ))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(ROOT)
    server = HTTPServer(("127.0.0.1", port), CleanUrlHandler)
    print(f"dev-server: serving {ROOT} on http://127.0.0.1:{port}/ (clean URLs + 404.html)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
