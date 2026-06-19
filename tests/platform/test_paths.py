"""Tests for cross-platform data paths."""
from __future__ import annotations

from pathlib import Path

from butler.platform.paths import data_dir, cache_dir, config_dir, log_dir, state_dir, token_dir, env_file_path


class TestDataDir:
    def test_data_dir_returns_path(self) -> None:
        p = data_dir()
        assert isinstance(p, Path)
        assert "butler" in str(p).lower()

    def test_data_dir_creatable(self) -> None:
        p = data_dir()
        p.mkdir(parents=True, exist_ok=True)
        assert p.exists()

    def test_cache_dir_returns_path(self) -> None:
        p = cache_dir()
        assert isinstance(p, Path)
        assert "butler" in str(p).lower()

    def test_config_dir_returns_path(self) -> None:
        p = config_dir()
        assert isinstance(p, Path)

    def test_log_dir_returns_path(self) -> None:
        p = log_dir()
        assert isinstance(p, Path)

    def test_state_dir_returns_path(self) -> None:
        p = state_dir()
        assert isinstance(p, Path)

    def test_token_dir_creates_and_returns(self) -> None:
        p = token_dir()
        assert isinstance(p, Path)
        assert "tokens" in str(p)
        assert p.exists()

    def test_env_file_path_returns_path(self) -> None:
        p = env_file_path()
        assert isinstance(p, Path)

    def test_paths_are_absolute(self) -> None:
        for fn in [data_dir, cache_dir, config_dir, log_dir, state_dir]:
            p = fn()
            assert p.is_absolute(), f"{fn.__name__} returned relative path: {p}"
