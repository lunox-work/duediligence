# The contract: spec.md, and the TypeScript types of the JSON bodies in tests/public/contract.ts.
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def answer(self):
        self.send_response(501)
        self.send_header("content-length", "0")
        self.end_headers()

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = answer

    def log_message(self, *_):
        pass


ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), int(os.environ["PORT"])), Handler).serve_forever()
