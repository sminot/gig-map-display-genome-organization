"""Location of the per-session state directory (link overrides, output-dir config)."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_SESSION_DIR = "./session"


def session_dir() -> Path:
    return Path(os.environ.get("SESSION_DIR", DEFAULT_SESSION_DIR)).resolve()
