"""Authoritative plan records, metadata edits and authored-model change tracking."""

import copy
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from uuid import uuid4


def model_fingerprint(path):
    """Hash authored content independently of JSON formatting."""
    model = json.loads(path.read_text())
    return hashlib.sha256(json.dumps(model, sort_keys=True).encode()).hexdigest()


class PlanLibrary:
    """Keep stable identities and authored dates separate from play state."""

    def __init__(self, root: Path, legacy: dict):
        self.root = root
        self.path = root / "library.PROTOTYPE.json"
        self.legacy = legacy
        self.lock = RLock()

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
                        revision = model_fingerprint(self.root / level["model"])
                    except (OSError, ValueError):
                        continue
                    if revisions.get(key) != revision:
                        if key in revisions:
                            level["editedAt"] = plan["editedAt"] = datetime.now(
                                UTC
                            ).isoformat()
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
                record["editedAt"] = plan["editedAt"] = datetime.now(UTC).isoformat()
                self.write(data)

    def record_play(self, plan_id, level_ids):
        """Update only play dates using the latest authoritative records."""
        with self.lock:
            data = self.read()
            plan = next(p for p in data["plans"] if p["id"] == plan_id)
            played_at = datetime.now(UTC).isoformat()
            plan["lastPlayedAt"] = played_at
            for level in plan["levels"]:
                if level["id"] in level_ids:
                    level["lastPlayedAt"] = played_at
            self.write(data)

    def duplicate(self, plan_id):
        """Publish new authored files before their independent library record."""
        with self.lock:
            data = self.read()
            source = next(p for p in data["plans"] if p["id"] == plan_id)
            now = datetime.now(UTC).isoformat()
            plan = {
                key: copy.deepcopy(source[key])
                for key in ("name", "description", "tags")
            }
            plan.update(
                id=uuid4().hex,
                name=source["name"] + " copy",
                createdAt=now,
                editedAt=now,
                lastPlayedAt=None,
                levels=[],
            )
            for original in source["levels"]:
                level = {
                    key: copy.deepcopy(original[key])
                    for key in ("name", "description", "tags")
                }
                if "order" in original:
                    level["order"] = original["order"]
                level.update(
                    id=uuid4().hex, createdAt=now, editedAt=now, lastPlayedAt=None
                )
                level["model"] = f"{plan['id']}-{level['id']}.json"
                (self.root / level["model"]).write_bytes(
                    (self.root / original["model"]).read_bytes()
                )
                key = json.dumps([plan["id"], level["id"]])
                data["modelRevisions"][key] = model_fingerprint(
                    self.root / level["model"]
                )
                plan["levels"].append(level)
            data["plans"].append(plan)
            self.write(data)
            return plan
