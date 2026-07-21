from app import output_dir

FAKE_PNG = b"\x89PNG\r\n\x1a\nfake-png-bytes"


def test_figures_require_output_dir(client):
    # No output dir set yet: list is empty, writes are refused with 409.
    output_dir._config_path().unlink(missing_ok=True)

    assert client.get("/api/figures").json() == []

    resp = client.post(
        "/api/figures",
        data={"figureType": "core_genome", "title": "x", "params": "{}"},
    )
    assert resp.status_code == 409
    assert client.delete("/api/figures/deadbeef").status_code == 409


def test_figure_save_list_image_delete(client, tmp_path):
    out = tmp_path / "output"
    client.put("/api/output-dir", json={"path": str(out)})

    resp = client.post(
        "/api/figures",
        data={
            "figureType": "core_genome",
            "title": "Core view",
            "params": '{"pangenomeId": "abc"}',
        },
        files={"image_png": ("fig.png", FAKE_PNG, "image/png")},
    )
    assert resp.status_code == 201
    record = resp.json()
    fid = record["id"]
    assert fid.isalnum()
    assert record["figureType"] == "core_genome"
    assert record["title"] == "Core view"
    assert record["params"] == {"pangenomeId": "abc"}
    assert record["createdAt"]
    assert record["images"] == [{"format": "png", "filename": f"{fid}.png"}]

    # Record and image live in the output dir, not SESSION_DIR.
    assert (out / f"{fid}.json").exists()
    assert (out / f"{fid}.png").read_bytes() == FAKE_PNG

    listed = client.get("/api/figures").json()
    assert any(r["id"] == fid for r in listed)

    img = client.get(f"/api/figures/{fid}/image", params={"format": "png"})
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content == FAKE_PNG

    # No SVG was uploaded for this record.
    assert client.get(f"/api/figures/{fid}/image", params={"format": "svg"}).status_code == 404

    deleted = client.delete(f"/api/figures/{fid}").json()
    assert deleted["deleted"] == fid
    assert not (out / f"{fid}.json").exists()
    assert not (out / f"{fid}.png").exists()
    assert client.delete(f"/api/figures/{fid}").status_code == 404


def test_figures_list_skips_unrelated_json(client, tmp_path):
    out = tmp_path / "mixed"
    client.put("/api/output-dir", json={"path": str(out)})

    resp = client.post(
        "/api/figures",
        data={"figureType": "core_genome", "title": "t", "params": "{}"},
        files={"image_svg": ("fig.svg", b"<svg/>", "image/svg+xml")},
    )
    fid = resp.json()["id"]

    (out / "not-a-record.json").write_text('{"hello": "world"}')
    (out / "broken.json").write_text("{ not json")

    listed = client.get("/api/figures").json()
    assert [r["id"] for r in listed] == [fid]

    svg = client.get(f"/api/figures/{fid}/image", params={"format": "svg"})
    assert svg.status_code == 200
    assert svg.headers["content-type"] == "image/svg+xml"
