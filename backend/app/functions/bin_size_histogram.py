from __future__ import annotations

import pandas as pd
from pydantic import BaseModel, Field

from ..registry import Context, FunctionSpec


class Params(BaseModel):
    pangenomeId: str
    bins: int = Field(default=30, ge=1, le=200)


def run(params: Params, ctx: Context) -> pd.DataFrame:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    return pg.bin_size_df(params.bins)


SPEC = FunctionSpec(
    id="bin_size_histogram",
    title="Bin size histogram",
    category="pangenome",
    description="Distribution of total gene content across bin sizes.",
    model=Params,
    handler=run,
)
