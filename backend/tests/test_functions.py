import pyarrow as pa

ARROW_MEDIA_TYPE = "application/vnd.apache.arrow.stream"


def read_arrow(content: bytes):
    return pa.ipc.open_stream(pa.BufferReader(content)).read_all().to_pandas()


def test_functions_listed(client):
    functions = client.get("/api/functions").json()
    ids = {f["id"] for f in functions}
    required = {
        "genome_organization",
        "compare_contrasts",
        "bin_to_genomes",
        "bin_set_heatmap",
        "synteny_layout",
        "phylogeny_vs_core",
        "core_genome",
    }
    assert required <= ids


def test_core_genome_returns_bin_4(client, ids):
    pid = ids["pangenome"][0]
    result = client.post("/api/run/core_genome", json={"pangenomeId": pid}).json()
    assert result["coreBin"] == "Bin 4"
    assert result["nGenomes"] == 28
    assert result["nGenes"] == 374
    assert len(result["ranking"]) == 168


def test_genome_organization_arrow_roundtrip_and_meta(client, ids):
    pid = ids["pangenome"][0]
    resp = client.post("/api/run/genome_organization", json={"pangenomeId": pid})
    assert resp.headers["content-type"] == ARROW_MEDIA_TYPE
    df = read_arrow(resp.content)
    assert len(df) > 0
    assert list(df.columns) == [
        "gene", "contig", "genome", "qstart", "qend", "qlen", "pident", "coverage", "bin",
    ]

    meta = client.post("/api/run/genome_organization/meta", json={"pangenomeId": pid}).json()
    assert len(meta["genomes"]) == 29
    assert len(meta["contigs"]) > 0
    assert set(meta["contigs"][0]) == {"genome", "contig", "len"}


def test_genome_organization_overlay(client, ids):
    pid = ids["pangenome"][0]
    cid = ids["contrast"][0]
    meta = client.post(
        "/api/run/genome_organization/meta",
        json={"pangenomeId": pid, "overlay": {"contrastId": cid, "stat": "signed_log10_qvalue"}},
    ).json()
    assert meta["overlayByBin"]
    assert "Bin 4" in meta["overlayByBin"]


def test_bin_to_genomes_arrow(client, ids):
    pid = ids["pangenome"][0]
    resp = client.post("/api/run/bin_to_genomes", json={"pangenomeId": pid, "bin": "Bin 4"})
    assert resp.headers["content-type"] == ARROW_MEDIA_TYPE
    df = read_arrow(resp.content)
    assert len(df) > 0
    assert {"genome", "n_genes_detected", "prop_genes_detected", "present"} == set(df.columns)


def test_bin_set_heatmap_arrow_and_meta(client, ids):
    pid = ids["pangenome"][0]
    body = {"pangenomeId": pid, "bins": ["Bin 4", "Bin 25", "Bin 111"]}
    resp = client.post("/api/run/bin_set_heatmap", json=body)
    df = read_arrow(resp.content)
    assert {"bin", "genome", "prop", "present"} == set(df.columns)

    meta = client.post("/api/run/bin_set_heatmap/meta", json=body).json()
    assert set(meta["binOrder"]) == {"Bin 4", "Bin 25", "Bin 111"}
    assert len(meta["genomeOrder"]) > 0


def test_synteny_layout_json(client, ids):
    pid = ids["pangenome"][0]
    result = client.post("/api/run/synteny_layout", json={"pangenomeId": pid, "bin": "Bin 4"}).json()
    assert len(result["genes"]) > 0
    assert set(result["genes"][0]) == {"gene_id", "label", "start", "stop", "dir", "group"}
    assert result["length"] > 0


def test_phylogeny_vs_core_json(client, ids):
    pid = ids["pangenome"][0]
    phid = ids["phylogenies"][0]
    result = client.post(
        "/api/run/phylogeny_vs_core",
        json={"pangenomeId": pid, "phylogenyId": phid, "bin": "Bin 8"},
    ).json()
    assert result["coreBin"] == "Bin 4"
    assert result["binNewick"].strip().endswith(";")
    assert result["coreNewick"].strip().endswith(";")
    assert result["sharedLeaves"] >= 3
    assert len(result["binLayout"]["nodes"]) > 0
    assert len(result["binLayout"]["links"]) > 0


def test_compare_contrasts_json(client, ids):
    base, comparator = ids["contrast"]
    result = client.post(
        "/api/run/compare_contrasts",
        json={"baseContrastIds": [base], "comparatorContrastIds": [comparator]},
    ).json()
    assert len(result["matches"]) == 1
    assert result["matches"][0]["organism"] == "Ruminococcus torques"
    assert len(result["categories"]["matrix"]) == 3
    assert len(result["scatter"]) > 0
    assert set(result["scatter"][0]) == {"organism", "feature", "base", "comparator"}


def test_csv_export(client, ids):
    pid = ids["pangenome"][0]
    resp = client.post(
        "/api/run/bin_to_genomes",
        params={"format": "csv"},
        json={"pangenomeId": pid, "bin": "Bin 4"},
    )
    assert resp.headers["content-type"].startswith("text/csv")
    assert "genome" in resp.text.splitlines()[0]


def test_bonus_rarefaction_and_histogram(client, ids):
    pid = ids["pangenome"][0]
    rf = read_arrow(client.post("/api/run/rarefaction", json={"pangenomeId": pid, "nReps": 3}).content)
    assert len(rf) == 29
    hist = read_arrow(client.post("/api/run/bin_size_histogram", json={"pangenomeId": pid}).content)
    assert len(hist) > 0
