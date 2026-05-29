#!/usr/bin/env python3
"""
CinePop local server.

Serves the static app files and proxies IMDb's suggestion endpoint at
`/api/imdb/<letter>/<query>.json` so the browser doesn't hit CORS issues.

  ./server.py            # http://127.0.0.1:8080
  PORT=3000 ./server.py  # http://127.0.0.1:3000
"""
import os
import sys
import json
import urllib.parse
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "127.0.0.1")
ROOT = os.path.dirname(os.path.abspath(__file__))

IMDB_HOST = "https://v3.sg.media-imdb.com"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)


class Handler(SimpleHTTPRequestHandler):
    # Serve files from this script's directory
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        # Compact log line
        sys.stderr.write(f"  {self.address_string()} - {fmt % args}\n")

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        # Proxy IMDb suggestion endpoint
        if self.path.startswith("/api/imdb/"):
            return self._proxy_imdb()
        return super().do_GET()

    def _proxy_imdb(self):
        # /api/imdb/<letter>/<query>.json  ->  IMDB_HOST/suggestion/<letter>/<query>.json
        suffix = self.path[len("/api/imdb/"):]
        # Strip any querystring (we don't need it)
        suffix = suffix.split("?", 1)[0]
        # Light sanitization: only allow [a-zA-Z0-9._%-/+ ] in path
        safe = "".join(c for c in suffix if c.isalnum() or c in "._%-/+ ")
        url = f"{IMDB_HOST}/suggestion/{safe}"

        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=8) as upstream:
                body = upstream.read()
                ctype = upstream.headers.get("Content-Type", "application/json")
                self.send_response(upstream.status)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self._send_cors()
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
        except Exception as e:  # network, timeout, etc.
            self.send_response(502)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())


def main():
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    bar = "─" * 46
    print(bar)
    print("  CinePop")
    print(f"  Serving:  {ROOT}")
    print(f"  Open:     {url}")
    print(f"  Proxy:    /api/imdb/* -> {IMDB_HOST}/suggestion/*")
    print( "  Stop:     Ctrl+C")
    print(bar)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  bye.")
        httpd.server_close()


if __name__ == "__main__":
    main()
