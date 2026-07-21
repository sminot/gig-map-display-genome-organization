def test_bin_dossier_bin_4(client, ids):
    pid = ids["pangenome"][0]
    dossier = client.get(f"/api/pangenome/{pid}/bin/Bin 4").json()

    assert dossier["bin"] == "Bin 4"
    assert dossier["pangenomeId"] == pid
    assert dossier["nGenes"] == 374
    assert dossier["isCore"] is True
    assert dossier["totalGenomes"] == 29
    assert len(dossier["presence"]) > 0

    assert len(dossier["contrasts"]) == 2
    for c in dossier["contrasts"]:
        assert isinstance(c["estimate"], float)

    assert len(dossier["enrichedTerms"]) > 0


def test_bin_dossier_missing_bin_404(client, ids):
    pid = ids["pangenome"][0]
    resp = client.get(f"/api/pangenome/{pid}/bin/Bin 9999")
    assert resp.status_code == 404
