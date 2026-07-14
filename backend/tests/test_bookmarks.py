def test_bookmark_post_get_delete(client):
    payload = {"functionId": "core_genome", "title": "core view", "params": {"pangenomeId": "x"}}

    created = client.post("/api/bookmarks", json=payload).json()
    assert created["id"]
    assert created["functionId"] == "core_genome"
    assert created["createdAt"]

    listed = client.get("/api/bookmarks").json()
    assert any(b["id"] == created["id"] for b in listed)

    deleted = client.delete(f"/api/bookmarks/{created['id']}").json()
    assert deleted["deleted"] == created["id"]

    remaining = client.get("/api/bookmarks").json()
    assert all(b["id"] != created["id"] for b in remaining)

    assert client.delete(f"/api/bookmarks/{created['id']}").status_code == 404
