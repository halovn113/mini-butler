"""Tests for disk_cleanup tools — DiskScanTool & DiskCleanTool."""
from __future__ import annotations

import os
import tempfile

import pytest

from butler.tools.disk_cleanup import DiskScanTool, DiskCleanTool


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_dir(*parts: str) -> str:
    """Join path parts and ensure the directory exists."""
    p = os.path.join(*parts)
    os.makedirs(p, exist_ok=True)
    return p


def _make_file(path: str, size: int = 0) -> str:
    """Create a file at *path* with exactly *size* bytes."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        if size:
            f.write(b"x" * size)
        else:
            f.write(b"content")
    return path


# ── Scan tests ────────────────────────────────────────────────────────────────


class TestDiskScanTool:
    """Tests for DiskScanTool (disk_scan)."""

    async def test_scan_finds_pycache(self) -> None:
        """Scan should find a __pycache__/ directory under the root."""
        root = tempfile.mkdtemp()
        try:
            _make_dir(root, "__pycache__")
            _make_file(os.path.join(root, "__pycache__", "foo.pyc"), 512)

            tool = DiskScanTool()
            result = await tool.execute(path=root, min_size_mb=0)

            assert result.success, f"Scan failed: {result.error}"
            junk_paths = [j["path"] for j in result.data["junk"]]
            assert any("__pycache__" in p for p in junk_paths), (
                f"__pycache__ not found in junk: {junk_paths}"
            )
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_scan_size_calculation(self) -> None:
        """Scan should report correct size for a junk directory."""
        root = tempfile.mkdtemp()
        try:
            junk_dir = _make_dir(root, "node_modules")
            size = 256 * 1024  # 256 KiB
            _make_file(os.path.join(junk_dir, "pkg", "index.js"), size)

            tool = DiskScanTool()
            result = await tool.execute(path=root, min_size_mb=0)

            assert result.success, f"Scan failed: {result.error}"
            for j in result.data["junk"]:
                if "node_modules" in j["path"]:
                    assert j["size_bytes"] >= size, (
                        f"Expected >= {size} bytes, got {j['size_bytes']}"
                    )
                    return
            pytest.fail("node_modules not found in scan junk results")
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_scan_no_junk(self) -> None:
        """Scan on an empty tree should report no junk."""
        root = tempfile.mkdtemp()
        try:
            tool = DiskScanTool()
            result = await tool.execute(path=root, min_size_mb=0)
            assert result.success
            assert len(result.data["junk"]) == 0
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_scan_nonexistent_path(self) -> None:
        """Scan on a nonexistent path should return an error."""
        tool = DiskScanTool()
        result = await tool.execute(path="/nonexistent_xyz_12345", min_size_mb=0)
        assert not result.success
        assert "Not a directory" in result.error


# ── Clean tests ────────────────────────────────────────────────────────────────


class TestDiskCleanTool:
    """Tests for DiskCleanTool (disk_clean)."""

    async def test_clean_removes_dir(self) -> None:
        """Clean should delete a targeted directory and report bytes_freed > 0."""
        root = tempfile.mkdtemp()
        try:
            junk_dir = _make_dir(root, "to_delete")
            _make_file(os.path.join(junk_dir, "data.bin"), 1024)
            assert os.path.isdir(junk_dir)

            tool = DiskCleanTool()
            result = await tool.execute(path=root, targets=[junk_dir])

            assert result.success, f"Clean failed: {result.error}"
            assert not os.path.exists(junk_dir), "Directory was not deleted"
            assert result.data["bytes_freed"] > 0
            assert junk_dir in result.data["deleted"]
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_clean_removes_file(self) -> None:
        """Clean should delete a single file and report correct bytes_freed."""
        root = tempfile.mkdtemp()
        try:
            size = 5120
            file_path = _make_file(os.path.join(root, "junk.bin"), size)
            assert os.path.isfile(file_path)

            tool = DiskCleanTool()
            result = await tool.execute(path=root, targets=[file_path])

            assert result.success, f"Clean failed: {result.error}"
            assert not os.path.exists(file_path), "File was not deleted"
            assert result.data["bytes_freed"] == size
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_clean_respects_boundary(self) -> None:
        """Clean should refuse to delete a path outside the scanned root."""
        root = tempfile.mkdtemp()
        outside = tempfile.mkdtemp()
        try:
            outside_file = os.path.join(outside, "evil.txt")
            _make_file(outside_file)

            tool = DiskCleanTool()
            result = await tool.execute(path=root, targets=[outside_file])

            assert result.success
            assert any(outside_file in s for s in result.data["skipped"]), (
                f"Expected {outside_file} in skipped: {result.data['skipped']}"
            )
            assert os.path.isfile(outside_file), "Outside file should remain"
            assert result.data["bytes_freed"] == 0
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)
            shutil.rmtree(outside, ignore_errors=True)

    @pytest.mark.skipif(os.name == "nt", reason="Symlink creation requires admin on Windows")
    async def test_clean_skips_symlink(self) -> None:
        """Clean should skip symlinks and report them as skipped."""
        root = tempfile.mkdtemp()
        try:
            real_dir = _make_dir(root, "real_content")
            _make_file(os.path.join(real_dir, "data.bin"), 256)

            link_path = os.path.join(root, "link_to_real")
            os.symlink(real_dir, link_path)
            assert os.path.islink(link_path)

            tool = DiskCleanTool()
            result = await tool.execute(path=root, targets=[link_path])

            assert result.success
            assert any(link_path in s for s in result.data["skipped"]), (
                f"Expected {link_path} in skipped: {result.data['skipped']}"
            )
            assert os.path.islink(link_path), "Symlink should remain"
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_clean_no_targets(self) -> None:
        """Clean with no targets should return an error."""
        root = tempfile.mkdtemp()
        try:
            tool = DiskCleanTool()
            result = await tool.execute(path=root)
            assert not result.success
            assert "No targets" in result.error
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    async def test_clean_nonexistent_target(self) -> None:
        """Clean should skip a target that does not exist."""
        root = tempfile.mkdtemp()
        try:
            tool = DiskCleanTool()
            result = await tool.execute(
                path=root,
                targets=[os.path.join(root, "ghost")],
            )
            assert result.success
            assert "ghost" in result.data["skipped"][0]
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)
