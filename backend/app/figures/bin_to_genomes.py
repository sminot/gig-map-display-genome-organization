from __future__ import annotations

import pandas as pd
from pydantic import BaseModel

from ..registry import Context, FigureSpec

PRESENCE_THRESHOLD = 0.5


class Params(BaseModel):
    pangenomeId: str
    bin: str


def run(params: Params, ctx: Context) -> pd.DataFrame:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    gc = pg.genome_content
    df = gc.loc[gc["bin"] == params.bin, ["genome", "n_genes_detected", "prop_genes_detected"]].copy()
    if df.empty:
        raise ValueError(f"bin '{params.bin}' not found in pangenome {params.pangenomeId}")
    df["present"] = df["prop_genes_detected"] >= PRESENCE_THRESHOLD
    return df.reset_index(drop=True)


SPEC = FigureSpec(
    id="bin_to_genomes",
    title="Bin to genomes",
    category="pangenome",
    description="Per-genome detection of a single bin.",
    model=Params,
    handler=run,
)
