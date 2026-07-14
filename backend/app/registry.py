"""Map functionId -> handler + pydantic params model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd
from pydantic import BaseModel

from .datasets import DatasetRegistry


@dataclass
class Context:
    datasets: DatasetRegistry


@dataclass
class TableResult:
    """A tabular result plus an optional JSON metadata sidecar."""

    df: pd.DataFrame
    meta: dict | None = None


# A handler returns a DataFrame (tabular), a dict (JSON), or a TableResult.
Handler = Callable[[BaseModel, Context], "pd.DataFrame | dict | TableResult"]


@dataclass
class FunctionSpec:
    id: str
    title: str
    category: str
    description: str
    model: type[BaseModel]
    handler: Handler


def build_registry() -> dict[str, FunctionSpec]:
    from .functions import ALL_FUNCTIONS

    return {spec.id: spec for spec in ALL_FUNCTIONS}
