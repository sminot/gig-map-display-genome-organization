"""Assemble the on-click bin drawer payload by reusing the analysis handlers."""

from __future__ import annotations

from . import links
from .figures import bin_to_genomes, core_genome, enriched_terms, synteny_layout
from .registry import Context

PRESENCE_THRESHOLD = bin_to_genomes.PRESENCE_THRESHOLD
TOP_ENRICHED_TERMS = 8


def _enriched(pangenome_id: str, bin: str, ctx: Context) -> list[dict]:
    df = enriched_terms.run(enriched_terms.Params(pangenomeId=pangenome_id, bin=bin), ctx)
    return [
        {"term": row["term"], "oddsRatio": float(row["odds_ratio"]), "qvalue": float(row["qvalue"])}
        for _, row in df.head(TOP_ENRICHED_TERMS).iterrows()
    ]


def _synteny(pangenome_id: str, bin: str, ctx: Context) -> dict:
    layout = synteny_layout.run(synteny_layout.Params(pangenomeId=pangenome_id, bin=bin), ctx)
    genes = layout["genes"]
    return {
        "length": int(round(layout["length"])),
        "nGenes": len(genes),
        "nGroups": len({g["group"] for g in genes}),
    }


def _contrasts(pangenome_id: str, bin: str, ctx: Context) -> list[dict]:
    rows = []
    for contrast_id in links.linked_contrasts_for(pangenome_id, ctx):
        info = ctx.datasets.get(contrast_id)
        assoc = ctx.datasets.contrast(contrast_id).association
        match = assoc.loc[assoc["feature"] == bin]
        if match.empty:
            estimate = pvalue = qvalue = None
        else:
            r = match.iloc[0]
            estimate, pvalue, qvalue = float(r["Estimate"]), float(r["pvalue"]), float(r["qvalue"])
        rows.append(
            {
                "contrastId": contrast_id,
                "name": info.name,
                "estimate": estimate,
                "pvalue": pvalue,
                "qvalue": qvalue,
            }
        )
    return rows


def _phylogeny(pangenome_id: str, bin: str, ctx: Context) -> dict | None:
    organism = ctx.datasets.get(pangenome_id).organism
    matches = sorted(
        (p for p in ctx.datasets.list("phylogenies") if p.organism == organism),
        key=lambda p: p.id,
    )
    if not matches:
        return None
    phylogeny_id = matches[0].id
    phy = ctx.datasets.phylogeny(phylogeny_id)
    core = core_genome.core_bin(ctx.datasets.pangenome(pangenome_id))
    bin_tree = phy.tree(bin)
    core_tree = phy.tree(core)
    concordance = bin_tree._calc_concordance(core_tree)
    shared = set(bin_tree.leaves_list) & set(core_tree.leaves_list)
    return {
        "phylogenyId": phylogeny_id,
        "concordance": float(concordance) if concordance is not None else None,
        "sharedLeaves": len(shared),
    }


def _optional(fn, *args) -> object:
    """Run an optional section. ValueError means the data is legitimately absent
    (an empty bin, no annotation terms, no gene coordinates) and degrades to null;
    any other exception is a real bug and propagates."""
    try:
        return fn(*args)
    except ValueError:
        return None


def build(pangenome_id: str, bin: str, ctx: Context) -> dict:
    pg = ctx.datasets.pangenome(pangenome_id)
    if bin not in pg.bin_names:
        raise KeyError(f"bin '{bin}' not found in pangenome {pangenome_id}")

    gc = pg.genome_content
    detected = gc.loc[gc["bin"] == bin, ["genome", "prop_genes_detected"]].dropna(subset=["genome"])
    presence = [
        {"genome": row["genome"], "prop": float(row["prop_genes_detected"])}
        for _, row in detected.iterrows()
    ]
    n_genomes = int((detected["prop_genes_detected"] >= PRESENCE_THRESHOLD).sum())
    total_genomes = pg.n_genomes

    return {
        "bin": bin,
        "pangenomeId": pangenome_id,
        "nGenes": int(pg.bin_size.get(bin, 0)),
        "nGenomes": n_genomes,
        "totalGenomes": total_genomes,
        "prevalence": n_genomes / total_genomes if total_genomes else 0.0,
        "isCore": core_genome.core_bin(pg) == bin,
        "presence": presence,
        "enrichedTerms": _optional(_enriched, pangenome_id, bin, ctx) or [],
        "synteny": _optional(_synteny, pangenome_id, bin, ctx),
        "contrasts": _contrasts(pangenome_id, bin, ctx),
        "phylogeny": _optional(_phylogeny, pangenome_id, bin, ctx),
    }
