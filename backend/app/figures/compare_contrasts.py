from __future__ import annotations

from gig_map_io import ContrastMetagenomesSet
from gig_map_io.models.contrast_metagenomes_set import _add_sig_categories
from pydantic import BaseModel
from scipy import stats

from ..registry import Context, FigureSpec

SIG_LEVELS = ["<", "=", ">"]


# The user picks a value type; p/q-value are plotted as the signed -log10 transform.
_VALUE_COLUMN = {
    "Estimate": "Estimate",
    "p-value": "signed_log10_pvalue",
    "q-value": "signed_log10_qvalue",
}


class Params(BaseModel):
    baseContrastIds: list[str]
    comparatorContrastIds: list[str]
    value: str = "q-value"
    fdr: bool = True
    sigThresh: float = 0.2
    estimateThresh: float = 0.25


def _match_by_organism(ctx: Context, base_ids: list[str], comparator_ids: list[str]) -> list[dict]:
    comp_by_org: dict[str, str] = {}
    for cid in comparator_ids:
        comp_by_org.setdefault(ctx.datasets.require(cid, "contrast").organism, cid)
    matches = []
    for bid in base_ids:
        organism = ctx.datasets.require(bid, "contrast").organism
        comparator_id = comp_by_org.get(organism)
        if comparator_id is not None:
            matches.append({"organism": organism, "baseId": bid, "comparatorId": comparator_id})
    return matches


def _contrast_set(ctx: Context, id_by_organism: dict[str, str]) -> ContrastMetagenomesSet:
    dirs = {
        organism: str(ctx.datasets.require(cid, "contrast").data_dir)
        for organism, cid in id_by_organism.items()
    }
    # A set shares one association parameter; infer it rather than assume "disease".
    params = {ctx.datasets.contrast_parameter(cid) for cid in id_by_organism.values()}
    if len(params) > 1:
        raise ValueError(
            f"selected contrasts test different parameters ({', '.join(sorted(params))}); "
            "choose contrasts that share one"
        )
    return ContrastMetagenomesSet(dirs, params.pop())


def _chi2_and_categories(merged, fdr: bool, sig_thresh: float, estimate_thresh: float):
    cat = _add_sig_categories(merged, fdr, sig_thresh, estimate_thresh)
    sig_table = (
        cat.pivot_table(columns="self_sig", index="comparitor_sig", values="feature", aggfunc="count", fill_value=0)
        .reindex(index=SIG_LEVELS, columns=SIG_LEVELS)
        .fillna(0)
        .astype(int)
    )
    categories = {"self": SIG_LEVELS, "comparitor": SIG_LEVELS, "matrix": sig_table.values.tolist()}
    try:
        chi2, p, dof, _ = stats.chi2_contingency(sig_table)
        chi2_result = {"stat": float(chi2), "p": float(p), "dof": int(dof)}
    except ValueError:
        # Degenerate contingency table (a zero marginal); no test is defined.
        chi2_result = {"stat": None, "p": None, "dof": None}
    return chi2_result, categories


def run(params: Params, ctx: Context) -> dict:
    matches = _match_by_organism(ctx, params.baseContrastIds, params.comparatorContrastIds)
    if not matches:
        raise ValueError("No base/comparator contrasts share an organism.")

    base_set = _contrast_set(ctx, {m["organism"]: m["baseId"] for m in matches})
    comp_set = _contrast_set(ctx, {m["organism"]: m["comparatorId"] for m in matches})

    merged = base_set.compare_association(comp_set)
    col = _VALUE_COLUMN.get(params.value)
    if col is None:
        raise ValueError(f"unknown value '{params.value}'; choose one of {sorted(_VALUE_COLUMN)}")
    self_col, comp_col = f"{col}_self", f"{col}_comparitor"
    if self_col not in merged.columns:
        raise ValueError(f"'{params.value}' not available in association results")

    chi2_result, categories = _chi2_and_categories(
        merged, params.fdr, params.sigThresh, params.estimateThresh
    )

    scatter = [
        {"organism": row["pangenome"], "feature": row["feature"], "base": row[self_col], "comparator": row[comp_col]}
        for _, row in merged.iterrows()
    ]

    return {"matches": matches, "chi2": chi2_result, "categories": categories, "scatter": scatter}


SPEC = FigureSpec(
    id="compare_contrasts",
    title="Compare contrasts",
    category="contrast",
    description="Auto-match contrasts by organism and compare association significance with pooled FDR.",
    model=Params,
    handler=run,
)
