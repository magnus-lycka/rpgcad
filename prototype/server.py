"""Throwaway live-model bridge. Run: uv run python prototype/server.py"""

import argparse
import hashlib
import json
import math
from datetime import UTC, datetime
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

    character_file = ROOT / "characters.PROTOTYPE.json"
    empty_characters = b'{"characters": [], "pov": null}\n'

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

    def sketch_path(model):
        return model.with_name(model.stem + ".sketch.PROTOTYPE.json")

    class Handler(BaseHTTPRequestHandler):
        def selected_model(self):
            level = parse_qs(urlsplit(self.path).query).get("level", [""])[0]
            model = models.get(level)
            if model is None:
                self.send_error(404, "Unknown level")
            return model

        def do_GET(self):
            route = self.path.split("?", 1)[0]
            if route not in (
                "/",
                "/model",
                "/exploration",
                "/sketch",
                "/characters",
                "/plan",
                "/app.js",
                "/geometry.js",
            ):
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
                    "/sketch": sketch_path(model),
                    "/characters": character_file,
                    "/plan": plan_file,
                }[route]
                body = (
                    (source.read_bytes() if source.exists() else empty_characters)
                    if route == "/characters"
                    else json.dumps(
                        {
                            "levels": [
                                {"id": key or "original", "name": key or "Ground"}
                                for key in models
                                if key != "original"
                            ]
                        }
                    ).encode()
                    if route == "/plan"
                    else exploration_bytes(source)
                    if route == "/exploration"
                    else b"null"
                    if route == "/sketch" and not source.exists()
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
            if urlsplit(self.path).path == "/characters":
                self.save_characters()
                return
            if urlsplit(self.path).path == "/sketch":
                self.save_sketch()
                return
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

        def save_characters(self):
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                self.send_error(403)
                return
            try:
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 1_000_000:
                    raise ValueError("Invalid character state size")
                state = json.loads(self.rfile.read(size))
                characters = state.get("characters")
                if not isinstance(characters, list):
                    raise ValueError("Expected characters")
                ids = set()
                for character in characters:
                    cid = character.get("id")
                    at = character.get("at")
                    if (
                        not isinstance(cid, str)
                        or not cid
                        or cid in ids
                        or not isinstance(character.get("name"), str)
                        or not character["name"].strip()
                        or character.get("kind") not in ("pc", "npc")
                        or character.get("level") not in {*models, "original"}
                        or not isinstance(at, list)
                        or len(at) != 2
                        or not all(
                            isinstance(n, (float, int)) and math.isfinite(n) for n in at
                        )
                        or not isinstance(character.get("range"), (float, int))
                        or not math.isfinite(character["range"])
                        or character["range"] <= 0
                    ):
                        raise ValueError("Invalid character")
                    ids.add(cid)
                if state.get("pov") is not None and not any(
                    c["id"] == state["pov"] and c["kind"] == "pc" for c in characters
                ):
                    raise ValueError("POV must be a PC")
                body = (json.dumps(state, indent=2, allow_nan=False) + "\n").encode()
                with exploration_lock:
                    previous = (
                        character_file.read_bytes()
                        if character_file.exists()
                        else empty_characters
                    )
                    if (
                        self.headers.get("If-Match")
                        != '"' + hashlib.sha256(previous).hexdigest() + '"'
                    ):
                        self.send_error(412, "Characters changed; reload before saving")
                        return
                    temporary = character_file.with_suffix(".tmp")
                    temporary.write_bytes(body)
                    temporary.replace(character_file)
            except (ValueError, TypeError, OSError, AttributeError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
            self.send_header("ETag", '"' + hashlib.sha256(body).hexdigest() + '"')
            self.end_headers()

        def save_sketch(self):
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
                    raise ValueError("Invalid sketch size")
                sketch = json.loads(self.rfile.read(size))
                strokes = sketch.get("strokes")
                if not isinstance(strokes, list):
                    raise ValueError("Expected pen strokes")
                for stroke in strokes:
                    if not isinstance(stroke, list) or not stroke:
                        raise ValueError("Empty stroke")
                    for point in stroke:
                        if (
                            not isinstance(point, list)
                            or len(point) != 2
                            or not all(
                                isinstance(v, (int, float)) and math.isfinite(v)
                                for v in point
                            )
                        ):
                            raise ValueError(
                                "Stroke points must be finite model coordinates"
                            )
                sketch["level"] = parse_qs(urlsplit(self.path).query).get(
                    "level", [""]
                )[0]
                sketch["submittedAt"] = datetime.now(UTC).isoformat()
                sketch["status"] = "pending"
                sketch["model"] = json.loads(model.read_bytes())
                body = json.dumps(sketch, indent=2, allow_nan=False) + "\n"
                target = sketch_path(model)
                with exploration_lock:
                    temporary = target.with_suffix(".tmp")
                    temporary.write_text(body)
                    temporary.replace(target)
            except (ValueError, TypeError, AttributeError, OSError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
            self.send_header("X-Sketch-Id", sketch["submittedAt"])
            self.end_headers()

        def do_PATCH(self):
            if urlsplit(self.path).path != "/sketch":
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
                if not 0 < size <= 10_000:
                    raise ValueError("Invalid acknowledgement size")
                update = json.loads(self.rfile.read(size))
                if update.get("status") not in ("working", "applied", "question"):
                    raise ValueError("Invalid feedback status")
                target = sketch_path(model)
                with exploration_lock:
                    sketch = json.loads(target.read_bytes())
                    if update.get("submittedAt") != sketch["submittedAt"]:
                        self.send_error(409, "A newer instruction has arrived")
                        return
                    sketch["status"] = update["status"]
                    sketch["reply"] = str(update.get("reply", ""))
                    temporary = target.with_suffix(".tmp")
                    temporary.write_text(json.dumps(sketch, indent=2) + "\n")
                    temporary.replace(target)
            except (ValueError, TypeError, AttributeError, OSError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
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
