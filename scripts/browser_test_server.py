"""Serve disposable browser-test data; never use the live exploration file."""

import json
import os
import shutil
import subprocess  # nosec B404
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]


def main():
    with TemporaryDirectory(prefix="rpgcad-browser-") as directory:
        target = Path(directory)
        for name in (
            "server.py",
            "plan_library.py",
            "index.html",
            "app.js",
            "geometry.js",
            "library.html",
            "library.js",
            "library-search.js",
        ):
            shutil.copy(ROOT / "prototype" / name, target / name)
        shutil.copy(
            ROOT / "tests" / "fixtures" / "browser-model.json",
            target / "model.PROTOTYPE.json",
        )
        (target / "below.json").write_text(
            json.dumps(
                {
                    "wallThickness": 0.15,
                    "walls": [],
                    "openings": [],
                    "labels": [
                        {"id": "lower-label", "at": [0, 0], "text": "LOWER LEVEL"}
                    ],
                }
            )
        )
        (target / "plan.PROTOTYPE.json").write_text(
            json.dumps(
                {
                    "levels": [{"id": "below", "model": "below.json"}],
                }
            )
        )
        (target / "depot.json").write_text(
            json.dumps(
                {
                    "wallThickness": 0.15,
                    "walls": [],
                    "openings": [],
                    "labels": [{"id": "depot-label", "at": [0, 0], "text": "DEPOT"}],
                }
            )
        )
        (target / "library.PROTOTYPE.json").write_text(
            json.dumps(
                {
                    "plans": [
                        {
                            "id": "default",
                            "name": "Referee building",
                            "characters": "characters.PROTOTYPE.json",
                            "levels": [
                                {
                                    "id": "original",
                                    "name": "Ground",
                                    "model": "model.PROTOTYPE.json",
                                },
                                {"id": "below", "name": "below", "model": "below.json"},
                            ],
                        },
                        {
                            "id": "depot",
                            "name": "Depot",
                            "levels": [
                                {
                                    "id": "original",
                                    "name": "Depot floor",
                                    "model": "depot.json",
                                }
                            ],
                        },
                    ]
                }
            )
        )
        library_path = target / "library.PROTOTYPE.json"
        library = json.loads(library_path.read_text())
        library["plans"].extend(
            json.loads((ROOT / "tests/fixtures/library-plans.json").read_text())[
                "plans"
            ]
        )
        library_path.write_text(json.dumps(library))
        (target / "exploration.PROTOTYPE.json").write_text(
            json.dumps(
                {
                    "version": 2,
                    "observers": [{"id": "party", "at": [0, 0], "range": 6}],
                    "observations": [],
                    "revisions": {},
                    "doors": {},
                    "visibilityPaused": True,
                }
            )
        )
        try:
            # Only run our copied server with a fixed, dedicated test port.
            subprocess.run(  # nosec B603
                [
                    sys.executable,
                    str(target / "server.py"),
                    "--port",
                    os.environ.get("RPGCAD_TEST_PORT", "8766"),
                ],
                check=True,
            )
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
