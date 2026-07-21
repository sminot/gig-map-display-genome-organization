CONTRAST_ID = "contrast-gvhd-cohorts-ruminococcus-torques-n-29-disease-regress-941647"


def _run(client):
    return client.post(
        "/api/run/bin_classifier",
        json={"contrastId": CONTRAST_ID, "labelColumn": "disease"},
    ).json()


def test_bin_classifier_shape(client):
    result = _run(client)

    assert result["label"] == "disease"
    assert result["task"] == "binary"
    assert result["nSamples"] == result["nPositive"] + result["nNegative"]

    metrics = result["metrics"]
    assert set(metrics) == {
        "accuracy",
        "precision",
        "recall",
        "f1",
        "rocAuc",
        "cvRocAucMean",
        "cvRocAucStd",
    }
    assert isinstance(metrics["rocAuc"], float)
    assert 0.0 <= metrics["rocAuc"] <= 1.0

    assert result["importance"], "importance must be non-empty"
    assert set(result["importance"][0]) == {"feature", "gain", "meanAbsShap"}

    conf = result["confusion"]
    test_size = conf["tn"] + conf["fp"] + conf["fn"] + conf["tp"]
    assert test_size == round(result["nSamples"] * 0.25)


def test_bin_classifier_deterministic(client):
    first = _run(client)
    second = _run(client)
    assert first["metrics"]["rocAuc"] == second["metrics"]["rocAuc"]
