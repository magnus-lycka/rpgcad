"""Serve disposable browser-test data; never use the live exploration file."""

import json
import shutil
import subprocess  # nosec B404
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]


def main():
    with TemporaryDirectory(prefix="rpgcad-browser-") as directory:
        target = Path(directory)
        for name in ("server.py", "index.html", "app.js", "geometry.js"):
            shutil.copy(ROOT / "prototype" / name, target / name)
        shutil.copy(
            ROOT / "tests" / "fixtures" / "browser-model.json",
            target / "model.PROTOTYPE.json",
        )
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
                [sys.executable, str(target / "server.py"), "--port", "8766"],
                check=True,
            )
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
