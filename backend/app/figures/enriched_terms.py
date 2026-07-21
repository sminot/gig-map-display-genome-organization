from __future__ import annotations

import re
from collections import Counter

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field
from scipy import stats
from statsmodels.stats.multitest import multipletests

from ..registry import Context, FigureSpec

# The pangenome has no structured functional annotation (KEGG/GO/COG); the only
# per-gene description is the free-text `combined_name` product string. We derive
# candidate "terms" by tokenising that text, dropping bracketed organism tags,
# the MULTISPECIES prefix, and non-informative boilerplate words.
_MULTISPECIES = re.compile(r"^\s*multispecies:\s*", re.IGNORECASE)
_BRACKETED = re.compile(r"\[[^\]]*\]")
_TOKEN = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "protein", "domain", "containing", "family", "putative", "probable", "type",
    "subunit", "like", "related", "associated", "partial", "chain", "region",
    "terminal", "and", "the", "with", "for", "from", "dependent", "component",
    "system", "group", "class",
}
_MIN_TOKEN_LEN = 3
# -log10(q) is capped so a q of exactly 0 (underflow) stays plottable.
_NEG_LOG10_CAP = 50.0


def _terms(name: object) -> set[str]:
    if not isinstance(name, str):
        return set()
    text = _BRACKETED.sub(" ", _MULTISPECIES.sub("", name)).lower()
    return {
        tok
        for tok in _TOKEN.findall(text)
        if len(tok) >= _MIN_TOKEN_LEN and not tok.isdigit() and tok not in _STOPWORDS
    }


class Params(BaseModel):
    pangenomeId: str
    bin: str
    minGeneCount: int = Field(default=2, ge=1)
    topN: int = Field(default=30, ge=1, le=200)


def run(params: Params, ctx: Context) -> pd.DataFrame:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    gene_bins = pg.gene_bins[["combined_name", "bin"]].copy()

    in_bin = gene_bins["bin"] == params.bin
    bin_size = int(in_bin.sum())
    if bin_size == 0:
        raise ValueError(f"bin '{params.bin}' not found in pangenome {params.pangenomeId}")

    gene_terms = gene_bins["combined_name"].map(_terms)
    total_genes = len(gene_terms)
    term_total: Counter[str] = Counter()
    term_in_bin: Counter[str] = Counter()
    for terms, is_in_bin in zip(gene_terms, in_bin):
        term_total.update(terms)
        if is_in_bin:
            term_in_bin.update(terms)

    rows = []
    for term, a in term_in_bin.items():
        total = term_total[term]
        if total < params.minGeneCount:
            continue
        # 2x2: rows = in-bin / out-of-bin, cols = has-term / lacks-term.
        table = [
            [a, bin_size - a],
            [total - a, total_genes - bin_size - (total - a)],
        ]
        odds_ratio, pvalue = stats.fisher_exact(table, alternative="greater")
        rows.append((term, a, total, odds_ratio, pvalue))

    if not rows:
        raise ValueError(
            f"no terms in bin '{params.bin}' occur in at least {params.minGeneCount} genes"
        )

    df = pd.DataFrame(rows, columns=["term", "genes_in_bin", "genes_total", "odds_ratio", "pvalue"])
    df["qvalue"] = multipletests(df["pvalue"], method="fdr_bh")[1]
    df["neg_log10_qvalue"] = np.minimum(-np.log10(df["qvalue"].clip(lower=1e-300)), _NEG_LOG10_CAP)
    df["bin_size"] = bin_size

    df = df.sort_values(["pvalue", "term"]).head(params.topN).reset_index(drop=True)
    return df


SPEC = FigureSpec(
    id="enriched_terms",
    title="Enriched terms",
    category="pangenome",
    description="Fisher-test enrichment of product-name terms among a bin's genes.",
    model=Params,
    handler=run,
)
