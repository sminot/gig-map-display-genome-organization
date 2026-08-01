from __future__ import annotations

import pandas as pd
from pydantic import BaseModel, Field

from ..registry import Context, FigureSpec


class Params(BaseModel):
    contrastId: str
    sigThresh: float = Field(default=0.05, gt=0, le=1)
    estimateThresh: float = Field(default=0.25, ge=0)


def run(params: Params, ctx: Context) -> pd.DataFrame:
    assoc = ctx.datasets.contrast(params.contrastId).association
    df = pd.DataFrame(
        {
            "feature": assoc["feature"].astype(str),
            "estimate": assoc["Estimate"].astype(float),
            "neg_log10_qvalue": assoc["neg_log10_qvalue"].astype(float),
            "qvalue": assoc["qvalue"].astype(float),
            "mean_abund": (
                assoc["mean_abund"].astype(float) if "mean_abund" in assoc.columns else 1.0
            ),
        }
    )
    # A bin is called significant when it clears both the FDR and effect-size cutoffs.
    sig = (df["qvalue"] <= params.sigThresh) & (df["estimate"].abs() >= params.estimateThresh)
    df["significance"] = sig.map({True: "significant", False: "n.s."})
    return df.reset_index(drop=True)


SPEC = FigureSpec(
    id="volcano",
    title="Volcano",
    category="contrast",
    description="Per-bin association effect size vs. significance for one contrast.",
    model=Params,
    handler=run,
)
