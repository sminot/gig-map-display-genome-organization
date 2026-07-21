def test_output_dir_set_get_and_mkdir(client, tmp_path):
    target = tmp_path / "figs" / "nested"
    assert not target.exists()

    resp = client.put("/api/output-dir", json={"path": str(target)})
    assert resp.status_code == 200
    body = resp.json()
    assert body["exists"] is True
    assert target.is_dir()  # created with mkdir -p

    expected = str(target.expanduser().resolve())
    assert body["path"] == expected

    got = client.get("/api/output-dir").json()
    assert got["path"] == expected
    assert got["exists"] is True


def test_output_dir_rejects_blank_path(client):
    assert client.put("/api/output-dir", json={"path": ""}).status_code == 422
    assert client.put("/api/output-dir", json={"path": "   "}).status_code == 422
