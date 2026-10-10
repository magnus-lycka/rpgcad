"""Exercise the explicit, non-overwriting demonstration registration command."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_registration_preserves_existing_records_and_refuses_repeat(tmp_path):
    library = tmp_path / "library.PROTOTYPE.json"
    original = {
        "plans": [
            {"id": "old", "name": "Existing", "editedAt": "2020-01-01", "levels": []}
        ],
        "modelRevisions": {"old": "keep"},
    }
    library.write_text(json.dumps(original))
    state = tmp_path / "old.exploration.json"
    state.write_text('{"observations":["keep"]}')
    command = [
        sys.executable,
        str(ROOT / "scripts/register_component_demo.py"),
        "--root",
        str(tmp_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    registered = json.loads(library.read_text())
    assert registered["plans"][:-1] == original["plans"]
    assert registered["modelRevisions"]["old"] == original["modelRevisions"]["old"]
    assert set(registered["modelRevisions"]) == {
        "old",
        json.dumps(["component-demo", "demo"]),
    }
    assert state.read_text() == '{"observations":["keep"]}'
    demo = registered["plans"][-1]
    assert (demo["id"], demo["name"]) == ("component-demo", "Component demonstration")
    assert set(demo["componentDefinitions"]) == {
        "bed@1",
        "chair@1",
        "door@1",
        "ceiling-hatch@1",
        "console@1",
        "floor-hatch@1",
        "through-hatch@1",
        "iris-valve-up@1",
        "iris-valve-down@1",
        "iris-valve-up-down@1",
    }
    before = library.read_bytes()
    repeat = subprocess.run(command, capture_output=True, text=True)
    assert repeat.returncode != 0
    assert "already exists" in repeat.stderr
    assert library.read_bytes() == before


def test_registration_refuses_reserved_directory_without_changing_library(tmp_path):
    library = tmp_path / "library.PROTOTYPE.json"
    library.write_text('{"plans":[]}')
    directory = tmp_path / "component-demo-data"
    directory.mkdir()
    authored = directory / "model.json"
    authored.write_text('{"authored":"keep"}')
    before = library.read_bytes()
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/register_component_demo.py"),
            "--root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert library.read_bytes() == before
    assert authored.read_text() == '{"authored":"keep"}'
