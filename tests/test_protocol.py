from unipet.protocol import normalize_event, normalize_state


def test_codex_states_are_preserved():
    for state in ["idle", "running", "waiting", "failed", "review"]:
        assert normalize_state(state) == state


def test_non_codex_success_maps_to_review():
    assert normalize_state("success") == "review"
    assert normalize_state("done") == "review"


def test_event_accepts_label_and_ttl():
    event = normalize_event({
        "protocol": "unipet.v1",
        "source_id": "hermes",
        "label": "Hermes",
        "state": "running",
        "message": "working",
        "ttl_ms": 120000,
    })

    assert event.source_id == "hermes"
    assert event.label == "Hermes"
    assert event.state == "running"
    assert event.ttl_ms == 120000
