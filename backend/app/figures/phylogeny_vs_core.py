from __future__ import annotations

from gig_map_io.helpers.phylogeny import Phylogeny
from pydantic import BaseModel

from ..registry import Context, FigureSpec
from .core_genome import core_bin


class Params(BaseModel):
    pangenomeId: str
    phylogenyId: str
    bin: str
    coreBin: str | None = None


def _layout(tree: Phylogeny) -> dict:
    leaves = set(tree.leaves_list)
    nodes = [
        {"name": name, "x": float(c["x"]), "y": float(c["y"]), "isLeaf": name in leaves}
        for name, c in tree.coords.items()
    ]
    links = [
        {"parent": parent, "child": child}
        for parent, children in tree.children.items()
        for child in children
    ]
    return {"nodes": nodes, "links": links, "leaves": tree.leaves_list}


def run(params: Params, ctx: Context) -> dict:
    phy = ctx.datasets.phylogeny(params.phylogenyId)
    pg = ctx.datasets.pangenome(params.pangenomeId)
    core = params.coreBin or core_bin(pg)

    bin_tree = phy.tree(params.bin)
    core_tree = phy.tree(core)

    shared = set(bin_tree.leaves_list) & set(core_tree.leaves_list)
    concordance = bin_tree._calc_concordance(core_tree)

    return {
        "coreBin": core,
        "binNewick": phy.newick(params.bin),
        "coreNewick": phy.newick(core),
        "concordance": concordance,
        "sharedLeaves": len(shared),
        "binLayout": _layout(bin_tree),
        "coreLayout": _layout(core_tree),
    }


SPEC = FigureSpec(
    id="phylogeny_vs_core",
    title="Phylogeny vs core",
    category="phylogeny",
    description="Tanglegram of a bin's phylogeny against the core-genome phylogeny.",
    model=Params,
    handler=run,
)
