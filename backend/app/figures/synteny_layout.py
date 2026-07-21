from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from ..registry import Context, FigureSpec


class Params(BaseModel):
    pangenomeId: str
    bin: str


def run(params: Params, ctx: Context) -> dict:
    pg = ctx.datasets.pangenome(params.pangenomeId)
    coords, group_offset = pg._get_gene_coords(params.bin)
    if coords.empty:
        raise ValueError(f"no gene coordinates for bin '{params.bin}'")

    gene_label = pg.gene_bins.set_index("gene_id")["gene_label"]
    genes = [
        {
            "gene_id": row["gene"],
            "label": gene_label.get(row["gene"], row["gene"]),
            "start": float(row["start"]),
            "stop": float(row["stop"]),
            "dir": row["dir"],
            "group": int(row["group"]),
        }
        for _, row in coords.iterrows()
    ]
    length = float(np.max([coords["start"].max(), coords["stop"].max()]))

    return {
        "genes": genes,
        "groupOffsets": group_offset.tolist(),
        "length": length,
    }


SPEC = FigureSpec(
    id="synteny_layout",
    title="Synteny layout",
    category="pangenome",
    description="Gene-arrow coordinates for a bin, inferred from all genome alignments.",
    model=Params,
    handler=run,
)
