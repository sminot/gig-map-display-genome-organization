"""Bookmark CRUD backed by JSON files under SESSION_DIR/bookmarks."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel

DEFAULT_SESSION_DIR = "./session"


def session_dir() -> Path:
    return Path(os.environ.get("SESSION_DIR", DEFAULT_SESSION_DIR)).resolve()


def bookmarks_dir() -> Path:
    d = session_dir() / "bookmarks"
    d.mkdir(parents=True, exist_ok=True)
    return d


class BookmarkCreate(BaseModel):
    functionId: str
    title: str
    params: dict


class Bookmark(BookmarkCreate):
    id: str
    createdAt: str


def _path(bookmark_id: str) -> Path:
    # Guard against path traversal; ids we mint are uu4 hex + dashes.
    if not all(c.isalnum() or c == "-" for c in bookmark_id):
        raise ValueError("invalid bookmark id")
    return bookmarks_dir() / f"{bookmark_id}.json"


def create(payload: BookmarkCreate) -> Bookmark:
    bookmark = Bookmark(
        id=str(uuid.uuid4()),
        createdAt=datetime.now(timezone.utc).isoformat(),
        **payload.model_dump(),
    )
    _path(bookmark.id).write_text(bookmark.model_dump_json())
    return bookmark


def list_all() -> list[Bookmark]:
    items = [Bookmark(**json.loads(p.read_text())) for p in bookmarks_dir().glob("*.json")]
    return sorted(items, key=lambda b: b.createdAt, reverse=True)


def delete(bookmark_id: str) -> None:
    path = _path(bookmark_id)
    if not path.exists():
        raise KeyError(bookmark_id)
    path.unlink()
