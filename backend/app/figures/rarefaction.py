from __future__ import annotations

import pandas as pd
from pydantic import BaseModel, Field

from ..registry import Context, FigureSpec


class Params(BaseModel):
    pangenomeId: str
    nReps: int = Field(default=10, ge=1, le=100)


def run(params: Params, ctx: Context) -> pd.DataFrame:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    return pg.rarefaction_curve_data(params.nReps)


SPEC = FigureSpec(
    id="rarefaction",
    title="Rarefaction curve",
    category="pangenome",
    description="Genes recovered vs. number of genomes sampled.",
    model=Params,
    handler=run,
)
