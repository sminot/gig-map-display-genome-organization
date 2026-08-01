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


def test_browse_lists_subdirectories(client, tmp_path):
    (tmp_path / "alpha").mkdir()
    (tmp_path / "beta").mkdir()
    (tmp_path / "a_file.txt").write_text("x")  # files are excluded

    body = client.get("/api/browse", params={"path": str(tmp_path)}).json()
    assert body["path"] == str(tmp_path.resolve())
    assert body["parent"] == str(tmp_path.resolve().parent)
    assert [d["name"] for d in body["dirs"]] == ["alpha", "beta"]
    assert all(d["path"] == str(tmp_path / d["name"]) for d in body["dirs"])


def test_browse_missing_path_is_404(client):
    assert client.get("/api/browse", params={"path": "/no/such/dir/xyz"}).status_code == 404
