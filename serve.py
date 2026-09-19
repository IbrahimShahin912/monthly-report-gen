"""Static server for the report pages that tells the browser never to cache files,
so edits to app.js / styles.css show up on a normal reload.

    python serve.py          (http://localhost:5173)
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"Serving on http://localhost:{port}")
    server.serve_forever()
