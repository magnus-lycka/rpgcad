"""Exercise the viewer bridge through HTTP without touching the live drawing."""

import json
import shutil
import socket
import subprocess
import sys
from http.client import HTTPConnection
from pathlib import Path

import pytest


@pytest.fixture
def bridge(tmp_path):
    source = Path(__file__).resolve().parents[1] / "prototype"
    for name in ("server.py", "index.html", "geometry.js", "app.js"):
        if (source / name).exists():
            shutil.copy(source / name, tmp_path / name)
    (tmp_path / "model.PROTOTYPE.json").write_text('{"name":"test plan"}')
    (tmp_path / "exploration.PROTOTYPE.json").write_text(
        json.dumps({"version": 2, "observers": [], "observations": [], "revisions": {}})
    )
    (tmp_path / "below.json").write_text('{"name":"lower level"}')
    (tmp_path / "plan.PROTOTYPE.json").write_text(
        json.dumps({"levels": [{"id": "below", "model": "below.json"}]})
    )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, str(tmp_path / "server.py"), "--port", str(port)],
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert process.stdout is not None
        assert "RPGCAD prototype" in process.stdout.readline()
        connection = HTTPConnection("127.0.0.1", port, timeout=3)
        yield connection
        connection.close()
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_browser_can_load_geometry_module(bridge):
    bridge.request("GET", "/geometry.js")
    response = bridge.getresponse()
    assert (response.status, response.getheader("Content-Type")) == (
        200,
        "text/javascript; charset=utf-8",
    )
    assert b"export" in response.read()


def test_stale_writer_cannot_overwrite_newer_exploration(bridge):
    bridge.request("GET", "/exploration")
    original = bridge.getresponse()
    etag = original.getheader("ETag")
    state = json.loads(original.read())
    state["observers"] = [{"at": [1.5, 0], "range": 6}]
    bridge.request(
        "PUT",
        "/exploration",
        json.dumps(state),
        {"Content-Type": "application/json", "If-Match": etag},
    )
    saved = bridge.getresponse()
    assert saved.status == 204
    saved.read()
    state["observers"] = []
    bridge.request(
        "PUT",
        "/exploration",
        json.dumps(state),
        {"Content-Type": "application/json", "If-Match": etag},
    )
    rejected = bridge.getresponse()
    assert rejected.status == 412
    rejected.read()
    bridge.request("GET", "/exploration")
    current = bridge.getresponse()
    assert json.loads(current.read())["observers"] == [{"at": [1.5, 0], "range": 6}]


def test_level_urls_select_models_on_the_same_server(bridge):
    for route, expected in [
        ("/model", "test plan"),
        ("/model?level=below", "lower level"),
    ]:
        bridge.request("GET", route)
        response = bridge.getresponse()
        assert response.status == 200
        assert json.loads(response.read())["name"] == expected
    bridge.request("GET", "/model?level=unknown")
    response = bridge.getresponse()
    assert response.status == 404
    response.read()


def test_exploration_is_saved_only_for_the_selected_level(bridge):
    bridge.request("GET", "/exploration?level=below")
    response = bridge.getresponse()
    assert response.status == 200
    etag = response.getheader("ETag")
    state = json.loads(response.read())
    assert state["observations"] == []
    state["observers"] = [{"at": [3, 6], "range": 9}]
    bridge.request(
        "PUT", "/exploration?level=below", json.dumps(state), {"If-Match": etag}
    )
    saved = bridge.getresponse()
    assert saved.status == 204
    saved.read()
    bridge.request("GET", "/exploration?level=below")
    response = bridge.getresponse()
    assert json.loads(response.read())["observers"] == [{"at": [3, 6], "range": 9}]
    bridge.request("GET", "/exploration")
    response = bridge.getresponse()
    assert json.loads(response.read())["observers"] == []
    bridge.request("GET", "/exploration?level=unknown")
    response = bridge.getresponse()
    assert response.status == 404
    response.read()
