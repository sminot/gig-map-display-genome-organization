import pandas as pd

from app.datasets import _contrast_parameter


def _make_contrast(tmp_path, name, parameters):
    d = tmp_path / name / "association"
    d.mkdir(parents=True)
    pd.DataFrame(
        {"parameter": parameters, "feature": [f"Bin {i + 1}" for i in range(len(parameters))]}
    ).to_csv(d / "association.csv", index=False)
    return str(tmp_path / name)


def test_contrast_parameter_is_inferred_not_assumed(tmp_path):
    # A non-"disease" contrast (e.g. the Cuenod invasiveness set) must resolve to
    # its own parameter, not the hardcoded default.
    assert _contrast_parameter(_make_contrast(tmp_path, "a", ["Invasiveness"] * 3)) == "Invasiveness"
    assert _contrast_parameter(_make_contrast(tmp_path, "b", ["disease"] * 3)) == "disease"


def test_contrast_parameter_prefers_disease_when_multiple(tmp_path):
    got = _contrast_parameter(_make_contrast(tmp_path, "c", ["disease", "Invasiveness"]))
    assert got == "disease"
