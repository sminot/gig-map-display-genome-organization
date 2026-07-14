from __future__ import annotations

import pandas as pd
from gig_map_io.helpers.sort_dataframe import sort_dataframe
from pydantic import BaseModel

from ..registry import Context, FunctionSpec, TableResult

PRESENCE_THRESHOLD = 0.5


class Params(BaseModel):
    pangenomeId: str
    bins: list[str]


def _clustered_order(wide: pd.DataFrame) -> tuple[list[str], list[str]]:
    """Return (genomeOrder, binOrder) from hierarchical clustering of the prop matrix."""
    rows = sort_dataframe(wide).index.tolist() if wide.shape[0] > 1 else wide.index.tolist()
    cols = sort_dataframe(wide.T).index.tolist() if wide.shape[1] > 1 else wide.columns.tolist()
    return rows, cols


def run(params: Params, ctx: Context) -> TableResult:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    gc = pg.genome_content
    df = gc.loc[gc["bin"].isin(params.bins), ["bin", "genome", "prop_genes_detected"]].copy()
    if df.empty:
        raise ValueError(f"none of the requested bins were found in {params.pangenomeId}")
    df = df.rename(columns={"prop_genes_detected": "prop"})
    df["present"] = df["prop"] >= PRESENCE_THRESHOLD

    wide = (
        df.pivot_table(index="genome", columns="bin", values="prop", aggfunc="max")
        .fillna(0.0)
    )
    genome_order, bin_order = _clustered_order(wide)

    return TableResult(
        df=df.reset_index(drop=True),
        meta={"binOrder": bin_order, "genomeOrder": genome_order},
    )


SPEC = FunctionSpec(
    id="bin_set_heatmap",
    title="Bin set heatmap",
    category="pangenome",
    description="Long-format presence matrix for a set of bins, with clustered row/column order.",
    model=Params,
    handler=run,
)
