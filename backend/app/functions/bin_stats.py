from __future__ import annotations

from pydantic import BaseModel

from ..registry import Context, FunctionSpec


class Params(BaseModel):
    contrastId: str
    bin: str
    metadataCol: str
    refGroup: str
    compGroup: str


def run(params: Params, ctx: Context) -> dict:
    contrast = ctx.datasets.contrast(params.contrastId)
    common = dict(
        metadata_col=params.metadataCol,
        ref_group=params.refGroup,
        comp_group=params.compGroup,
        bin_id=params.bin,
    )
    return {
        "auc": contrast.calc_auc(**common),
        "oddsRatio": contrast.calc_odds_ratio(**common),
        "logistic": contrast.calc_logistic_regression(**common),
    }


SPEC = FunctionSpec(
    id="bin_stats",
    title="Bin statistics",
    category="contrast",
    description="AUC, odds ratio, and logistic regression for one bin against a metadata grouping.",
    model=Params,
    handler=run,
)
