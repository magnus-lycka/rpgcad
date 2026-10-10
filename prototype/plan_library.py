"""Authoritative plan records, metadata edits and authored-model change tracking."""

import copy
import hashlib
import json
import math
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from uuid import uuid4


def utc_now() -> datetime:
    """Return the production clock's current UTC time."""
    return datetime.now(UTC)


def model_fingerprint(path, definitions=None):
    """Hash authored content independently of JSON formatting."""
    model = json.loads(path.read_text())
    if model.get("components"):
        model["componentDefinitions"] = {
            instance["definition"]: (definitions or {}).get(instance["definition"])
            for instance in model["components"]
        }
    return hashlib.sha256(json.dumps(model, sort_keys=True).encode()).hexdigest()


def validate_components(model, definitions):
    """Reject malformed components before replacing any authored files."""

    def positive(value):
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
            and value > 0
        )

    def finite(value):
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )

    def seat_count(value):
        return (
            isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 6
        )

    def valid_access(value):
        return (
            isinstance(value, dict)
            and not set(value) - {"blocksPassage", "frontClearance"}
            and (
                "blocksPassage" not in value or isinstance(value["blocksPassage"], bool)
            )
            and (
                "frontClearance" not in value
                or (finite(value["frontClearance"]) and value["frontClearance"] >= 0)
            )
        )

    if not isinstance(definitions, dict):
        raise ValueError("Expected component definitions")
    for key, definition in definitions.items():
        if not isinstance(definition, dict):
            raise ValueError("Expected component definition object")
        defaults = definition.get("defaults", {})
        details = definition.get("details", {})
        if (
            not isinstance(defaults, dict)
            or not isinstance(details, dict)
            or definition.get("family")
            not in ("bed", "chair", "console", "machinery", "door", "ceiling-hatch")
            or not isinstance(definition.get("name"), str)
            or not definition.get("name")
            or key != f"{definition.get('id')}@{definition.get('version')}"
            or not isinstance(definition.get("version"), int)
            or definition["version"] < 1
            or not positive(defaults.get("width"))
            or not positive(defaults.get("length"))
            or (
                definition.get("family") in ("bed", "chair", "console", "machinery")
                and not positive(details.get("headDepth"))
            )
            or (
                definition.get("family") == "door"
                and not positive(details.get("leafThickness"))
            )
            or not isinstance(definition.get("blocksSight"), bool)
            or not valid_access(definition.get("access", {}))
            or (
                definition.get("family") == "console"
                and not seat_count(defaults.get("seatCount"))
            )
        ):
            raise ValueError("Invalid component definition")
    instances = model.get("components", [])
    if not isinstance(instances, list):
        raise ValueError("Expected component instances")
    ids = {
        item.get("id")
        for kind in (
            "walls",
            "openings",
            "labels",
            "outlines",
            "circles",
            "lines",
            "stepIrons",
            "spiralStairs",
        )
        for item in model.get(kind, [])
    }
    for instance in instances:
        if not isinstance(instance, dict):
            raise ValueError("Expected component instance object")
        definition = definitions.get(instance.get("definition"))
        at = instance.get("at")
        attached = definition and definition.get("family") == "door"
        settings = instance.get("settings", {})
        if (
            not definition
            or not isinstance(instance.get("id"), str)
            or not instance["id"]
            or instance["id"] in ids
            or (
                not attached
                and (
                    not isinstance(at, list)
                    or len(at) != 2
                    or not all(finite(n) for n in at)
                    or not finite(instance.get("rotation"))
                )
            )
            or (not attached and "opening" in instance)
            or not valid_access(instance.get("access", {}))
            or (
                "blocksSight" in instance
                and not isinstance(instance["blocksSight"], bool)
            )
            or not isinstance(settings, dict)
            or (
                definition.get("family") == "console"
                and not seat_count(
                    settings.get("seatCount", definition["defaults"]["seatCount"])
                )
            )
            or set(settings)
            - (
                {"width", "length", "direction", "state"}
                if definition and definition.get("family") == "ceiling-hatch"
                else {"seatCount"}
                if definition.get("family") == "console"
                else {"width", "length"}
            )
            or not all(
                positive(value)
                for key, value in settings.items()
                if key in ("width", "length")
            )
            or (settings.get("direction", "up") not in ("up", "down", "up-down"))
            or (settings.get("state", "closed") not in ("open", "closed"))
            or (
                attached
                and (
                    settings
                    or not any(
                        o.get("id") == instance.get("opening")
                        for o in model.get("openings", [])
                    )
                )
            )
        ):
            raise ValueError("Invalid component instance")
        if (
            attached
            and sum(i.get("opening") == instance.get("opening") for i in instances) != 1
        ):
            raise ValueError("An opening can have only one component door")
        if attached:
            opening = next(
                o for o in model["openings"] if o.get("id") == instance.get("opening")
            )
            wall = next(
                (
                    w
                    for w in model.get("walls", [])
                    if w.get("id") == opening.get("wall")
                ),
                None,
            )
            if (
                not wall
                or not positive(opening.get("width"))
                or not finite(opening.get("offset"))
                or opening["offset"] < 0
                or opening["offset"] + opening["width"]
                > math.dist(wall["a"], wall["b"]) + 1e-8
            ):
                raise ValueError("Component door must fit its wall opening")
        ids.add(instance["id"])


def _duplicate_authored_record(source, now):
    """Copy authored metadata into a fresh identity with no play history."""
    record = {
        key: copy.deepcopy(source[key]) for key in ("name", "description", "tags")
    }
    record.update(id=uuid4().hex, createdAt=now, editedAt=now, lastPlayedAt=None)
    return record


class PlanLibrary:
    """Keep stable identities and authored dates separate from play state."""

    def __init__(
        self, root: Path, legacy: dict, *, clock: Callable[[], datetime] = utc_now
    ):
        self.root = root
        self.path = root / "library.PROTOTYPE.json"
        self.legacy = legacy
        self.lock = RLock()
        self.clock = clock

    def read(self):
        with self.lock:
            data: dict = (
                json.loads(self.path.read_text())
                if self.path.exists()
                else {"plans": [self.legacy]}
            )
            for plan in data["plans"]:
                for record in [plan, *plan["levels"]]:
                    record.setdefault("description", "")
                    record.setdefault("tags", [])
                    record.setdefault("createdAt", None)
                    record.setdefault("editedAt", None)
                    record.setdefault("lastPlayedAt", None)
            revisions = data.setdefault("modelRevisions", {})
            changed = False
            for plan in data["plans"]:
                for level in plan["levels"]:
                    key = json.dumps([plan["id"], level["id"]])
                    try:
                        revision = model_fingerprint(
                            self.root / level["model"],
                            plan.get("componentDefinitions", {}),
                        )
                    except (OSError, ValueError):
                        continue
                    if revisions.get(key) != revision:
                        if key in revisions:
                            level["editedAt"] = plan["editedAt"] = (
                                self.clock().isoformat()
                            )
                        revisions[key] = revision
                        changed = True
            if changed:
                self.write(data)
            return data

    def write(self, data):
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
        temporary.replace(self.path)

    def edit_metadata(self, plan_id, level_id, update):
        if (
            not isinstance(update, dict)
            or not update
            or set(update) - {"name", "description", "tags"}
        ):
            raise ValueError("Expected name, description or tags")
        if "name" in update and (
            not isinstance(update["name"], str) or not update["name"].strip()
        ):
            raise ValueError("Name must not be empty")
        if "description" in update and not isinstance(update["description"], str):
            raise ValueError("Description must be text")
        if "tags" in update and (
            not isinstance(update["tags"], list)
            or any(
                not isinstance(tag, str) or not tag.strip() for tag in update["tags"]
            )
        ):
            raise ValueError("Tags must be nonempty strings")
        with self.lock:
            data = self.read()
            plan = next(p for p in data["plans"] if p["id"] == plan_id)
            record = (
                next(level for level in plan["levels"] if level["id"] == level_id)
                if level_id
                else plan
            )
            if any(record[key] != value for key, value in update.items()):
                record.update(update)
                record["editedAt"] = plan["editedAt"] = self.clock().isoformat()
                self.write(data)

    def record_play(self, plan_id, level_ids):
        """Update only play dates using the latest authoritative records."""
        with self.lock:
            data = self.read()
            plan = next(p for p in data["plans"] if p["id"] == plan_id)
            played_at = self.clock().isoformat()
            plan["lastPlayedAt"] = played_at
            for level in plan["levels"]:
                if level["id"] in level_ids:
                    level["lastPlayedAt"] = played_at
            self.write(data)

    def save_model(self, plan_id, path, model, definitions):
        """Save an agent-authored level and its exact plan-owned definitions."""
        if not isinstance(definitions, dict):
            raise ValueError("Expected component definitions")
        if any(
            not isinstance(model.get(key), list)
            for key in ("walls", "openings", "labels")
        ):
            raise ValueError("Expected walls, openings and labels")
        validate_components(model, definitions)
        encoded = json.dumps(model, indent=2, allow_nan=False) + "\n"
        json.dumps(definitions, allow_nan=False)
        with self.lock:
            data = self.read()
            plan = next(p for p in data["plans"] if p["id"] == plan_id)
            old_definitions = plan.get("componentDefinitions", {})
            definitions_changed = old_definitions != definitions
            changed_levels = set()
            for level in plan["levels"]:
                candidate = (
                    model
                    if self.root / level["model"] == path
                    else json.loads((self.root / level["model"]).read_text())
                )
                validate_components(candidate, definitions)
                for instance in candidate.get("components", []):
                    reference = instance.get("definition")
                    if reference not in definitions:
                        raise ValueError(
                            "Unknown component definition on a saved level"
                        )
                    if old_definitions.get(reference) != definitions[reference]:
                        changed_levels.add(level["id"])
            model_changed = json.loads(path.read_text()) != model
            if not definitions_changed and not model_changed:
                return
            if model_changed:
                temporary = path.with_suffix(".tmp")
                temporary.write_text(encoded)
                temporary.replace(path)
            plan["componentDefinitions"] = copy.deepcopy(definitions)
            now = self.clock().isoformat()
            plan["editedAt"] = now
            for level in plan["levels"]:
                if (self.root / level["model"] == path and model_changed) or level[
                    "id"
                ] in changed_levels:
                    level["editedAt"] = now
                    key = json.dumps([plan_id, level["id"]])
                    data["modelRevisions"][key] = model_fingerprint(
                        self.root / level["model"], definitions
                    )
            self.write(data)

    def duplicate(self, plan_id):
        """Publish new authored files before their independent library record."""
        with self.lock:
            data = self.read()
            source = next(p for p in data["plans"] if p["id"] == plan_id)
            now = self.clock().isoformat()
            plan = _duplicate_authored_record(source, now)
            plan.update(
                name=source["name"] + " copy",
                levels=[],
                componentDefinitions=copy.deepcopy(
                    source.get("componentDefinitions", {})
                ),
            )
            for original in source["levels"]:
                level = _duplicate_authored_record(original, now)
                if "order" in original:
                    level["order"] = original["order"]
                level["model"] = f"{plan['id']}-{level['id']}.json"
                (self.root / level["model"]).write_bytes(
                    (self.root / original["model"]).read_bytes()
                )
                key = json.dumps([plan["id"], level["id"]])
                data["modelRevisions"][key] = model_fingerprint(
                    self.root / level["model"], plan["componentDefinitions"]
                )
                plan["levels"].append(level)
            data["plans"].append(plan)
            self.write(data)
            return plan
