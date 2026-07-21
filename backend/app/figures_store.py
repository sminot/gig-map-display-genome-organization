"""Figure records: the type-agnostic {figureType, params} serialization of any
figure, stored as JSON + image files in the session's current output directory.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .output_dir import current_output_path

MEDIA_TYPES = {"png": "image/png", "svg": "image/svg+xml"}


class NoOutputDir(Exception):
    """Raised when an operation needs an output dir but none is set."""


def _require_dir() -> Path:
    path = current_output_path()
    if path is None:
        raise NoOutputDir("no output directory set")
    return path


def _safe_id(figure_id: str) -> str:
    # ids we mint are uuid4 hex (alphanumeric); reject anything else to block traversal.
    if not figure_id.isalnum():
        raise ValueError("invalid figure id")
    return figure_id


def _is_record(obj: object) -> bool:
    return (
        isinstance(obj, dict)
        and "id" in obj
        and "figureType" in obj
        and "params" in obj
    )


def create(figure_type: str, title: str, params: object, images: dict[str, bytes]) -> dict:
    directory = _require_dir()
    figure_id = uuid.uuid4().hex
    image_meta = []
    for fmt, data in images.items():
        filename = f"{figure_id}.{fmt}"
        (directory / filename).write_bytes(data)
        image_meta.append({"format": fmt, "filename": filename})
    record = {
        "id": figure_id,
        "figureType": figure_type,
        "title": title,
        "params": params,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "images": image_meta,
    }
    (directory / f"{figure_id}.json").write_text(json.dumps(record))
    return record


def list_all() -> list[dict]:
    path = current_output_path()
    if path is None or not path.is_dir():
        return []
    records = []
    for f in path.glob("*.json"):
        try:
            obj = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        if _is_record(obj):
            records.append(obj)
    return sorted(records, key=lambda r: r.get("createdAt", ""), reverse=True)


def _read_record(figure_id: str) -> dict:
    path = _require_dir() / f"{_safe_id(figure_id)}.json"
    if not path.exists():
        raise KeyError(figure_id)
    return json.loads(path.read_text())


def delete(figure_id: str) -> None:
    directory = _require_dir()
    record = _read_record(figure_id)
    for image in record.get("images", []):
        (directory / image["filename"]).unlink(missing_ok=True)
    (directory / f"{figure_id}.json").unlink()


def image_path(figure_id: str, fmt: str) -> Path:
    directory = _require_dir()
    record = _read_record(figure_id)
    for image in record.get("images", []):
        if image["format"] == fmt:
            path = directory / image["filename"]
            if path.exists():
                return path
    raise KeyError(fmt)
