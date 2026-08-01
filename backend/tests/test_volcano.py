import pyarrow as pa


def _read(content):
    return pa.ipc.open_stream(pa.BufferReader(content)).read_all().to_pandas()


def test_volcano(client, ids):
    cid = ids["contrast"][0]
    resp = client.post(
        "/api/run/volcano",
        json={"contrastId": cid, "sigThresh": 0.05, "estimateThresh": 0.25},
    )
    assert resp.status_code == 200
    df = _read(resp.content)
    assert set(df.columns) == {
        "feature",
        "estimate",
        "neg_log10_qvalue",
        "qvalue",
        "mean_abund",
        "significance",
    }
    assert len(df) > 0
    # The GvHD R. torques contrast has bins clearing both cutoffs.
    assert (df["significance"] == "significant").any()
