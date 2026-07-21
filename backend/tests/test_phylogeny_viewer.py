import pytest

PHYLOGENIES_ID = "phylogenies-ruminococcus-torques-n-29-b1bc07"


def test_phylogeny_viewer_returns_newick(client, ids):
    phid = ids["phylogenies"][0]
    bins = client.get(f"/api/datasets/{phid}/bins").json()
    a_bin = bins[0]["bin"]

    result = client.post(
        "/api/run/phylogeny_viewer",
        json={"phylogenyId": phid, "bin": a_bin},
    ).json()

    assert result["bin"] == a_bin
    newick = result["newick"].strip()
    assert newick.startswith("(")
    assert newick.endswith(";")
    assert result["nLeaves"] > 0


def test_phylogeny_viewer_missing_bin_raises():
    from app.datasets import DatasetRegistry
    from app.figures.phylogeny_viewer import Params, run
    from app.registry import Context

    ctx = Context(datasets=DatasetRegistry())
    with pytest.raises(ValueError):
        run(Params(phylogenyId=PHYLOGENIES_ID, bin="Bin 99999"), ctx)


def test_phylogenies_bins_endpoint(client, ids):
    phid = ids["phylogenies"][0]
    bins = client.get(f"/api/datasets/{phid}/bins").json()
    assert isinstance(bins, list)
    assert len(bins) > 0
    assert set(bins[0]) == {"bin", "n_genes", "n_genomes"}
