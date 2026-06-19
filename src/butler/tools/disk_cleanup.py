"""Butler v2 — Disk Cleanup Tools

Scan for developer junk directories and delete them safely.
"""
from __future__ import annotations

import logging
import os
import stat
from pathlib import Path
from typing import Any

from butler.tools import BaseTool, ToolResult, registry

log = logging.getLogger("butler.disk_cleanup")

# Common developer junk directory names — used by the scan tool
DEV_JUNK: list[str] = [
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "dist",
    "build",
    ".gradle/caches",
    ".next",
    ".nuxt",
    "target",
]


def _human_size(b: int) -> str:
    """Format byte count as a human-readable string."""
    if b < 1024:
        return f"{b} B"
    elif b < 1024 ** 2:
        return f"{b / 1024:.1f} KiB"
    elif b < 1024 ** 3:
        return f"{b / 1024 ** 2:.1f} MiB"
    return f"{b / 1024 ** 3:.2f} GiB"


def _get_dir_size(path: Path) -> int:
    """Recursively compute total size (bytes) of a directory tree.

    Follows symlinks for size calculation (they are valid files)
    but the clean tool refuses to *delete* them for safety.
    """
    total = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            # Skip junction/reparse-point roots that would loop
            for f in filenames:
                try:
                    fp = os.path.join(dirpath, f)
                    total += os.lstat(fp).st_size
                except (OSError, RuntimeError):
                    continue
            # Also stat the directories themselves (tiny but honest)
            for d in dirnames:
                try:
                    dp = os.path.join(dirpath, d)
                    total += os.lstat(dp).st_size
                except (OSError, RuntimeError):
                    continue
    except (OSError, RuntimeError):
        pass
    return total


# ── Scan tool ────────────────────────────────────────────────────────────────


class DiskScanTool(BaseTool):
    name = "disk_scan"
    description = (
        "Scan a directory tree for dev-junk folders (node_modules, __pycache__, etc.) "
        "and list the 10 largest subdirectories. "
        "Params: path (str, default='~') — root to scan; "
        "min_size_mb (int, default=100) — minimum junk size in MiB to include."
    )
    risk_level = "moderate"  # read-only scan, no mutations

    async def execute(
        self, path: str = "~", min_size_mb: int = 100, **kwargs: Any
    ) -> ToolResult:
        try:
            root = Path(path).expanduser().resolve()
            if not root.is_dir():
                return ToolResult(
                    success=False, output="", error=f"Not a directory: {path}"
                )

            min_bytes = min_size_mb * 1024 * 1024
            junk_results: list[tuple[str, int]] = []
            all_dir_sizes: list[tuple[str, int]] = []

            # Walk the tree collecting both junk and sizes
            dev_junk_set = frozenset(DEV_JUNK)
            try:
                for dirpath_str, dirnames, _ in os.walk(str(root)):
                    # Skip hidden dirs when walking (but still show their size)
                    # Filter junk matches from current dirnames
                    for d in list(dirnames):
                        # Check if this dirname (or relative path) is junk
                        rel_path = os.path.relpath(
                            os.path.join(dirpath_str, d), str(root)
                        )
                        if d in dev_junk_set or rel_path in dev_junk_set:
                            dp = Path(dirpath_str) / d
                            sz = _get_dir_size(dp)
                            if sz >= min_bytes:
                                junk_results.append((str(dp), sz))

                    # Record every top-level dir for "largest dirs" list
                    if dirpath_str == str(root):
                        for d in dirnames:
                            dp = Path(dirpath_str) / d
                            try:
                                sz = _get_dir_size(dp)
                                all_dir_sizes.append((str(dp), sz))
                            except (OSError, RuntimeError):
                                continue
            except (OSError, RuntimeError) as exc:
                return ToolResult(
                    success=False, output="", error=f"Scan failed: {exc}"
                )

            # Build report
            junk_results.sort(key=lambda x: x[1], reverse=True)
            all_dir_sizes.sort(key=lambda x: x[1], reverse=True)

            lines: list[str] = []
            lines.append(f"Disk scan: {root}")
            lines.append(f"Min junk size: {min_size_mb} MiB")
            lines.append("")

            if junk_results:
                lines.append("--- Dev Junk Found ---")
                for jp, js in junk_results:
                    lines.append(f"  {_human_size(js):>10}  {jp}")
            else:
                lines.append("No dev junk found above the size threshold.")

            lines.append("")
            lines.append("--- 10 Largest Directories ---")
            for dp, ds in all_dir_sizes[:10]:
                lines.append(f"  {_human_size(ds):>10}  {dp}")

            return ToolResult(
                success=True,
                output="\n".join(lines),
                data={
                    "junk": [
                        {"path": p, "size_bytes": s} for p, s in junk_results
                    ],
                    "largest": [
                        {"path": p, "size_bytes": s} for p, s in all_dir_sizes[:10]
                    ],
                    "root": str(root),
                },
            )

        except Exception as exc:
            return ToolResult(success=False, output="", error=str(exc))


# ── Clean tool ───────────────────────────────────────────────────────────────


class DiskCleanTool(BaseTool):
    name = "disk_clean"
    description = (
        "Delete specified paths (directories or files) that were previously "
        "identified by disk_scan. Safety: refuses paths outside the scanned root, "
        "skips symlinks, logs each deletion. "
        "Params: path (str) — the scanned root that targets are relative to; "
        "targets (list[str]) — full paths to delete."
    )
    risk_level = "destructive"

    async def execute(
        self, path: str, targets: list[str] | None = None, **kwargs: Any
    ) -> ToolResult:
        if not targets:
            return ToolResult(
                success=False,
                output="",
                error="No targets provided. Pass a list of paths to delete.",
            )

        try:
            root = Path(path).expanduser().resolve()
            if not root.is_dir():
                return ToolResult(
                    success=False, output="", error=f"Not a directory: {path}"
                )

            freed = 0
            deleted: list[str] = []
            skipped: list[str] = []
            errors: list[str] = []

            for raw_target in targets:
                target = Path(raw_target).expanduser().resolve()

                # Safety: must be under scanned root
                try:
                    target.relative_to(root)
                except ValueError:
                    skipped.append(
                        f"{raw_target} (outside scanned root {root})"
                    )
                    continue

                # Safety: skip symlinks
                if target.is_symlink():
                    skipped.append(f"{raw_target} (symlink, skipped)")
                    continue

                # Safety: skip if doesn't exist
                if not target.exists():
                    skipped.append(f"{raw_target} (does not exist)")
                    continue

                try:
                    # Compute size before deletion
                    if target.is_dir():
                        sz = _get_dir_size(target)
                    else:
                        sz = target.stat().st_size

                    # Remove read-only bits so we can delete
                    if target.is_dir():
                        _remove_readonly_recursive(target)

                    # Use chmod on the root target too
                    try:
                        os.chmod(str(target), stat.S_IWUSR | stat.S_IRUSR)
                    except OSError:
                        pass

                    if target.is_dir():
                        import shutil
                        shutil.rmtree(str(target), ignore_errors=False)
                    else:
                        target.unlink()

                    freed += sz
                    deleted.append(raw_target)
                    log.info("Deleted %s (%s)", raw_target, _human_size(sz))

                except Exception as exc:
                    errors.append(f"{raw_target}: {exc}")

            lines: list[str] = []
            if deleted:
                lines.append(
                    f"Deleted {len(deleted)} path(s), freed {_human_size(freed)}"
                )
            if skipped:
                lines.append(f"Skipped {len(skipped)} path(s)")
            if errors:
                lines.append(f"Errors on {len(errors)} path(s):")
                for e in errors:
                    lines.append(f"  {e}")

            return ToolResult(
                success=not errors,
                output="\n".join(lines) or "Nothing to delete.",
                data={
                    "bytes_freed": freed,
                    "deleted": deleted,
                    "skipped": skipped,
                    "errors": errors,
                },
            )

        except Exception as exc:
            return ToolResult(success=False, output="", error=str(exc))


def _remove_readonly_recursive(path: Path) -> None:
    """Recursively remove read-only/immutable bits so shutil.rmtree can work."""
    try:
        for dirpath_str, dirnames, filenames in os.walk(str(path)):
            for name in filenames:
                try:
                    fp = os.path.join(dirpath_str, name)
                    os.chmod(fp, stat.S_IWUSR | stat.S_IRUSR)
                except OSError:
                    continue
            for name in dirnames:
                try:
                    dp = os.path.join(dirpath_str, name)
                    os.chmod(dp, stat.S_IWUSR | stat.S_IRUSR)
                except OSError:
                    continue
    except OSError:
        pass


registry.register(DiskScanTool())
registry.register(DiskCleanTool())
