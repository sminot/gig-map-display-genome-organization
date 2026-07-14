import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DATASETS = REPO_ROOT / "datasets"


@pytest.fixture(scope="session", autouse=True)
def _env(tmp_path_factory):
    os.environ["DATASETS_DIR"] = str(FIXTURE_DATASETS)
    os.environ["SESSION_DIR"] = str(tmp_path_factory.mktemp("session"))
    yield


@pytest.fixture(scope="session")
def client(_env):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture(scope="session")
def ids(client):
    """Map dataset type -> first dataset id from the fixture."""
    datasets = client.get("/api/datasets").json()
    by_type: dict[str, list[str]] = {}
    for d in datasets:
        by_type.setdefault(d["type"], []).append(d["id"])
    return by_type
