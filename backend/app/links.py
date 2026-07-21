"""Resolve each contrast to its reference pangenome, with user overrides.

Overrides are persisted as JSON files under SESSION_DIR/links.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from .registry import Context
from .session import session_dir


class LinkUpdate(BaseModel):
    pangenomeId: str


def links_dir() -> Path:
    d = session_dir() / "links"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path(contrast_id: str) -> Path:
    # Guard against path traversal; contrast ids are slugs of folder names.
    if not all(c.isalnum() or c == "-" for c in contrast_id):
        raise ValueError("invalid contrast id")
    return links_dir() / f"{contrast_id}.json"


def _override(contrast_id: str) -> str | None:
    path = _path(contrast_id)
    if not path.exists():
        return None
    return json.loads(path.read_text())["pangenomeId"]


def set_override(contrast_id: str, pangenome_id: str) -> None:
    _path(contrast_id).write_text(json.dumps({"pangenomeId": pangenome_id}))


def clear_override(contrast_id: str) -> None:
    path = _path(contrast_id)
    if path.exists():
        path.unlink()


def _candidates(contrast_id: str, ctx: Context) -> tuple[list[str], bool]:
    """Pangenomes matching a contrast, and whether the match is exact.

    Returns (candidates, exact). An exact match is bin-set equality and can be
    auto-resolved. When no set matches, an equal bin COUNT is only a coincidence:
    those ids are still returned (so a caller can offer them) but exact is False,
    keeping the link ambiguous. No match at all returns ([], False).
    """
    features = ctx.datasets.feature_name_set(contrast_id)
    pangenomes = ctx.datasets.list("pangenome")
    exact = [p.id for p in pangenomes if ctx.datasets.bin_name_set(p.id) == features]
    if exact:
        return exact, True
    count = [p.id for p in pangenomes if len(ctx.datasets.bin_name_set(p.id)) == len(features)]
    return count, False


def resolve(contrast_id: str, ctx: Context) -> dict:
    candidates, exact = _candidates(contrast_id, ctx)
    override = _override(contrast_id)
    if override is not None:
        return {
            "contrastId": contrast_id,
            "referencePangenomeId": override,
            "candidates": candidates,
            "ambiguous": False,
            "source": "user",
        }

    reference: str | None = None
    ambiguous = True
    if exact and len(candidates) == 1:
        reference, ambiguous = candidates[0], False
    elif exact and len(candidates) > 1:
        organism = ctx.datasets.get(contrast_id).organism
        same_organism = [c for c in candidates if ctx.datasets.get(c).organism == organism]
        if len(same_organism) == 1:
            reference, ambiguous = same_organism[0], False

    return {
        "contrastId": contrast_id,
        "referencePangenomeId": reference,
        "candidates": candidates,
        "ambiguous": ambiguous,
        "source": "inferred",
    }


def resolve_all(ctx: Context) -> list[dict]:
    return [resolve(c.id, ctx) for c in ctx.datasets.list("contrast")]


def reference_pangenome_of(contrast_id: str, ctx: Context) -> str | None:
    return resolve(contrast_id, ctx)["referencePangenomeId"]


def linked_contrasts_for(pangenome_id: str, ctx: Context) -> list[str]:
    return [
        c.id
        for c in ctx.datasets.list("contrast")
        if reference_pangenome_of(c.id, ctx) == pangenome_id
    ]
