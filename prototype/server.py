"""Throwaway live-model bridge. Run: uv run python prototype/server.py"""

import argparse
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", type=Path, default=ROOT / "model.PROTOTYPE.json")
    args = parser.parse_args()
    exploration_lock = Lock()
    models = {"": args.model}
    plan_file = ROOT / "plan.PROTOTYPE.json"
    if plan_file.exists():
        for level in json.loads(plan_file.read_text())["levels"]:
            models[level["id"]] = ROOT / level["model"]

    empty_exploration = (
        json.dumps(
            {
                "version": 2,
                "observers": [],
                "observations": [],
                "revisions": {},
                "doors": {},
                "visibilityPaused": True,
            },
            indent=2,
        )
        + "\n"
    ).encode()

    def exploration_path(model):
        if model.resolve() == args.model.resolve():
            return ROOT / "exploration.PROTOTYPE.json"
        return model.with_name(model.stem + ".exploration.json")

    def exploration_bytes(target):
        return target.read_bytes() if target.exists() else empty_exploration

    class Handler(BaseHTTPRequestHandler):
        def selected_model(self):
            level = parse_qs(urlsplit(self.path).query).get("level", [""])[0]
            model = models.get(level)
            if model is None:
                self.send_error(404, "Unknown level")
            return model

        def do_GET(self):
            route = self.path.split("?", 1)[0]
            if route not in ("/", "/model", "/exploration", "/app.js", "/geometry.js"):
                self.send_error(404)
                return
            try:
                model = self.selected_model()
                if model is None:
                    return
                source = {
                    "/": ROOT / "index.html",
                    "/app.js": ROOT / "app.js",
                    "/geometry.js": ROOT / "geometry.js",
                    "/model": model,
                    "/exploration": exploration_path(model),
                }[route]
                body = (
                    exploration_bytes(source)
                    if route == "/exploration"
                    else source.read_bytes()
                )
            except OSError as error:
                self.send_error(503, str(error))
                return
            etag = '"' + hashlib.sha256(body).hexdigest() + '"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header(
                "Content-Type",
                (
                    "text/javascript; charset=utf-8"
                    if route.endswith(".js")
                    else "text/html; charset=utf-8"
                    if route == "/"
                    else "application/json"
                ),
            )
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("ETag", etag)
            self.end_headers()
            self.wfile.write(body)

        def do_PUT(self):
            if urlsplit(self.path).path != "/exploration":
                self.send_error(404)
                return
            model = self.selected_model()
            if model is None:
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
                    raise ValueError(
                        "Reload the viewer: observation-based exploration is required"
                    )
                if (
                    not isinstance(state.get("observers"), list)
                    or not isinstance(state.get("observations"), list)
                    or not isinstance(state.get("revisions"), dict)
                ):
                    raise ValueError(
                        "Expected observers, observations and shared model revisions"
                    )
                body = (json.dumps(state, indent=2, allow_nan=False) + "\n").encode()
                target = exploration_path(model)
                with exploration_lock:
                    current_etag = (
                        '"'
                        + hashlib.sha256(exploration_bytes(target)).hexdigest()
                        + '"'
                    )
                    if self.headers.get("If-Match") != current_etag:
                        self.send_error(
                            412,
                            "Exploration changed; reload before saving",
                        )
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

        def log_message(self, format: str, *args: object) -> None:
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
