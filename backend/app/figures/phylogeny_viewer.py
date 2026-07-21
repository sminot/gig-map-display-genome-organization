from __future__ import annotations

from pydantic import BaseModel

from ..registry import Context, FigureSpec


class Params(BaseModel):
    phylogenyId: str
    bin: str


def run(params: Params, ctx: Context) -> dict:
    phy = ctx.datasets.phylogeny(params.phylogenyId)
    try:
        newick = phy.newick(params.bin)
        n_leaves = len(phy.tree(params.bin).leaves_list)
    except FileNotFoundError as exc:
        raise ValueError(
            f"Bin {params.bin!r} has no tree in phylogenies dataset {params.phylogenyId!r}"
        ) from exc
    return {"bin": params.bin, "newick": newick, "nLeaves": n_leaves}


SPEC = FigureSpec(
    id="phylogeny_viewer",
    title="Phylogeny Viewer",
    category="phylogeny",
    description="Interactive view of a single bin's phylogenetic tree.",
    model=Params,
    handler=run,
)
