"""Cross-platform data paths — wraps platformdirs for XDG/Windows/macOS conventions.

Usage:
    from butler.platform.paths import data_dir, cache_dir, config_dir, log_dir, token_dir
    db_path = data_dir() / "butler.db"
"""

from __future__ import annotations

from pathlib import Path

import platformdirs

_APP = "butler"
_AUTHOR = "butler"


def data_dir() -> Path:
    """Application data directory (e.g. ~/.local/share/butler/)."""
    return Path(platformdirs.user_data_dir(_APP, _AUTHOR))


def cache_dir() -> Path:
    """Application cache directory (e.g. ~/.cache/butler/)."""
    return Path(platformdirs.user_cache_dir(_APP, _AUTHOR))


def config_dir() -> Path:
    """Application config directory (e.g. ~/.config/butler/)."""
    return Path(platformdirs.user_config_dir(_APP, _AUTHOR))


def log_dir() -> Path:
    """Application log directory — reuses data_dir on Linux, cache_dir elsewhere."""
    return Path(platformdirs.user_log_dir(_APP, _AUTHOR))


def state_dir() -> Path:
    """Application state directory (e.g. ~/.local/state/butler/)."""
    return Path(platformdirs.user_state_dir(_APP, _AUTHOR))


def token_dir() -> Path:
    """OAuth token directory — subdirectory under data_dir."""
    p = data_dir() / "tokens"
    p.mkdir(mode=0o700, parents=True, exist_ok=True)
    return p


def env_file_path() -> Path:
    """Path to the project .env file — data dir first, then CWD."""
    data_env = data_dir() / ".env"
    if data_env.exists():
        return data_env
    return Path.cwd() / ".env"
