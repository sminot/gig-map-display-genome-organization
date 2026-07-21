"""FastAPI app: dataset browsing, analysis functions, output dir, and figure records."""

from __future__ import annotations

import json
import os

import pandas as pd
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import bin_dossier, figures_store, links, output_dir
from .datasets import DatasetRegistry
from .registry import Context, TableResult, build_registry
from .serialization import json_response, tabular_response

app = FastAPI(title="gig-map figure generator API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

datasets = DatasetRegistry()
figures = build_registry()
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
            for s in figures.values()
        ]
    )


def _invoke(function_id: str, params: dict):
    spec = figures.get(function_id)
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


@app.get("/api/output-dir")
def get_output_dir():
    path = output_dir.get_output_dir()
    exists = path is not None and os.path.isdir(path)
    return json_response({"path": path, "exists": exists})


@app.put("/api/output-dir")
def put_output_dir(payload: dict = Body(...)):
    path = payload.get("path")
    if not isinstance(path, str) or not path.strip():
        raise HTTPException(status_code=422, detail="path must be a non-empty string")
    resolved = output_dir.set_output_dir(path.strip())
    return json_response({"path": resolved, "exists": os.path.isdir(resolved)})


@app.get("/api/figures")
def list_figures():
    return json_response(figures_store.list_all())


@app.post("/api/figures")
async def post_figure(
    figureType: str = Form(...),
    title: str = Form(...),
    params: str = Form(...),
    image_png: UploadFile | None = File(default=None),
    image_svg: UploadFile | None = File(default=None),
):
    try:
        parsed_params = json.loads(params)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="params must be valid JSON")
    images: dict[str, bytes] = {}
    if image_png is not None:
        images["png"] = await image_png.read()
    if image_svg is not None:
        images["svg"] = await image_svg.read()
    try:
        record = figures_store.create(figureType, title, parsed_params, images)
    except figures_store.NoOutputDir as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    response = json_response(record)
    response.status_code = 201
    return response


@app.delete("/api/figures/{figure_id}")
def delete_figure(figure_id: str):
    try:
        figures_store.delete(figure_id)
    except figures_store.NoOutputDir as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="figure not found")
    return json_response({"deleted": figure_id})


@app.get("/api/figures/{figure_id}/image")
def get_figure_image(figure_id: str, format: str = Query(...)):
    if format not in figures_store.MEDIA_TYPES:
        raise HTTPException(status_code=422, detail="format must be png or svg")
    try:
        path = figures_store.image_path(figure_id, format)
    except figures_store.NoOutputDir as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="image not found")
    return FileResponse(path, media_type=figures_store.MEDIA_TYPES[format])


@app.get("/api/links")
def get_links():
    return json_response(links.resolve_all(ctx))


@app.put("/api/links/{contrast_id}")
def put_link(contrast_id: str, payload: links.LinkUpdate):
    try:
        datasets.require(contrast_id, "contrast")
        datasets.require(payload.pangenomeId, "pangenome")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    links.set_override(contrast_id, payload.pangenomeId)
    return json_response(links.resolve(contrast_id, ctx))


@app.delete("/api/links/{contrast_id}")
def delete_link(contrast_id: str):
    try:
        datasets.require(contrast_id, "contrast")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    links.clear_override(contrast_id)
    return json_response(links.resolve(contrast_id, ctx))


@app.get("/api/pangenome/{pangenome_id}/bin/{bin}")
def get_bin_dossier(pangenome_id: str, bin: str):
    try:
        payload = bin_dossier.build(pangenome_id, bin, ctx)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return json_response(payload)


_frontend_dist = os.environ.get("FRONTEND_DIST")
if _frontend_dist and os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
