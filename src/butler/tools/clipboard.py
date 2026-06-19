"""Clipboard tools — history retrieval, lookup, and clear."""
from __future__ import annotations

import logging
from typing import Any

from butler.data.clipboard_store import ClipboardStore
from butler.tools import BaseTool, ToolResult, registry

log = logging.getLogger("butler.tool.clipboard")


def _get_store() -> ClipboardStore | None:
    """Get the clipboard store from the data layer."""
    try:
        from butler.data.layer import data_layer

        return ClipboardStore(data_layer.kv)
    except Exception as exc:
        log.debug("clipboard store unavailable: %s", exc)
        return None


@registry.register
class ClipHistoryTool(BaseTool):
    name = "clip_history"
    description = "List recent clipboard history entries. Returns the N most recent items."
    risk_level = "safe"

    async def execute(self, n: int = 20, **kwargs: Any) -> ToolResult:
        store = _get_store()
        if store is None:
            return ToolResult(success=False, error="Clipboard store unavailable")

        entries = store.list_recent(n)
        if not entries:
            return ToolResult(success=True, output="No clipboard history.")

        lines: list[str] = []
        for i, entry in enumerate(entries, start=1):
            ts = entry.timestamp[:19]  # strip subseconds
            lines.append(f"{i}. [{ts}] {entry.text}")
        return ToolResult(
            success=True,
            output="Clipboard history:\n" + "\n".join(lines),
            data={"count": len(entries)},
        )


@registry.register
class ClipGetTool(BaseTool):
    name = "clip_get"
    description = "Get a clipboard entry by 1-based index (1 = newest)."
    risk_level = "safe"

    async def execute(self, index: int = 1, **kwargs: Any) -> ToolResult:
        store = _get_store()
        if store is None:
            return ToolResult(success=False, error="Clipboard store unavailable")

        entry = store.get(index)
        if entry is None:
            return ToolResult(success=False, output=f"No entry at index {index}.")

        return ToolResult(
            success=True,
            output=f"[{entry.timestamp}] {entry.text}",
            data={"text": entry.text, "timestamp": entry.timestamp},
        )


@registry.register
class ClipClearTool(BaseTool):
    name = "clip_clear"
    description = "Clear all clipboard history entries."
    risk_level = "destructive"

    async def execute(self, **kwargs: Any) -> ToolResult:
        store = _get_store()
        if store is None:
            return ToolResult(success=False, error="Clipboard store unavailable")

        store.clear()
        return ToolResult(success=True, output="Clipboard history cleared.")
