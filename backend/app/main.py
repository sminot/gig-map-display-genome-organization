"""FastAPI app: dataset browsing, analysis functions, and session bookmarks."""

from __future__ import annotations

import os

import pandas as pd
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import session
from .datasets import DatasetRegistry
from .registry import Context, TableResult, build_registry
from .serialization import json_response, tabular_response

app = FastAPI(title="Pangenome Explorer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

datasets = DatasetRegistry()
functions = build_registry()
ctx = Context(datasets=datasets)


def _dataset_payload(info) -> dict:
    return {
        "id": info.id,
        "name": info.name,
        "type": info.type,
        "organism": info.organism,
        "path": info.path,
        "source": info.source,
    }


@app.get("/api/datasets")
def list_datasets(type: str | None = Query(default=None)):
    return json_response([_dataset_payload(d) for d in datasets.list(type)])


@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: str):
    try:
        info = datasets.get(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")
    payload = _dataset_payload(info)
    if info.type == "pangenome":
        pg = datasets.pangenome(dataset_id)
        payload["counts"] = {"bins": pg.n_bins, "genomes": pg.n_genomes, "genes": pg.n_genes}
    elif info.type == "contrast":
        cm = datasets.contrast(dataset_id)
        payload["counts"] = {"features": int(cm.association.shape[0]), "samples": cm.n_samples}
    return json_response(payload)


@app.get("/api/datasets/{dataset_id}/bins")
def get_bins(dataset_id: str):
    try:
        pg = datasets.pangenome(dataset_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    n_genomes = (
        pg.genome_content.loc[pg.genome_content["prop_genes_detected"] >= 0.5]
        .groupby("bin")["genome"]
        .nunique()
    )
    rows = [
        {"bin": b, "n_genes": int(pg.bin_size.get(b, 0)), "n_genomes": int(n_genomes.get(b, 0))}
        for b in pg.bin_names
    ]
    return json_response(rows)


@app.get("/api/datasets/{dataset_id}/genomes")
def get_genomes(dataset_id: str):
    try:
        pg = datasets.pangenome(dataset_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    meta_cols = ["genome", "organism_organismName", "assemblyInfo_biosample_strain"]
    gc = pg.genome_content
    cols = [c for c in meta_cols if c in gc.columns]
    genomes = (
        gc.reindex(columns=cols)
        .dropna(subset=["genome"])
        .drop_duplicates(subset=["genome"])
        .to_dict(orient="records")
    )
    return json_response(genomes)


@app.get("/api/functions")
def list_functions():
    return json_response(
        [
            {"id": s.id, "title": s.title, "category": s.category, "description": s.description}
            for s in functions.values()
        ]
    )


def _invoke(function_id: str, params: dict):
    spec = functions.get(function_id)
    if spec is None:
        raise HTTPException(status_code=404, detail="unknown function")
    try:
        model = spec.model(**params)
    except Exception as exc:  # pydantic validation error at the request boundary
        raise HTTPException(status_code=422, detail=str(exc))
    return spec.handler(model, ctx)


@app.post("/api/run/{function_id}")
def run_function(
    function_id: str,
    params: dict = Body(default={}),
    format: str | None = Query(default=None),
):
    result = _invoke(function_id, params)
    if isinstance(result, TableResult):
        response = tabular_response(result.df, format)
        if result.meta is not None:
            response.headers["X-Has-Meta"] = "true"
        return response
    if isinstance(result, pd.DataFrame):
        return tabular_response(result, format)
    return json_response(result)


@app.post("/api/run/{function_id}/meta")
def run_function_meta(function_id: str, params: dict = Body(default={})):
    result = _invoke(function_id, params)
    if not isinstance(result, TableResult) or result.meta is None:
        raise HTTPException(status_code=404, detail="function has no metadata sidecar")
    return json_response(result.meta)


@app.get("/api/bookmarks")
def get_bookmarks():
    return json_response([b.model_dump() for b in session.list_all()])


@app.post("/api/bookmarks")
def post_bookmark(payload: session.BookmarkCreate):
    return json_response(session.create(payload).model_dump())


@app.delete("/api/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: str):
    try:
        session.delete(bookmark_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="bookmark not found")
    return json_response({"deleted": bookmark_id})


_frontend_dist = os.environ.get("FRONTEND_DIST")
if _frontend_dist and os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
