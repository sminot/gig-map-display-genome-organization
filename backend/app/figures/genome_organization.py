from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel

from ..registry import Context, FigureSpec, TableResult

ALIGNMENT_COLUMNS = ["gene", "contig", "genome", "qstart", "qend", "qlen", "pident", "coverage", "bin"]


class Overlay(BaseModel):
    contrastId: str
    stat: str = "signed_log10_qvalue"
    channel: str = "arcColor"  # "arcColor" | "outerTrack"


class Params(BaseModel):
    pangenomeId: str
    referenceGenome: str | None = None
    colorBy: str | None = None
    overlay: Overlay | None = None


def _alignment_table(pg, reference_genome: str | None) -> pd.DataFrame:
    aln = pg.align_genomes.rename(columns={"sseqid": "gene", "qseqid": "contig"})
    df = aln.reindex(columns=ALIGNMENT_COLUMNS).dropna(subset=["bin"])
    if reference_genome is not None:
        df = df.loc[df["genome"] == reference_genome]
    return df.reset_index(drop=True)


def _overlay_by_bin(ctx: Context, overlay: Overlay) -> dict:
    contrast = ctx.datasets.contrast(overlay.contrastId)
    assoc = contrast.association
    stat = overlay.stat
    if stat not in assoc.columns and stat == "signed_log10_qvalue":
        assoc = assoc.assign(
            signed_log10_qvalue=np.sign(assoc["Estimate"]) * assoc["neg_log10_qvalue"]
        )
    if stat not in assoc.columns:
        raise ValueError(f"stat '{stat}' not found in association columns")
    return (
        assoc.dropna(subset=[stat])
        .set_index("feature")[stat]
        .to_dict()
    )


def run(params: Params, ctx: Context) -> TableResult:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    df = _alignment_table(pg, params.referenceGenome)

    contigs = (
        df.groupby(["genome", "contig"])["qlen"]
        .max()
        .reset_index()
        .rename(columns={"qlen": "len"})
        .to_dict(orient="records")
    )
    meta = {
        "genomes": sorted(df["genome"].dropna().unique().tolist()),
        "contigs": contigs,
        "bins": pg.bin_names,
        "colorBy": params.colorBy,
    }
    if params.overlay is not None:
        meta["overlayByBin"] = _overlay_by_bin(ctx, params.overlay)
        meta["overlayChannel"] = params.overlay.channel

    return TableResult(df=df, meta=meta)


SPEC = FigureSpec(
    id="genome_organization",
    title="Genome organization",
    category="pangenome",
    description="Alignment rows for the WebGL genome-organization view, with optional contrast overlay.",
    model=Params,
    handler=run,
)
