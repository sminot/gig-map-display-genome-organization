from __future__ import annotations

import pandas as pd
from gig_map_io import Pangenome
from pydantic import BaseModel, Field

from ..registry import Context, FigureSpec

DEFAULT_PROP_THRESHOLD = 0.9


class Params(BaseModel):
    pangenomeId: str
    propThreshold: float = Field(default=DEFAULT_PROP_THRESHOLD, ge=0.0, le=1.0)


def core_genome_ranking(pg: Pangenome, prop_threshold: float) -> pd.DataFrame:
    """Rank bins by number of genomes detected above threshold, tie-broken by bin size."""
    gc = pg.genome_content
    n_genomes = (
        gc.loc[gc["prop_genes_detected"] >= prop_threshold]
        .groupby("bin")["genome"]
        .nunique()
    )
    ranking = (
        pd.DataFrame({"n_genomes": n_genomes})
        .reset_index()
        .assign(n_genes=lambda d: d["bin"].map(pg.bin_size).astype(int))
        .sort_values(["n_genomes", "n_genes"], ascending=False)
        .reset_index(drop=True)
    )
    return ranking


def core_bin(pg: Pangenome, prop_threshold: float = DEFAULT_PROP_THRESHOLD) -> str:
    return core_genome_ranking(pg, prop_threshold).iloc[0]["bin"]


def run(params: Params, ctx: Context) -> dict:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    ranking = core_genome_ranking(pg, params.propThreshold)
    top = ranking.iloc[0]
    return {
        "coreBin": top["bin"],
        "nGenomes": int(top["n_genomes"]),
        "nGenes": int(top["n_genes"]),
        "ranking": ranking.to_dict(orient="records"),
    }


SPEC = FigureSpec(
    id="core_genome",
    title="Core genome",
    category="pangenome",
    description="Identify the core-genome bin (present across the most genomes).",
    model=Params,
    handler=run,
)
