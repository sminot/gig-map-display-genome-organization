def test_type_inference_classifies_four_fixtures(client):
    datasets = client.get("/api/datasets").json()
    by_type: dict[str, int] = {}
    for d in datasets:
        by_type[d["type"]] = by_type.get(d["type"], 0) + 1

    assert by_type.get("pangenome") == 1
    assert by_type.get("contrast") == 2
    assert by_type.get("phylogenies") == 1
    assert by_type.get("unknown", 0) == 0


def test_organism_parsed_for_matching(client):
    datasets = client.get("/api/datasets").json()
    assert all(d["organism"] == "Ruminococcus torques" for d in datasets)


def test_type_filter(client, ids):
    pangenomes = client.get("/api/datasets", params={"type": "pangenome"}).json()
    assert len(pangenomes) == 1
    assert pangenomes[0]["type"] == "pangenome"


def test_dataset_detail_counts(client, ids):
    pid = ids["pangenome"][0]
    detail = client.get(f"/api/datasets/{pid}").json()
    assert detail["counts"] == {"bins": 168, "genomes": 29, "genes": 5824}


def test_bins_and_genomes_endpoints(client, ids):
    pid = ids["pangenome"][0]
    bins = client.get(f"/api/datasets/{pid}/bins").json()
    assert len(bins) == 168
    assert {"bin", "n_genes", "n_genomes"} <= set(bins[0])

    genomes = client.get(f"/api/datasets/{pid}/genomes").json()
    assert len(genomes) == 29
