"""Cross-platform system diagnostics — wraps psutil for memory/CPU/disk.

Replaces shell-out calls (free, swapon, df, ps) in brain.py with pure-psutil
alternatives that work on Linux, macOS, and Windows.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import psutil

log = logging.getLogger("butler.platform.diagnostics")


def memory_summary() -> str:
    """Return human-readable memory and swap summary (replaces `free -h` + `swapon --show`)."""
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    lines = [
        f"Memory:  total={_fmt(mem.total)}  used={_fmt(mem.used)}  "
        f"free={_fmt(mem.available)}  ({mem.percent:.0f}%)",
    ]
    if swap.total > 0:
        lines.append(
            f"Swap:    total={_fmt(swap.total)}  used={_fmt(swap.used)}  "
            f"free={_fmt(swap.total - swap.used)}  ({swap.percent:.0f}%)"
        )
    else:
        lines.append("Swap:    none")
    return "\n".join(lines)


def top_memory_processes(n: int = 12) -> str:
    """Return top-N memory-consuming processes (replaces `ps` RSS sort)."""
    procs = sorted(psutil.process_iter(["pid", "name", "memory_info", "memory_percent"]),
                   key=lambda p: p.info["memory_percent"] or 0, reverse=True)[:n]
    lines = [f"{'PID':>7}  {'COMMAND':<20}  {'RSS':>8}  {'%MEM':>5}"]
    for p in procs:
        try:
            rss = p.info["memory_info"].rss if p.info["memory_info"] else 0
            lines.append(
                f"{p.info['pid']:>7}  {p.info['name'] or '?':<20}  "
                f"{_fmt(rss):>8}  {p.info['memory_percent'] or 0:>5.1f}"
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return "\n".join(lines)


def top_cpu_processes(n: int = 12) -> str:
    """Return top-N CPU-consuming processes (replaces `ps` CPU sort)."""
    # Take a quick snapshot — first sample may be 0 for short-lived processes.
    procs = sorted(psutil.process_iter(["pid", "name", "cpu_percent"]),
                   key=lambda p: p.info["cpu_percent"] or 0, reverse=True)[:n]
    lines = [f"{'PID':>7}  {'COMMAND':<20}  {'%CPU':>5}"]
    for p in procs:
        try:
            lines.append(
                f"{p.info['pid']:>7}  {p.info['name'] or '?':<20}  "
                f"{p.info['cpu_percent'] or 0:>5.1f}"
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return "\n".join(lines)


def cpu_load_summary() -> str:
    """Return CPU load average + per-core breakdown (replaces `uptime` load + `ps` CPU)."""
    load = psutil.getloadavg() if hasattr(psutil, "getloadavg") else (0, 0, 0)
    per_core = psutil.cpu_percent(interval=0.5, percpu=True)
    lines = [
        f"Load average:  {load[0]:.2f}  {load[1]:.2f}  {load[2]:.2f}",
        f"CPU cores: {psutil.cpu_count()}  ({len(per_core)} logical)",
        f"Per-core:  {'  '.join(f'{c:.0f}%' for c in per_core)}",
    ]
    return "\n".join(lines) + "\n" + top_cpu_processes()


def disk_summary() -> str:
    """Return disk usage summary (replaces `df -h` + `du`)."""
    parts = psutil.disk_partitions()
    lines = [f"{'Mount':<30}  {'Total':>8}  {'Used':>8}  {'Free':>8}  {'Use%':>5}"]
    for p in parts:
        try:
            usage = psutil.disk_usage(p.mountpoint)
            lines.append(
                f"{p.mountpoint:<30}  {_fmt(usage.total):>8}  {_fmt(usage.used):>8}  "
                f"{_fmt(usage.free):>8}  {usage.percent:>4.0f}%"
            )
        except PermissionError:
            continue
    return "\n".join(lines)


def home_disk_usage(n: int = 10) -> str:
    """Return top-N largest directories under $HOME (replaces `du`)."""
    home = Path.home()
    try:
        entries = []
        for child in home.iterdir():
            if child.is_dir() and not child.name.startswith("."):
                try:
                    size = sum(f.stat().st_size for f in child.rglob("*") if f.is_file())
                    entries.append((child.name, size))
                except (PermissionError, OSError):
                    continue
        entries.sort(key=lambda x: x[1], reverse=True)
        lines = [f"{'Dir':<30}  {'Size':>8}"]
        for name, size in entries[:n]:
            lines.append(f"{name:<30}  {_fmt(size):>8}")
        return "\n".join(lines)
    except Exception as exc:
        return f"(home disk usage unavailable: {exc})"


def full_snapshot() -> str:
    """Broad system snapshot — when no specific anomaly keyword matches."""
    parts = [
        memory_summary(),
        cpu_load_summary(),
        disk_summary(),
        top_memory_processes(10),
    ]
    return "\n\n".join(parts)


def _fmt(size_bytes: int) -> str:
    """Format bytes to human-readable (e.g. '2.1G', '450M')."""
    for unit in ("B", "K", "M", "G", "T"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f}{unit}" if unit != "B" else f"{size_bytes}B"
        size_bytes /= 1024
    return f"{size_bytes:.1f}P"
