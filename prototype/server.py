"""Throwaway live-model bridge. Run: python3 prototype/server.py"""

import argparse
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", type=Path, default=ROOT / "model.PROTOTYPE.json")
    args = parser.parse_args()
    exploration_lock = Lock()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            route = self.path.split("?", 1)[0]
            if route not in ("/", "/model", "/exploration"):
                self.send_error(404)
                return
            try:
                source = {"/": ROOT / "index.html", "/model": args.model, "/exploration": ROOT / "exploration.PROTOTYPE.json"}[route]
                body = source.read_bytes()
            except OSError as error:
                self.send_error(503, str(error))
                return
            etag = '"' + hashlib.sha256(body).hexdigest() + '"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8" if route == "/" else "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("ETag", etag)
            self.end_headers()
            self.wfile.write(body)

        def do_PUT(self):
            if self.path != "/exploration":
                self.send_error(404)
                return
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                self.send_error(403)
                return
            try:
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 5_000_000:
                    raise ValueError("Invalid exploration size")
                state = json.loads(self.rfile.read(size))
                if state.get("version") != 2 or "revealed" in state:
                    raise ValueError("Reload the viewer: observation-based exploration is required")
                if not isinstance(state.get("observers"), list) or not isinstance(state.get("observations"), list) or not isinstance(state.get("revisions"), dict):
                    raise ValueError("Expected observers, observations and shared model revisions")
                body = (json.dumps(state, indent=2, allow_nan=False) + "\n").encode()
                target = ROOT / "exploration.PROTOTYPE.json"
                with exploration_lock:
                    current_etag = '"' + hashlib.sha256(target.read_bytes()).hexdigest() + '"'
                    if self.headers.get("If-Match") != current_etag:
                        self.send_error(412, "Exploration changed; reload its latest state before saving")
                        return
                    temporary = target.with_suffix(".tmp")
                    temporary.write_bytes(body)
                    temporary.replace(target)
            except (ValueError, TypeError, OSError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
            self.send_header("ETag", '"' + hashlib.sha256(body).hexdigest() + '"')
            self.end_headers()

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"RPGCAD prototype: http://127.0.0.1:{args.port}", flush=True)
    print(f"Agent-editable model: {args.model.resolve()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
