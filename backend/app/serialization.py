"""DataFrame -> Arrow IPC stream; JSON helpers that tolerate numpy/NaN."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
import pyarrow as pa
from fastapi import Response
from fastapi.responses import JSONResponse

ARROW_MEDIA_TYPE = "application/vnd.apache.arrow.stream"


def df_to_arrow_bytes(df: pd.DataFrame) -> bytes:
    table = pa.Table.from_pandas(df, preserve_index=False)
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def to_jsonable(obj: Any) -> Any:
    """Recursively convert numpy/pandas scalars and NaN/Inf into JSON-safe values."""
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        obj = float(obj)
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if obj is pd.NA:
        return None
    return obj


def json_response(payload: Any) -> JSONResponse:
    return JSONResponse(content=to_jsonable(payload))


def tabular_response(df: pd.DataFrame, format: str | None = None) -> Response:
    """Serve a DataFrame as Arrow (default), CSV, or JSON records."""
    if format == "csv":
        return Response(content=df.to_csv(index=False), media_type="text/csv")
    if format == "json":
        return json_response(df.to_dict(orient="records"))
    return Response(content=df_to_arrow_bytes(df), media_type=ARROW_MEDIA_TYPE)
