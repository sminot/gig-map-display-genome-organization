"""The session's current output directory, where figure records are written.

The chosen path is persisted in SESSION_DIR/output_dir.json; the figures live in
that directory, not under SESSION_DIR.
"""

from __future__ import annotations

import json
from pathlib import Path

from .session import session_dir


def _config_path() -> Path:
    return session_dir() / "output_dir.json"


def get_output_dir() -> str | None:
    path = _config_path()
    if not path.exists():
        return None
    return json.loads(path.read_text())["path"]


def set_output_dir(path: str) -> str:
    resolved = Path(path).expanduser().resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    session_dir().mkdir(parents=True, exist_ok=True)
    _config_path().write_text(json.dumps({"path": str(resolved)}))
    return str(resolved)


def current_output_path() -> Path | None:
    path = get_output_dir()
    return Path(path) if path is not None else None
