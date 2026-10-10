"""Reject malformed HTTP writes without changing saved state or plan history."""

import json

import pytest
from test_server import bridge as bridge
from test_server import dated_play as dated_play
from test_server import multiple_plans as multiple_plans
from test_server import put_state, read_state


def assert_rejected_without_changes(
    connection, method, route, payload, *, read_route=None
):
    """Observe rejection, unchanged saved content/ETag, and all library dates."""
    read_route = read_route or route
    before = read_state(connection, read_route)
    library = read_state(connection, "/library")[0]
    connection.request(method, route, json.dumps(payload), {"If-Match": before[1]})
    response = connection.getresponse()
    status = response.status
    response.read()
    assert status == 400
    assert read_state(connection, read_route) == before
    assert read_state(connection, "/library")[0] == library


@pytest.mark.parametrize("payload", [None, [], "exploration", 2])
def test_exploration_requires_an_object_without_changing_state_or_dates(
    dated_play, payload
):
    assert_rejected_without_changes(dated_play, "PUT", "/exploration", payload)


@pytest.mark.parametrize("field", ["observers", "observations"])
@pytest.mark.parametrize(
    "observer",
    [
        None,
        {"at": [0], "range": 6},
        {"at": [False, 0], "range": 6},
        {"at": [0, 0], "range": "6"},
        {"at": [0, 0], "range": True},
        {"at": [0, 0], "range": 0},
        {"at": [float("inf"), 0], "range": 6},
    ],
)
def test_exploration_rejects_invalid_viewpoints_without_saving_or_recording_play(
    dated_play, field, observer
):
    # Null history entries and infinity already rejected; the other cases were red.
    state = read_state(dated_play, "/exploration")[0]
    if field == "observations" and isinstance(observer, dict):
        observer = {**observer, "revision": "room"}
    state[field] = [observer]
    state["revisions"] = {"room": {"name": "Historical room"}}
    assert_rejected_without_changes(dated_play, "PUT", "/exploration", state)


@pytest.mark.parametrize(
    "update",
    [{"doors": []}, {"doors": {"door": True}}, {"visibilityPaused": "false"}],
)
def test_exploration_rejects_malformed_visibility_controls_without_changing_dates(
    dated_play, update
):
    state = {**read_state(dated_play, "/exploration")[0], **update}
    assert_rejected_without_changes(dated_play, "PUT", "/exploration", state)


@pytest.mark.parametrize("model", [None, [], "historical model"])
def test_observation_requires_an_object_model_snapshot_without_changing_dates(
    dated_play, model
):
    state = read_state(dated_play, "/exploration")[0]
    state.update(
        observations=[{"at": [0, 0], "range": 6, "revision": "room"}],
        revisions={"room": model},
    )
    assert_rejected_without_changes(dated_play, "PUT", "/exploration", state)


@pytest.fixture
def saved_characters(dated_play, tmp_path):
    state, etag = read_state(dated_play, "/characters")
    state.update(
        characters=[
            {
                "id": "ada",
                "name": "Ada",
                "kind": "pc",
                "level": "below",
                "at": [1, 2],
                "range": 6,
            }
        ],
        pov="ada",
    )
    assert put_state(dated_play, "/characters", state, etag)[0] == 204
    (tmp_path / "test-clock").write_text("2040-01-01T00:00:00+00:00")
    return dated_play


@pytest.mark.parametrize("change", [{"at": [True, 0]}, {"range": True}])
def test_character_coordinates_and_range_reject_booleans_without_changing_dates(
    saved_characters, change
):
    state = read_state(saved_characters, "/characters")[0]
    state["characters"][0].update(change)
    assert_rejected_without_changes(saved_characters, "PUT", "/characters", state)


@pytest.fixture
def saved_sketch(dated_play):
    dated_play.request("PUT", "/sketch", json.dumps({"strokes": [[[1, 2], [3, 4]]]}))
    response = dated_play.getresponse()
    assert response.status == 204
    response.read()
    return dated_play


def test_sketch_rejects_boolean_coordinates_without_replacing_marks_or_dates(
    saved_sketch,
):
    assert_rejected_without_changes(
        saved_sketch, "PUT", "/sketch", {"strokes": [[[True, 2]]]}
    )


@pytest.mark.parametrize("reply", [None, [], 42])
def test_sketch_acknowledgement_requires_text_without_changing_marks_or_dates(
    saved_sketch, reply
):
    sketch = read_state(saved_sketch, "/sketch")[0]
    assert_rejected_without_changes(
        saved_sketch,
        "PATCH",
        "/sketch",
        {"submittedAt": sketch["submittedAt"], "status": "applied", "reply": reply},
    )


@pytest.mark.parametrize(
    "change",
    [
        {"level": "foreign"},
        {"kind": "player"},
        {"at": [0]},
        {"at": [float("nan"), 0]},
        {"name": False},
    ],
)
def test_characterise_invalid_characters_preserving_roster_and_all_dates(
    saved_characters, change
):
    state = read_state(saved_characters, "/characters")[0]
    state["characters"][0].update(change)
    assert_rejected_without_changes(saved_characters, "PUT", "/characters", state)


@pytest.mark.parametrize("pov", ["missing", "guard", []])
def test_characterise_pov_requires_a_saved_pc_without_changing_roster_or_dates(
    saved_characters, pov
):
    state = read_state(saved_characters, "/characters")[0]
    state["characters"].append(
        {
            "id": "guard",
            "name": "Guard",
            "kind": "npc",
            "level": "original",
            "at": [0, 0],
            "range": 6,
        }
    )
    state["pov"] = pov
    assert_rejected_without_changes(saved_characters, "PUT", "/characters", state)


@pytest.mark.parametrize("payload", [None, {"characters": [None]}, {"characters": {}}])
def test_characterise_character_state_shapes_preserving_saved_roster_and_dates(
    saved_characters, payload
):
    assert_rejected_without_changes(saved_characters, "PUT", "/characters", payload)


@pytest.mark.parametrize(
    "method, payload",
    [
        ("PUT", []),
        ("PUT", {"strokes": [[]]}),
        ("PUT", {"strokes": [[[0, float("inf")]]]}),
        ("PATCH", []),
        ("PATCH", {"status": "unknown"}),
    ],
)
def test_characterise_sketch_shape_rejection_preserving_marks_and_dates(
    saved_sketch, method, payload
):
    assert_rejected_without_changes(saved_sketch, method, "/sketch", payload)


@pytest.mark.parametrize("query", ["?plan=default", "?plan=default&level=below"])
@pytest.mark.parametrize(
    "payload",
    [
        [],
        {"name": False},
        {"description": []},
        {"tags": ["cargo", None]},
        {"id": "replacement"},
    ],
)
def test_characterise_invalid_metadata_preserving_authored_content_and_dates(
    dated_play, query, payload
):
    assert_rejected_without_changes(
        dated_play, "PATCH", "/metadata" + query, payload, read_route="/plan" + query
    )
