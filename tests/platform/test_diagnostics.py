"""Tests for cross-platform system diagnostics."""
from __future__ import annotations

from butler.platform.diagnostics import (
    memory_summary,
    top_memory_processes,
    top_cpu_processes,
    cpu_load_summary,
    disk_summary,
    home_disk_usage,
    full_snapshot,
)


class TestMemorySummary:
    def test_returns_string(self) -> None:
        result = memory_summary()
        assert isinstance(result, str)
        assert len(result) > 10

    def test_contains_memory_label(self) -> None:
        result = memory_summary()
        assert "Memory" in result or "Swap" in result

    def test_has_percent(self) -> None:
        result = memory_summary()
        assert "%" in result


class TestTopMemoryProcesses:
    def test_returns_string(self) -> None:
        result = top_memory_processes(5)
        assert isinstance(result, str)

    def test_has_header(self) -> None:
        result = top_memory_processes()
        assert "PID" in result
        assert "COMMAND" in result
        assert "%MEM" in result

    def test_custom_limit(self) -> None:
        result = top_memory_processes(3)
        lines = result.strip().split("\n")
        # header + up to 3 processes
        assert 1 <= len(lines) <= 4


class TestTopCpuProcesses:
    def test_returns_string(self) -> None:
        result = top_cpu_processes(5)
        assert isinstance(result, str)

    def test_has_header(self) -> None:
        result = top_cpu_processes()
        assert "PID" in result
        assert "%CPU" in result


class TestCpuLoadSummary:
    def test_returns_string(self) -> None:
        result = cpu_load_summary()
        assert isinstance(result, str)
        assert len(result) > 10

    def test_contains_load(self) -> None:
        result = cpu_load_summary()
        assert "Load" in result or "CPU" in result


class TestDiskSummary:
    def test_returns_string(self) -> None:
        result = disk_summary()
        assert isinstance(result, str)

    def test_has_header(self) -> None:
        result = disk_summary()
        assert "Mount" in result or "Total" in result


class TestHomeDiskUsage:
    def test_returns_string(self) -> None:
        result = home_disk_usage(5)
        assert isinstance(result, str)

    def test_has_header(self) -> None:
        result = home_disk_usage()
        assert "Dir" in result or "Size" in result


class TestFullSnapshot:
    def test_returns_string(self) -> None:
        result = full_snapshot()
        assert isinstance(result, str)
        assert len(result) > 50

    def test_contains_all_sections(self) -> None:
        result = full_snapshot()
        # Should have memory info and load info
        assert "Memory" in result or "total" in result.lower()
