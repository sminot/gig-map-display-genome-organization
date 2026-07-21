from __future__ import annotations

from pydantic import BaseModel

from ..registry import Context, FigureSpec


class Params(BaseModel):
    contrastId: str
    bin: str
    metadataCol: str
    refGroup: str
    compGroup: str


def _coerce_group(contrast, metadata_col: str, value: str):
    """Match an incoming string param to a metadata value of the column's real dtype.

    Metadata columns may be int/float/str (e.g. ``disease`` is int64 0/1), so a raw
    string never matches. Pick the actual column value whose ``str()`` equals ``value``.
    """
    values = contrast.metadata[metadata_col].dropna().unique()
    for v in values:
        if str(v) == value:
            return v
    return value


def run(params: Params, ctx: Context) -> dict:
    contrast = ctx.datasets.contrast(params.contrastId)
    common = dict(
        metadata_col=params.metadataCol,
        ref_group=_coerce_group(contrast, params.metadataCol, params.refGroup),
        comp_group=_coerce_group(contrast, params.metadataCol, params.compGroup),
        bin_id=params.bin,
    )
    return {
        "auc": contrast.calc_auc(**common),
        "oddsRatio": contrast.calc_odds_ratio(**common),
        "logistic": contrast.calc_logistic_regression(**common),
    }


SPEC = FigureSpec(
    id="bin_stats",
    title="Bin statistics",
    category="contrast",
    description="AUC, odds ratio, and logistic regression for one bin against a metadata grouping.",
    model=Params,
    handler=run,
)
