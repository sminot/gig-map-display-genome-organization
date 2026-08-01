from __future__ import annotations

import pandas as pd
from pydantic import BaseModel, Field

from ..registry import Context, FigureSpec


class Params(BaseModel):
    pangenomeIds: list[str]
    nReps: int = Field(default=10, ge=1, le=100)


def run(params: Params, ctx: Context) -> pd.DataFrame:
    if not params.pangenomeIds:
        raise ValueError("select at least one pangenome")
    frames = []
    for pid in params.pangenomeIds:
        df = ctx.datasets.pangenome(pid).rarefaction_curve_data(params.nReps).copy()
        df["pangenome"] = ctx.datasets.get(pid).organism  # legend/colour label
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


SPEC = FigureSpec(
    id="rarefaction",
    title="Rarefaction curve",
    category="pangenome",
    description="Genes recovered vs. number of genomes sampled.",
    model=Params,
    handler=run,
)
