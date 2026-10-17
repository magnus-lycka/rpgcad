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

from component_catalogue import search_catalogue
from plan_library import PlanLibrary, utc_now

ROOT = Path(__file__).resolve().parent


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def model_point(value):
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(finite_number(coordinate) for coordinate in value)
    )


def main(*, clock=utc_now):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", type=Path, default=ROOT / "model.PROTOTYPE.json")
    args = parser.parse_args()
    exploration_lock = Lock()
    plan_file = ROOT / "plan.PROTOTYPE.json"
    library_file = ROOT / "library.PROTOTYPE.json"
    legacy = json.loads(plan_file.read_text()) if plan_file.exists() else {}
    legacy.setdefault("id", "default")
    legacy.setdefault("name", "Referee building")
    levels = legacy.setdefault("levels", [])
    if not any(level["id"] == "original" for level in levels):
        levels.insert(0, {"id": "original", "name": "Ground", "model": str(args.model)})
    for level in levels:
        level.setdefault("name", level["id"])
    legacy["characters"] = "characters.PROTOTYPE.json"

    store = PlanLibrary(ROOT, legacy, clock=clock)
    library = store.read

    def plan_models(plan):
        return {level["id"]: ROOT / level["model"] for level in plan["levels"]}

    def authored_model(path, plan):
        model = json.loads(path.read_bytes())
        if plan.get("componentDefinitions"):
            model["componentDefinitions"] = plan["componentDefinitions"]
        return model

    def character_path(plan):
        return ROOT / plan.get("characters", plan["id"] + ".characters.json")

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

    def meaningful_exploration(state):
        """Ignore default serialization and snapshots unused by observation history."""
        revisions = state["revisions"]
        for observation in state["observations"]:
            if (
                not isinstance(observation, dict)
                or not isinstance(observation.get("revision"), str)
                or observation["revision"] not in revisions
                or not isinstance(revisions[observation["revision"]], dict)
            ):
                raise ValueError("Each observation must reference a model revision")
        return {
            "observers": state["observers"],
            "observations": state["observations"],
            "doors": state.get("doors", {}),
            "visibilityPaused": state.get("visibilityPaused", False),
            "revisions": {
                observation["revision"]: revisions.get(observation["revision"])
                for observation in state["observations"]
            },
        }

    def sketch_path(model):
        return model.with_name(model.stem + ".sketch.PROTOTYPE.json")

    class Handler(BaseHTTPRequestHandler):
        def selected_plan(self):
            pid = parse_qs(urlsplit(self.path).query).get("plan", [legacy["id"]])[0]
            plan = next((p for p in library()["plans"] if p["id"] == pid), None)
            if plan is None:
                self.send_error(404, "Unknown plan")
            return plan

        def selected_model(self):
            plan = self.selected_plan()
            if plan is None:
                return None
            level = parse_qs(urlsplit(self.path).query).get(
                "level", [plan["levels"][0]["id"]]
            )[0]
            model = plan_models(plan).get(level)
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
                "/library",
                "/library.html",
                "/library.js",
                "/library-search.js",
                "/components",
                "/components.html",
                "/components.js",
                "/app.js",
                "/commands.js",
                "/command-ui.js",
                "/geometry.js",
            ):
                self.send_error(404)
                return
            try:
                if route == "/components":
                    body = json.dumps(
                        search_catalogue(
                            ROOT / "component-catalogue.json",
                            parse_qs(urlsplit(self.path).query),
                        )
                    ).encode()
                elif route in ("/components.html", "/components.js"):
                    body = (ROOT / route[1:]).read_bytes()
                else:
                    body = self.plan_response(route)
                    if body is None:
                        return
            except ValueError:
                self.send_error(400, "Invalid catalogue request")
                return
            except KeyError:
                self.send_error(404, "Unknown component definition")
                return
            except OSError as error:
                self.send_error(503, str(error))
                return
            self.send_body(route, body)

        def plan_response(self, route):
            plan = self.selected_plan()
            if plan is None:
                return
            model = self.selected_model()
            if model is None:
                return
            source = {
                "/": ROOT / "index.html",
                "/app.js": ROOT / "app.js",
                "/commands.js": ROOT / "commands.js",
                "/command-ui.js": ROOT / "command-ui.js",
                "/geometry.js": ROOT / "geometry.js",
                "/model": model,
                "/exploration": exploration_path(model),
                "/sketch": sketch_path(model),
                "/characters": character_path(plan),
                "/library": library_file,
                "/library.html": ROOT / "library.html",
                "/library.js": ROOT / "library.js",
                "/library-search.js": ROOT / "library-search.js",
                "/plan": plan_file,
            }[route]
            body = (
                (source.read_bytes() if source.exists() else empty_characters)
                if route == "/characters"
                else json.dumps(library()).encode()
                if route == "/library"
                else json.dumps(plan).encode()
                if route == "/plan"
                else json.dumps(authored_model(model, plan)).encode()
                if route == "/model"
                else exploration_bytes(source)
                if route == "/exploration"
                else b"null"
                if route == "/sketch" and not source.exists()
                else source.read_bytes()
            )
            return body

        def send_body(self, route, body):
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
                    if route in ("/", "/library.html", "/components.html")
                    else "application/json"
                ),
            )
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("ETag", etag)
            self.end_headers()
            self.wfile.write(body)

        def save_model(self):
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                self.send_error(403)
                return
            plan = self.selected_plan()
            model = self.selected_model()
            if plan is None or model is None:
                return
            try:
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 5_000_000:
                    raise ValueError("Invalid model size")
                authored = json.loads(self.rfile.read(size))
                if not isinstance(authored, dict):
                    raise ValueError("Expected authored model object")
                definitions = authored.pop(
                    "componentDefinitions", plan.get("componentDefinitions", {})
                )
                store.save_model(plan["id"], model, authored, definitions)
            except (ValueError, TypeError) as error:
                self.send_error(400, str(error))
                return
            except OSError as error:
                self.send_error(503, str(error))
                return
            self.send_response(204)
            self.end_headers()

        def do_POST(self):
            if urlsplit(self.path).path != "/duplicate":
                self.send_error(404)
                return
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                self.send_error(403)
                return
            plan = self.selected_plan()
            if plan is None:
                return
            try:
                duplicate = store.duplicate(plan["id"])
            except OSError as error:
                self.send_error(503, str(error))
                return
            body = json.dumps(duplicate).encode()
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_PUT(self):
            if urlsplit(self.path).path == "/model":
                self.save_model()
                return
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
                if not isinstance(state, dict):
                    raise ValueError("Expected exploration object")
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
                for observer in state["observers"] + state["observations"]:
                    if (
                        not isinstance(observer, dict)
                        or not model_point(observer.get("at"))
                        or not finite_number(observer.get("range"))
                        or observer["range"] <= 0
                    ):
                        raise ValueError("Invalid observer position or range")
                doors = state.get("doors", {})
                if not isinstance(doors, dict) or any(
                    value not in ("open", "closed") for value in doors.values()
                ):
                    raise ValueError("Expected open or closed door states")
                if not isinstance(state.get("visibilityPaused", False), bool):
                    raise ValueError("Expected boolean visibility pause")
                body = (json.dumps(state, indent=2, allow_nan=False) + "\n").encode()
                target = exploration_path(model)
                with exploration_lock:
                    previous = exploration_bytes(target)
                    current_etag = '"' + hashlib.sha256(previous).hexdigest() + '"'
                    if self.headers.get("If-Match") != current_etag:
                        self.send_error(
                            412,
                            "Exploration changed; reload before saving",
                        )
                        return
                    current = meaningful_exploration(state)
                    try:
                        old = meaningful_exploration(json.loads(previous))
                    except ValueError:
                        # A valid save can replace history accepted by older servers.
                        old = None
                    changed = old != current
                    temporary = target.with_suffix(".tmp")
                    temporary.write_bytes(body)
                    temporary.replace(target)
                    if changed:
                        plan = self.selected_plan()
                        store.record_play(
                            plan["id"],
                            {
                                level["id"]
                                for level in plan["levels"]
                                if ROOT / level["model"] == model
                            },
                        )
            except (ValueError, TypeError, OSError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
            self.send_header("ETag", '"' + hashlib.sha256(body).hexdigest() + '"')
            self.end_headers()

        def save_characters(self):
            plan = self.selected_plan()
            if plan is None or self.selected_model() is None:
                return
            models = plan_models(plan)
            character_file = character_path(plan)
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
                if "defaultRange" in state and (
                    not finite_number(state["defaultRange"])
                    or state["defaultRange"] <= 0
                ):
                    raise ValueError("Invalid default sight range")
                ids = set()
                names = set()
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
                        or character.get("level") not in models
                        or not model_point(at)
                        or (
                            character.get("range") is not None
                            and (
                                not finite_number(character["range"])
                                or character["range"] <= 0
                            )
                        )
                    ):
                        raise ValueError("Invalid character")
                    ids.add(cid)
                    name = character["name"].strip().lower()
                    if name in names:
                        raise ValueError("Character names must be unique within a plan")
                    names.add(name)
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
                    old_state = json.loads(previous)
                    old_characters = {c["id"]: c for c in old_state["characters"]}
                    new_characters = {c["id"]: c for c in characters}
                    affected_levels = set()
                    for cid in old_characters.keys() | new_characters.keys():
                        old = old_characters.get(cid)
                        new = new_characters.get(cid)
                        if old != new:
                            affected_levels.update(c["level"] for c in (old, new) if c)
                    if old_state.get("pov") != state.get("pov"):
                        for roster, pov in (
                            (old_characters, old_state.get("pov")),
                            (new_characters, state.get("pov")),
                        ):
                            if pov in roster:
                                affected_levels.add(roster[pov]["level"])
                    if affected_levels:
                        store.record_play(plan["id"], affected_levels)
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
                        if not model_point(point):
                            raise ValueError(
                                "Stroke points must be finite model coordinates"
                            )
                sketch["level"] = parse_qs(urlsplit(self.path).query).get(
                    "level", [""]
                )[0]
                sketch["submittedAt"] = datetime.now(UTC).isoformat()
                sketch["status"] = "pending"
                sketch["model"] = authored_model(model, self.selected_plan())
                body = json.dumps(sketch, indent=2, allow_nan=False) + "\n"
                target = sketch_path(model)
                with exploration_lock:
                    expected = self.headers.get("If-Match")
                    current = target.read_bytes() if target.exists() else b"null"
                    current_etag = '"' + hashlib.sha256(current).hexdigest() + '"'
                    if expected and expected != current_etag:
                        self.send_error(
                            412, "Drawing marks changed; recovery not saved"
                        )
                        return
                    temporary = target.with_suffix(".tmp")
                    temporary.write_text(body)
                    temporary.replace(target)
            except (ValueError, TypeError, AttributeError, OSError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
            self.send_header("X-Sketch-Id", sketch["submittedAt"])
            self.send_header(
                "ETag", '"' + hashlib.sha256(body.encode()).hexdigest() + '"'
            )
            self.end_headers()

        def do_PATCH(self):
            if urlsplit(self.path).path == "/metadata":
                self.save_metadata()
                return
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
                if not isinstance(update.get("reply", ""), str):
                    raise ValueError("Feedback reply must be text")
                target = sketch_path(model)
                with exploration_lock:
                    sketch = json.loads(target.read_bytes())
                    if update.get("submittedAt") != sketch["submittedAt"]:
                        self.send_error(409, "A newer instruction has arrived")
                        return
                    sketch["status"] = update["status"]
                    sketch["reply"] = update.get("reply", "")
                    temporary = target.with_suffix(".tmp")
                    temporary.write_text(json.dumps(sketch, indent=2) + "\n")
                    temporary.replace(target)
            except (ValueError, TypeError, AttributeError, OSError) as error:
                self.send_error(400, str(error))
                return
            self.send_response(204)
            self.end_headers()

        def save_metadata(self):
            plan = self.selected_plan()
            if plan is None:
                return
            query = parse_qs(urlsplit(self.path).query)
            level = query.get("level", [None])[0]
            if level and level not in plan_models(plan):
                self.send_error(404, "Unknown level")
                return
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                self.send_error(403)
                return
            try:
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 100_000:
                    raise ValueError("Invalid metadata size")
                store.edit_metadata(
                    plan["id"], level, json.loads(self.rfile.read(size))
                )
            except (ValueError, TypeError, OSError) as error:
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
