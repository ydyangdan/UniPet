import time

from unipet.bridge import PetStore
from unipet.protocol import PetEvent


def test_store_uses_priority_for_active_pet():
    store = PetStore()
    store.apply(PetEvent("hermes", "Hermes", "running", "working"))
    store.apply(PetEvent("hermes-wait", "Hermes", "waiting", "needs input"))

    assert store.active_state() == "waiting"
    assert store.active_pet()["source_id"] == "hermes-wait"


def test_store_expires_ttl_events():
    store = PetStore()
    store.apply(PetEvent("hermes", "Hermes", "running", "temporary", ttl_ms=100))
    assert store.active_state() == "running"

    time.sleep(0.15)

    assert store.snapshot() == []
    assert store.active_state() == "idle"
