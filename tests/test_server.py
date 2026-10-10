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
    for name in ("server.py", "plan_library.py", "index.html", "geometry.js", "app.js"):
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


def test_sketch_handoff_retains_raw_strokes_and_selected_level(bridge):
    sketch = {
        "instruction": "pond",
        "strokes": [[[0.13, -2.17], [0.31, -2.02], [0.29, -1.81]]],
        "modelRevision": "current-model",
        "view": {"x": -3, "y": -4, "w": 12, "h": 8},
    }
    bridge.request("PUT", "/sketch?level=below", json.dumps(sketch))
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/sketch?level=below")
    response = bridge.getresponse()
    saved = json.loads(response.read())
    assert saved["strokes"] == sketch["strokes"]
    assert saved["instruction"] == "pond"
    assert saved["level"] == "below"
    assert saved["modelRevision"] == "current-model"
    bridge.request("GET", "/sketch")
    response = bridge.getresponse()
    assert json.loads(response.read()) is None


def test_agent_can_acknowledge_visual_feedback_without_replacing_it(bridge):
    sketch = {"instruction": "move this", "strokes": [[[1, 2]]]}
    bridge.request("PUT", "/sketch", json.dumps(sketch))
    response = bridge.getresponse()
    response.read()
    bridge.request("GET", "/sketch")
    response = bridge.getresponse()
    saved = json.loads(response.read())
    bridge.request(
        "PATCH",
        "/sketch",
        json.dumps(
            {
                "submittedAt": saved["submittedAt"],
                "status": "applied",
                "reply": "Moved the tank",
            }
        ),
    )
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/sketch")
    response = bridge.getresponse()
    acknowledged = json.loads(response.read())
    assert acknowledged["strokes"] == [[[1, 2]]]
    assert acknowledged["status"] == "applied"
    assert acknowledged["reply"] == "Moved the tank"


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


def test_characters_are_shared_across_levels_and_stale_saves_are_rejected(bridge):
    bridge.request("GET", "/characters")
    response = bridge.getresponse()
    assert response.status == 200
    etag = response.getheader("ETag")
    assert json.loads(response.read()) == {"characters": [], "pov": None}
    state = {
        "characters": [
            {
                "id": "ada",
                "name": "Ada",
                "kind": "pc",
                "level": "below",
                "at": [1, 2],
                "range": 6,
            }
        ],
        "pov": "ada",
    }
    bridge.request("PUT", "/characters", json.dumps(state), {"If-Match": etag})
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/characters?level=below")
    response = bridge.getresponse()
    assert json.loads(response.read()) == state
    bridge.request("PUT", "/characters", json.dumps(state), {"If-Match": etag})
    response = bridge.getresponse()
    assert response.status == 412
    response.read()


def test_library_lists_legacy_plan_and_rejects_unknown_plan(bridge):
    bridge.request("GET", "/library")
    response = bridge.getresponse()
    assert response.status == 200
    plans = json.loads(response.read())["plans"]
    assert len(plans) == 1
    assert [level["id"] for level in plans[0]["levels"]] == ["original", "below"]
    bridge.request("GET", "/model?plan=missing")
    response = bridge.getresponse()
    assert response.status == 404
    response.read()


@pytest.fixture
def multiple_plans(tmp_path, request):
    request.getfixturevalue("bridge")
    (tmp_path / "depot.json").write_text('{"name":"depot"}')
    (tmp_path / "library.PROTOTYPE.json").write_text(
        json.dumps(
            {
                "plans": [
                    {
                        "id": "default",
                        "name": "Building",
                        "characters": "characters.PROTOTYPE.json",
                        "levels": [
                            {
                                "id": "original",
                                "name": "Ground",
                                "model": "model.PROTOTYPE.json",
                            },
                            {"id": "below", "name": "Basement", "model": "below.json"},
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
    return request.getfixturevalue("bridge")


def test_different_plans_isolate_models_marks_exploration_and_characters(
    multiple_plans,
):
    bridge = multiple_plans
    bridge.request("GET", "/model?plan=depot&level=original")
    response = bridge.getresponse()
    assert json.loads(response.read())["name"] == "depot"
    bridge.request(
        "PUT", "/sketch?plan=depot&level=original", json.dumps({"strokes": [[[1, 2]]]})
    )
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/sketch")
    response = bridge.getresponse()
    assert json.loads(response.read()) is None
    for route, state in [
        (
            "/exploration",
            {
                "version": 2,
                "observers": [{"at": [1, 2], "range": 6}],
                "observations": [],
                "revisions": {},
            },
        ),
        (
            "/characters",
            {
                "characters": [
                    {
                        "id": "pc",
                        "name": "Ada",
                        "kind": "pc",
                        "level": "original",
                        "at": [1, 2],
                        "range": 6,
                    }
                ],
                "pov": "pc",
            },
        ),
    ]:
        bridge.request("GET", route + "?plan=depot")
        response = bridge.getresponse()
        etag = response.getheader("ETag")
        response.read()
        bridge.request(
            "PUT", route + "?plan=depot", json.dumps(state), {"If-Match": etag}
        )
        response = bridge.getresponse()
        assert response.status == 204
        response.read()
        bridge.request("GET", route)
        response = bridge.getresponse()
        original = json.loads(response.read())
        assert original.get("characters", original.get("observers")) == []


def test_metadata_changes_preserve_ids_and_propagate_edit_dates(multiple_plans):
    bridge = multiple_plans
    bridge.request(
        "PATCH",
        "/metadata?plan=depot&level=original",
        json.dumps(
            {"name": "Cargo deck", "description": "Stores", "tags": ["cargo", "quiet"]}
        ),
    )
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/plan?plan=depot")
    response = bridge.getresponse()
    plan = json.loads(response.read())
    level = plan["levels"][0]
    assert (plan["id"], level["id"], level["name"]) == (
        "depot",
        "original",
        "Cargo deck",
    )
    assert level["tags"] == ["cargo", "quiet"]
    assert level["description"] == "Stores"
    assert level["createdAt"] is None
    assert plan["createdAt"] is None
    assert level["editedAt"] == plan["editedAt"]
    assert level["editedAt"] is not None
    bridge.request(
        "PATCH",
        "/metadata?plan=depot&level=original",
        json.dumps(
            {"name": "Cargo deck", "description": "Stores", "tags": ["cargo", "quiet"]}
        ),
    )
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/plan?plan=depot")
    response = bridge.getresponse()
    assert json.loads(response.read()) == plan


def test_authored_model_change_updates_only_its_level_and_parent(
    multiple_plans, tmp_path
):
    bridge = multiple_plans
    bridge.request("GET", "/library")
    response = bridge.getresponse()
    original = json.loads(response.read())
    assert all(p["editedAt"] is None for p in original["plans"])
    (tmp_path / "depot.json").write_text('{"name":"changed cargo layout"}')
    bridge.request("GET", "/library")
    response = bridge.getresponse()
    changed = json.loads(response.read())
    building, depot = changed["plans"]
    assert building["editedAt"] is None
    assert depot["editedAt"] is not None
    assert depot["levels"][0]["editedAt"] == depot["editedAt"]
    assert depot["createdAt"] is None
    (tmp_path / "depot.json").write_text('{ "name": "changed cargo layout" }\n')
    bridge.request("GET", "/library")
    response = bridge.getresponse()
    assert json.loads(response.read()) == changed


def test_authoring_history_survives_play_and_failed_metadata_saves(
    multiple_plans, tmp_path
):
    bridge = multiple_plans
    path = tmp_path / "library.PROTOTYPE.json"
    data = json.loads(path.read_text())
    plan = data["plans"][1]
    plan.update(
        createdAt="2020-01-02T03:04:05+00:00", editedAt="2021-01-02T03:04:05+00:00"
    )
    plan["levels"][0].update(
        createdAt="2020-01-03T03:04:05+00:00", editedAt="2021-01-03T03:04:05+00:00"
    )
    path.write_text(json.dumps(data))
    bridge.request("GET", "/plan?plan=depot")
    response = bridge.getresponse()
    before = json.loads(response.read())
    bridge.request("PATCH", "/metadata?plan=depot", json.dumps({"name": ""}))
    response = bridge.getresponse()
    assert response.status == 400
    response.read()
    bridge.request("GET", "/exploration?plan=depot")
    response = bridge.getresponse()
    etag = response.getheader("ETag")
    exploration = json.loads(response.read())
    exploration["observers"] = [{"at": [0, 0], "range": 6}]
    bridge.request(
        "PUT", "/exploration?plan=depot", json.dumps(exploration), {"If-Match": etag}
    )
    response = bridge.getresponse()
    assert response.status == 204
    response.read()
    bridge.request("GET", "/plan?plan=depot")
    response = bridge.getresponse()
    after = json.loads(response.read())
    for key in ("createdAt", "editedAt"):
        assert after[key] == before[key]
        assert after["levels"][0][key] == before["levels"][0][key]
