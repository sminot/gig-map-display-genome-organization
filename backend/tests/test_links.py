from types import SimpleNamespace

from app import links
from app.registry import Context


class _StubDatasets:
    """Minimal DatasetRegistry stand-in for exercising resolve() directly."""

    def __init__(self, features, bins, organisms):
        self._features = features
        self._bins = bins
        self._organisms = organisms

    def feature_name_set(self, cid):
        return frozenset(self._features[cid])

    def bin_name_set(self, pid):
        return frozenset(self._bins[pid])

    def list(self, type):
        return [SimpleNamespace(id=pid) for pid in self._bins] if type == "pangenome" else []

    def get(self, did):
        return SimpleNamespace(organism=self._organisms.get(did, ""))


def test_exact_set_match_resolves_confidently():
    ds = _StubDatasets(
        features={"c1": {"a", "b"}},
        bins={"p_exact": {"a", "b"}, "p_other": {"a", "b", "c"}},
        organisms={},
    )
    result = links.resolve("c1", Context(datasets=ds))
    assert result["referencePangenomeId"] == "p_exact"
    assert result["ambiguous"] is False
    assert result["candidates"] == ["p_exact"]


def test_count_only_coincidence_stays_ambiguous():
    ds = _StubDatasets(
        features={"c1": {"a", "b"}},
        bins={"p_coincidence": {"x", "y"}},  # same count, different bin names
        organisms={},
    )
    result = links.resolve("c1", Context(datasets=ds))
    assert result["ambiguous"] is True
    assert result["referencePangenomeId"] is None
    assert result["candidates"] == ["p_coincidence"]  # offered, but not confident


def test_unlinkable_contrast_has_empty_candidates():
    ds = _StubDatasets(
        features={"c1": {"a", "b"}},
        bins={"p_big": {"x", "y", "z"}},  # neither set nor count matches
        organisms={},
    )
    result = links.resolve("c1", Context(datasets=ds))
    assert result["ambiguous"] is True
    assert result["referencePangenomeId"] is None
    assert result["candidates"] == []


def test_contrasts_infer_to_pangenome(client, ids):
    pid = ids["pangenome"][0]
    entries = client.get("/api/links").json()
    assert len(entries) == 2
    for entry in entries:
        assert entry["referencePangenomeId"] == pid
        assert entry["ambiguous"] is False
        assert entry["source"] == "inferred"
        assert pid in entry["candidates"]


def test_override_set_get_clear_roundtrip(client, ids):
    pid = ids["pangenome"][0]
    cid = ids["contrast"][0]

    updated = client.put(f"/api/links/{cid}", json={"pangenomeId": pid}).json()
    assert updated["contrastId"] == cid
    assert updated["referencePangenomeId"] == pid
    assert updated["source"] == "user"
    assert updated["ambiguous"] is False

    listed = {e["contrastId"]: e for e in client.get("/api/links").json()}
    assert listed[cid]["source"] == "user"

    reinferred = client.delete(f"/api/links/{cid}").json()
    assert reinferred["source"] == "inferred"
    assert reinferred["referencePangenomeId"] == pid

    listed = {e["contrastId"]: e for e in client.get("/api/links").json()}
    assert listed[cid]["source"] == "inferred"
