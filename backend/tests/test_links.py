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
