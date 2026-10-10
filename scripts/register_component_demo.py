"""Append the separate component demo while the library server is stopped."""

import argparse
import json
import shutil
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "prototype/demos/component-demo.json"
# Direct script execution needs the repository root for shared authored hashing.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def register(root: Path):
    from prototype.plan_library import model_fingerprint

    library = root / "library.PROTOTYPE.json"
    original = library.read_bytes()
    data = json.loads(original)
    directory = root / "component-demo-data"
    backup = root / "library.before-component-demo.json"
    if any(p["id"] == "component-demo" for p in data["plans"]) or directory.exists():
        raise ValueError("Component demonstration already exists; refusing overwrite")
    if backup.exists():
        raise ValueError(
            "Registration backup already exists; inspect it before retrying"
        )
    model = json.loads(SOURCE.read_text())
    definitions = model.pop("componentDefinitions")
    plan = {
        "id": "component-demo",
        "name": "Component demonstration",
        "description": (
            "Six original seed families with independent placement and settings. "
            "Proposed dimensions; awaiting Referee evaluation."
        ),
        "tags": ["components", "demonstration"],
        "createdAt": None,
        "editedAt": None,
        "lastPlayedAt": None,
        "characters": "component-demo-data/characters.json",
        "componentDefinitions": definitions,
        "levels": [
            {
                "id": "demo",
                "name": "Demo floor",
                "model": "component-demo-data/model.json",
                "createdAt": None,
                "editedAt": None,
                "lastPlayedAt": None,
            }
        ],
    }
    data["plans"].append(plan)
    directory.mkdir()
    try:
        (directory / "model.json").write_text(json.dumps(model, indent=2) + "\n")
        (directory / "characters.json").write_text('{"characters": [], "pov": null}\n')
        (directory / "model.exploration.json").write_text(
            json.dumps(
                {
                    "version": 2,
                    "observers": [],
                    "observations": [],
                    "revisions": {},
                    "doors": {},
                    "visibilityPaused": True,
                }
            )
            + "\n"
        )
        key = json.dumps([plan["id"], plan["levels"][0]["id"]])
        data.setdefault("modelRevisions", {})[key] = model_fingerprint(
            directory / "model.json", definitions
        )
        with backup.open("xb") as file:
            file.write(original)
        temporary = directory / "library.pending.json"
        temporary.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
        if library.read_bytes() != original:
            raise ValueError(
                "Library changed during registration; stop the server and retry"
            )
        temporary.replace(library)
    except Exception:
        shutil.rmtree(directory)
        raise
    print("Registered Component demonstration; previous library retained at", backup)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        required=True,
        type=Path,
        help="Explicit prototype data directory; stop its server first",
    )
    args = parser.parse_args()
    try:
        register(args.root.resolve())
    except (OSError, ValueError, KeyError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
