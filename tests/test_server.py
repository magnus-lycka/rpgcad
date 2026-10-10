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
def bridge(tmp_path, request):
    source = Path(__file__).resolve().parents[1] / "prototype"
    for name in (
        "server.py",
        "plan_library.py",
        "component_catalogue.py",
        "component-catalogue.json",
        "index.html",
        "geometry.js",
        "app.js",
    ):
        if (source / name).exists():
            shutil.copy(source / name, tmp_path / name)
    if hasattr(request, "param"):
        (tmp_path / "component-catalogue.json").write_text(json.dumps(request.param))
    (tmp_path / "test-clock").write_text("2035-06-07T08:09:10+00:00")
    launcher = tmp_path / "launch_server.py"
    launcher.write_text(
        "from datetime import datetime\n"
        "from pathlib import Path\n"
        "from server import main\n\n"
        "def read_test_clock():\n"
        "    return datetime.fromisoformat(\n"
        "        Path(__file__).with_name('test-clock').read_text())\n\n"
        "main(clock=read_test_clock)\n"
    )
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
        [sys.executable, str(launcher), "--port", str(port)],
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


@pytest.fixture
def dated_play(multiple_plans, tmp_path):
    bridge = multiple_plans
    bridge.request("GET", "/library")
    response = bridge.getresponse()
    data = json.loads(response.read())
    for plan in data["plans"]:
        for record in [plan, *plan["levels"]]:
            record.update(
                createdAt="2020-01-01T00:00:00+00:00",
                editedAt="2021-01-01T00:00:00+00:00",
                lastPlayedAt="2022-01-01T00:00:00+00:00",
            )
    (tmp_path / "library.PROTOTYPE.json").write_text(json.dumps(data))
    return bridge


def read_state(bridge, route):
    bridge.request("GET", route)
    response = bridge.getresponse()
    assert response.status == 200
    return json.loads(response.read()), response.getheader("ETag")


def put_state(bridge, route, state, etag):
    bridge.request("PUT", route, json.dumps(state), {"If-Match": etag})
    response = bridge.getresponse()
    result = response.status, response.getheader("ETag")
    response.read()
    return result


def test_saved_exploration_records_play_without_changing_authoring_dates(
    dated_play, tmp_path
):
    bridge = dated_play
    before, _ = read_state(bridge, "/library")
    state, etag = read_state(bridge, "/exploration?level=below")
    state["doors"] = {"cargo-door": "open"}
    status, etag = put_state(bridge, "/exploration?level=below", state, etag)
    assert status == 204
    after, _ = read_state(bridge, "/library")
    expected = json.loads(json.dumps(before))
    expected["plans"][0]["lastPlayedAt"] = "2035-06-07T08:09:10+00:00"
    expected["plans"][0]["levels"][1]["lastPlayedAt"] = "2035-06-07T08:09:10+00:00"
    assert after == expected
    (tmp_path / "test-clock").write_text("2040-01-01T00:00:00+00:00")
    assert put_state(bridge, "/exploration?level=below", state, etag)[0] == 204
    state["visibilityPaused"] = False
    assert put_state(bridge, "/exploration?level=below", state, '"stale"')[0] == 412
    assert read_state(bridge, "/library")[0] == expected


def test_character_saves_record_only_affected_levels_including_transfer(
    dated_play, tmp_path
):
    bridge = dated_play
    before, _ = read_state(bridge, "/library")
    state, etag = read_state(bridge, "/characters")
    state["characters"] = [
        {
            "id": "pc",
            "name": "Scout",
            "kind": "pc",
            "level": "below",
            "at": [1, 2],
            "range": 6,
        },
        {
            "id": "npc",
            "name": "Guard",
            "kind": "npc",
            "level": "original",
            "at": [0, 0],
            "range": 3,
        },
    ]
    state["pov"] = "pc"
    assert put_state(bridge, "/characters", state, etag)[0] == 204
    expected = json.loads(json.dumps(before))
    expected["plans"][0]["lastPlayedAt"] = "2035-06-07T08:09:10+00:00"
    for level in expected["plans"][0]["levels"]:
        level["lastPlayedAt"] = "2035-06-07T08:09:10+00:00"
    assert read_state(bridge, "/library")[0] == expected
    state, etag = read_state(bridge, "/characters")
    (tmp_path / "test-clock").write_text("2040-01-01T00:00:00+00:00")
    assert put_state(bridge, "/characters", state, etag)[0] == 204
    assert read_state(bridge, "/library")[0] == expected
    state["characters"][0]["at"] = [4, 5]
    status, etag = put_state(bridge, "/characters", state, etag)
    assert status == 204
    expected["plans"][0]["lastPlayedAt"] = "2040-01-01T00:00:00+00:00"
    expected["plans"][0]["levels"][1]["lastPlayedAt"] = "2040-01-01T00:00:00+00:00"
    assert read_state(bridge, "/library")[0] == expected
    state["characters"][0]["level"] = "original"
    (tmp_path / "test-clock").write_text("2041-01-01T00:00:00+00:00")
    assert put_state(bridge, "/characters", state, etag)[0] == 204
    expected["plans"][0]["lastPlayedAt"] = "2041-01-01T00:00:00+00:00"
    for level in expected["plans"][0]["levels"]:
        level["lastPlayedAt"] = "2041-01-01T00:00:00+00:00"
    assert read_state(bridge, "/library")[0] == expected
    (tmp_path / "test-clock").write_text("2042-01-01T00:00:00+00:00")
    state["characters"][0]["range"] = 12
    assert put_state(bridge, "/characters", state, '"stale"')[0] == 412
    assert read_state(bridge, "/library")[0] == expected


def test_exploration_defaults_and_unused_revision_cache_are_not_play(dated_play):
    bridge = dated_play
    before, _ = read_state(bridge, "/library")
    state, etag = read_state(bridge, "/exploration")
    state.update(doors={}, visibilityPaused=False)
    state["revisions"]["unused-model"] = {"name": "cached geometry"}
    assert put_state(bridge, "/exploration", state, etag)[0] == 204
    assert read_state(bridge, "/library")[0] == before


def test_invalid_observation_is_rejected_without_saving_or_recording_play(dated_play):
    bridge = dated_play
    before, etag = read_state(bridge, "/exploration")
    library, _ = read_state(bridge, "/library")
    invalid = {**before, "observations": [{"at": [0, 0], "range": 6}]}

    assert put_state(bridge, "/exploration", invalid, etag)[0] == 400
    assert read_state(bridge, "/exploration") == (before, etag)
    assert read_state(bridge, "/library")[0] == library


@pytest.mark.parametrize("revision", [None, "missing-model"])
def test_observation_requires_a_saved_model_revision(dated_play, revision):
    bridge = dated_play
    before, etag = read_state(bridge, "/exploration")
    invalid = {
        **before,
        "observations": [{"at": [0, 0], "range": 6, "revision": revision}],
    }

    assert put_state(bridge, "/exploration", invalid, etag)[0] == 400
    assert read_state(bridge, "/exploration") == (before, etag)


def test_reset_recovers_malformed_saved_history_and_records_play(dated_play, tmp_path):
    bridge = dated_play
    (tmp_path / "below.exploration.json").write_text(
        json.dumps(
            {
                "version": 2,
                "observers": [],
                "observations": [{"at": [0, 0], "range": 6}],
                "revisions": {},
            }
        )
    )
    _, etag = read_state(bridge, "/exploration?level=below")
    reset = {
        "version": 2,
        "observers": [],
        "observations": [],
        "revisions": {},
        "doors": {},
        "visibilityPaused": True,
    }

    assert put_state(bridge, "/exploration?level=below", reset, etag)[0] == 204
    assert read_state(bridge, "/exploration?level=below")[0] == reset
    plan, _ = read_state(bridge, "/plan")
    assert plan["lastPlayedAt"] == "2035-06-07T08:09:10+00:00"
    assert plan["levels"][1]["lastPlayedAt"] == "2035-06-07T08:09:10+00:00"
    assert plan["levels"][0]["lastPlayedAt"] == "2022-01-01T00:00:00+00:00"


def test_play_changes_characterise_pov_range_and_reset_resume_dates(
    dated_play, tmp_path
):
    bridge = dated_play
    state, etag = read_state(bridge, "/exploration?level=below")
    for year, change in (
        (
            2036,
            {
                "observers": [{"id": "party", "at": [1, 2], "range": 6}],
                "visibilityPaused": False,
            },
        ),
        (2037, {"observers": [{"id": "party", "at": [1, 2], "range": 12}]}),
        (
            2038,
            {
                "observations": [
                    {"at": [1, 2], "range": 12, "doors": {}, "revision": "room"}
                ],
                "revisions": {"room": {"name": "remembered room"}},
            },
        ),
        (2039, {"observations": [], "revisions": {}, "visibilityPaused": True}),
        (2040, {"visibilityPaused": False}),
    ):
        timestamp = f"{year}-01-01T00:00:00+00:00"
        (tmp_path / "test-clock").write_text(timestamp)
        state.update(change)
        status, etag = put_state(bridge, "/exploration?level=below", state, etag)
        assert status == 204
        plan, _ = read_state(bridge, "/plan")
        assert plan["lastPlayedAt"] == timestamp
        assert plan["levels"][1]["lastPlayedAt"] == timestamp
        assert plan["levels"][0]["lastPlayedAt"] == "2022-01-01T00:00:00+00:00"
    state, etag = read_state(bridge, "/characters")
    state["characters"] = [
        {
            "id": "scout",
            "name": "Scout",
            "kind": "pc",
            "level": "below",
            "at": [0, 0],
            "range": 6,
        },
        {
            "id": "pilot",
            "name": "Pilot",
            "kind": "pc",
            "level": "original",
            "at": [0, 0],
            "range": 6,
        },
    ]
    state["pov"] = "scout"
    status, etag = put_state(bridge, "/characters", state, etag)
    assert status == 204
    state["pov"] = "pilot"
    (tmp_path / "test-clock").write_text("2041-01-01T00:00:00+00:00")
    status, etag = put_state(bridge, "/characters", state, etag)
    assert status == 204
    plan, _ = read_state(bridge, "/plan")
    assert plan["lastPlayedAt"] == "2041-01-01T00:00:00+00:00"
    assert [level["lastPlayedAt"] for level in plan["levels"]] == [
        "2041-01-01T00:00:00+00:00"
    ] * 2
    (tmp_path / "test-clock").write_text("2042-01-01T00:00:00+00:00")
    state["characters"].reverse()
    assert put_state(bridge, "/characters", state, etag)[0] == 204
    assert read_state(bridge, "/plan")[0] == plan


def test_duplicate_preserves_authored_content_and_source_state_after_restart(
    multiple_plans, tmp_path
):
    bridge = multiple_plans

    def call(method, route, body=None):
        headers = {}
        if method == "PUT" and not route.startswith("/sketch"):
            bridge.request("GET", route)
            current = bridge.getresponse()
            headers["If-Match"] = current.getheader("ETag")
            current.read()
        bridge.request(
            method, route, json.dumps(body) if body is not None else None, headers
        )
        response = bridge.getresponse()
        payload = response.read()
        assert response.status in (200, 201, 204)
        return json.loads(payload) if payload else None

    data = json.loads((tmp_path / "library.PROTOTYPE.json").read_text())
    source = data["plans"][0]
    source.update(
        description="Authored building",
        tags=["ship"],
        createdAt="2020-01-01T00:00:00+00:00",
        editedAt="2021-01-01T00:00:00+00:00",
        lastPlayedAt="2022-01-01T00:00:00+00:00",
    )
    source["levels"][1].update(description="Secure stores", tags=["cargo"], order=-1)
    (tmp_path / "library.PROTOTYPE.json").write_text(json.dumps(data))
    model = {
        "walls": [{"id": "wall-a", "a": [0, 0], "b": [6, 0]}],
        "openings": [{"id": "door-a", "wall": "wall-a", "offset": 2, "width": 1}],
    }
    (tmp_path / "below.json").write_text(json.dumps(model))
    characters = {
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
    call("PUT", "/characters", characters)
    exploration = {
        "version": 2,
        "observers": [{"at": [1, 2], "range": 6}],
        "doors": {"door-a": "open"},
        "observations": [{"revision": "historic-layout", "at": [1, 2], "range": 6}],
        "revisions": {"historic-layout": {"name": "Historical authored model"}},
        "visibilityPaused": False,
    }
    call("PUT", "/exploration?level=below", exploration)
    call("PUT", "/sketch?level=below", {"strokes": [[[1, 2], [2, 3]]]})
    before = call("GET", "/plan")
    marks = call("GET", "/sketch?level=below")
    saved_play = call("GET", "/exploration?level=below")
    copy = call("POST", "/duplicate?plan=default")
    assert copy["id"] != before["id"]
    assert copy["description"] == "Authored building"
    assert copy["tags"] == ["ship"]
    assert len(copy["levels"]) == 2
    for level in copy["levels"]:
        assert level["id"] not in ("original", "below")
        assert level["model"] not in ("model.PROTOTYPE.json", "below.json")
        assert level["createdAt"] == copy["createdAt"]
        assert level["editedAt"] == copy["createdAt"]
        assert level["lastPlayedAt"] is None
    assert copy["createdAt"] == copy["editedAt"]
    assert copy["createdAt"] > "2022-01-01"
    assert copy["lastPlayedAt"] is None
    lower = copy["levels"][1]
    assert (lower["description"], lower["tags"], lower["order"]) == (
        "Secure stores",
        ["cargo"],
        -1,
    )
    query = f"?plan={copy['id']}&level={lower['id']}"
    assert call("GET", "/model" + query) == model
    assert call("GET", "/characters" + query) == {"characters": [], "pov": None}
    assert call("GET", "/exploration" + query) == {
        "version": 2,
        "observers": [],
        "observations": [],
        "revisions": {},
        "doors": {},
        "visibilityPaused": True,
    }
    assert call("GET", "/sketch" + query) is None
    assert call("GET", "/plan") == before
    assert call("GET", "/characters") == characters
    assert call("GET", "/exploration?level=below") == saved_play
    assert call("GET", "/sketch?level=below") == marks
    call("PATCH", "/metadata" + query, {"description": "Copy only"})
    (tmp_path / lower["model"]).write_text('{"name":"copy geometry"}')
    assert call("GET", "/model?level=below") == model
    call("PATCH", "/metadata?plan=default&level=below", {"name": "Source only"})
    (tmp_path / "below.json").write_text('{"name":"source geometry"}')
    assert call("GET", "/model" + query) == {"name": "copy geometry"}
    assert (
        call("GET", "/plan?plan=" + copy["id"])["levels"][1]["description"]
        == "Copy only"
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
        reopened = HTTPConnection("127.0.0.1", port, timeout=3)
        reopened.request("GET", "/plan?plan=" + copy["id"])
        persisted = json.loads(reopened.getresponse().read())
        assert persisted["levels"][1]["description"] == "Copy only"
        assert persisted["createdAt"] == copy["createdAt"]
        reopened.request("GET", "/model" + query)
        assert json.loads(reopened.getresponse().read()) == {"name": "copy geometry"}
        reopened.close()
    finally:
        process.terminate()
        process.wait(timeout=5)


@pytest.mark.parametrize("foreign_level", ["original", "below", "unknown-level"])
def test_duplicate_rejects_foreign_character_levels_without_changing_dates(
    multiple_plans, tmp_path, foreign_level
):
    bridge = multiple_plans
    bridge.request("POST", "/duplicate?plan=default")
    response = bridge.getresponse()
    assert response.status == 201
    copy = json.loads(response.read())
    route = "/characters?plan=" + copy["id"]
    before, etag = read_state(bridge, route)
    (tmp_path / "test-clock").write_text("2040-01-01T00:00:00+00:00")
    state = {
        "characters": [
            {
                "id": "scout",
                "name": "Scout",
                "kind": "pc",
                "level": foreign_level,
                "at": [0, 0],
                "range": 6,
            }
        ],
        "pov": "scout",
    }
    bridge.request("PUT", route, json.dumps(state), {"If-Match": etag})
    response = bridge.getresponse()
    assert response.status == 400
    response.read()
    assert read_state(bridge, route)[0] == before
    assert read_state(bridge, "/plan?plan=" + copy["id"])[0] == copy


def test_immediate_duplicate_model_edit_updates_level_and_plan_dates(
    multiple_plans, tmp_path
):
    bridge = multiple_plans
    bridge.request("POST", "/duplicate?plan=default")
    response = bridge.getresponse()
    assert response.status == 201
    copy = json.loads(response.read())
    level = copy["levels"][0]
    assert copy["editedAt"] == level["editedAt"] == "2035-06-07T08:09:10+00:00"
    # Act directly on the authored path returned by POST, before another GET.
    (tmp_path / "test-clock").write_text("2040-01-01T00:00:00+00:00")
    (tmp_path / level["model"]).write_text('{"name":"immediate variation"}')
    changed, _ = read_state(bridge, "/plan?plan=" + copy["id"])
    assert changed["editedAt"] == "2040-01-01T00:00:00+00:00"
    assert changed["levels"][0]["editedAt"] == "2040-01-01T00:00:00+00:00"
    assert changed["levels"][1] == copy["levels"][1]
    assert changed["createdAt"] == copy["createdAt"]
    assert changed["lastPlayedAt"] is None


@pytest.mark.parametrize(
    "bridge",
    [
        {
            "license": "AGPL-3.0-only",
            "definitions": {
                "pilot-seat@1": {
                    "id": "pilot-seat",
                    "version": 1,
                    "name": "Pilot seat",
                    "family": "chair",
                    "aliases": ["flight chair"],
                    "tags": ["seating"],
                    "related": ["acceleration-couch@1"],
                },
                "acceleration-couch@1": {
                    "id": "acceleration-couch",
                    "version": 1,
                    "name": "Acceleration couch",
                    "family": "chair",
                    "aliases": ["G/couch"],
                    "tags": ["seating"],
                    "related": ["pilot-seat@1"],
                },
            },
        }
    ],
    indirect=True,
)
def test_agent_search_distinguishes_aliases_from_related_types(bridge):
    bridge.request("GET", "/components?q=flight%20chair")
    response = bridge.getresponse()
    assert response.status == 200
    result = json.loads(response.read())
    assert [(entry["key"], entry["match"]) for entry in result["entries"]] == [
        ("pilot-seat@1", "exact-alias"),
        ("acceleration-couch@1", "related-type"),
    ]
    assert result["entries"][1]["definition"]["aliases"] == ["G/couch"]


# Characterisation of the bounded discovery implemented with the first browser slice.
def test_agent_search_is_paged_and_selected_definitions_keep_authored_metadata(bridge):
    bridge.request("GET", "/components?q=furniture&limit=1")
    response = bridge.getresponse()
    assert response.status == 200
    first = json.loads(response.read())
    assert first["total"] >= 2
    assert [entry["key"] for entry in first["entries"]] == ["chair@1"]
    bridge.request("GET", "/components?q=furniture&limit=1&offset=1")
    response = bridge.getresponse()
    second = json.loads(response.read())
    assert [entry["key"] for entry in second["entries"]] == ["bed@1"]
    bridge.request("GET", "/components?definition=bed%401")
    response = bridge.getresponse()
    selected = json.loads(response.read())["entries"][0]
    assert selected["definition"]["defaults"] == {"width": 1, "length": 2.25}
    assert selected["definition"]["dimensions"]["status"] == "proposed"
    assert selected["definition"]["license"] == "AGPL-3.0-only"
    assert "CC BY-NC 4.0" in selected["definition"]["provenance"]["reference"]


@pytest.mark.parametrize("query", ["limit=0", "limit=51", "offset=-1", "offset=bad"])
def test_agent_discovery_rejects_invalid_page_requests(bridge, query):
    bridge.request("GET", "/components?" + query)
    response = bridge.getresponse()
    assert response.status == 400
    response.read()


def test_unknown_component_identifier_is_explicit(bridge):
    bridge.request("GET", "/components?definition=unknown%401")
    response = bridge.getresponse()
    assert response.status == 404
    response.read()


COMPONENT_VALIDATION = json.loads(
    (Path(__file__).parent / "fixtures" / "component-validation.json").read_text()
)


@pytest.mark.parametrize("case", COMPONENT_VALIDATION["cases"], ids=lambda c: c["name"])
def test_authored_component_validation_preserves_rejected_saves(bridge, tmp_path, case):
    model = json.loads(json.dumps(COMPONENT_VALIDATION["model"]))
    assert put_state(bridge, "/model", model, "")[0] == 204
    before = read_state(bridge, "/model")
    metadata = read_state(bridge, "/library")
    (tmp_path / "test-clock").write_text("2040-01-01T00:00:00+00:00")
    model["components"][0].update(case.get("instance", {}))
    model["componentDefinitions"]["machinery@1"].update(case.get("definition", {}))
    for key in case.get("omitDefinition", []):
        del model["componentDefinitions"]["machinery@1"][key]
    status, _ = put_state(bridge, "/model", model, before[1] or "")
    assert status == (204 if case["valid"] else 400)
    if not case["valid"]:
        assert read_state(bridge, "/model") == before
        assert read_state(bridge, "/library") == metadata


@pytest.fixture
def registered_component_demo(tmp_path):
    original = {
        "plans": [
            {
                "id": "existing",
                "name": "Existing plan",
                "description": "Keep this history",
                "tags": [],
                "createdAt": "2020-01-01T00:00:00+00:00",
                "editedAt": "2021-01-01T00:00:00+00:00",
                "lastPlayedAt": "2022-01-01T00:00:00+00:00",
                "levels": [
                    {
                        "id": "existing-floor",
                        "name": "Existing floor",
                        "description": "",
                        "tags": [],
                        "model": "existing.json",
                        "createdAt": "2020-01-01T00:00:00+00:00",
                        "editedAt": "2021-01-01T00:00:00+00:00",
                        "lastPlayedAt": "2022-01-01T00:00:00+00:00",
                    }
                ],
            }
        ],
        "modelRevisions": {"existing-history": "keep"},
    }
    library = tmp_path / "library.PROTOTYPE.json"
    library.write_text(json.dumps(original))
    (tmp_path / "existing.json").write_text(
        '{"wallThickness":0.15,"walls":[],"openings":[],"labels":[]}'
    )
    command = Path(__file__).resolve().parents[1] / "scripts/register_component_demo.py"
    subprocess.run([sys.executable, str(command), "--root", str(tmp_path)], check=True)
    registered = json.loads(library.read_text())
    demo = registered["plans"][-1]
    path = tmp_path / demo["levels"][0]["model"]
    model = json.loads(path.read_text())
    model["components"][0]["settings"] = {"width": 1.4, "length": 2.4}
    path.write_text(json.dumps(model))
    return original, demo


def test_registered_demo_immediate_edit_dates_on_first_library_read(
    registered_component_demo, bridge
):
    # Registration and direct authored edit both precede the server's first read.
    original, demo = registered_component_demo
    current, _ = read_state(bridge, "/library?plan=component-demo&level=demo")
    assert current["plans"][0] == original["plans"][0]
    changed = current["plans"][-1]
    assert changed["editedAt"] == "2035-06-07T08:09:10+00:00"
    assert changed["levels"][0]["editedAt"] == "2035-06-07T08:09:10+00:00"
    assert changed["createdAt"] == demo["createdAt"]
    assert changed["levels"][0]["createdAt"] == demo["levels"][0]["createdAt"]
    assert changed["lastPlayedAt"] is None
    assert changed["levels"][0]["lastPlayedAt"] is None
    assert current["modelRevisions"]["existing-history"] == "keep"


def test_vertical_access_families_retain_direction_and_reject_invalid_defaults(bridge):
    model = {
        "wallThickness": 0.2,
        "walls": [],
        "openings": [],
        "labels": [],
        "components": [],
        "componentDefinitions": {},
    }
    for family in ("ceiling-hatch", "iris-valve"):
        for direction in ("up", "down", "up-down"):
            key = f"{family}-{direction}@1"
            model["componentDefinitions"][key] = {
                "id": f"{family}-{direction}",
                "version": 1,
                "name": key,
                "family": family,
                "defaults": {"width": 1, "length": 1, "direction": direction},
                "details": {"profile": "referee-2026-10-11"},
                "blocksSight": False,
            }
            model["components"].append(
                {"id": key, "definition": key, "at": [0, 0], "rotation": 0}
            )
    assert put_state(bridge, "/model", model, "")[0] == 204
    saved = read_state(bridge, "/model")
    assert saved[0]["componentDefinitions"] == model["componentDefinitions"]
    metadata = read_state(bridge, "/library")
    model["componentDefinitions"]["iris-valve-down@1"]["defaults"]["direction"] = (
        "sideways"
    )
    assert put_state(bridge, "/model", model, saved[1] or "")[0] == 400
    assert read_state(bridge, "/model") == saved
    assert read_state(bridge, "/library") == metadata
