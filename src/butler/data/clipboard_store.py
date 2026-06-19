"""Clipboard history store — circular buffer backed by KV store.

Keys: clip_0001 … clip_0050 (zero-padded).
Meta: clip_meta → JSON {"head": int, "count": int}.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

MAX_HISTORY = 50  # FIFO, drop oldest

log = logging.getLogger("butler.clipboard_store")


@dataclass
class ClipEntry:
    text: str
    timestamp: str  # ISO format
    source: str = ""


class ClipboardStore:
    """Circular-buffer clipboard history backed by a KV store."""

    def __init__(self, kv: Any) -> None:
        self._kv = kv

    # ── public API ──────────────────────────────────────────────────────────

    def add(self, text: str) -> None:
        """Append a clipboard entry.

        Dedup: silently skip if *text* is identical to the most recent entry.
        FIFO: when the buffer is full the oldest entry is overwritten.
        """
        meta = self._read_meta()
        if meta is None:
            meta = {"head": 0, "count": 0}

        # Dedup against the newest entry
        if meta["count"] > 0:
            newest_slot = (meta["head"] - 1) % MAX_HISTORY
            newest_raw = self._kv.get(_clip_key(newest_slot))
            if newest_raw:
                try:
                    newest = json.loads(newest_raw)
                    if newest.get("text") == text:
                        return  # duplicate
                except json.JSONDecodeError:
                    pass

        slot = meta["head"] % MAX_HISTORY
        entry = ClipEntry(
            text=text,
            timestamp=datetime.now().isoformat(timespec="seconds"),
        )
        self._kv.set(_clip_key(slot), json.dumps(entry.__dict__, ensure_ascii=False))

        meta["head"] = (meta["head"] + 1) % MAX_HISTORY
        if meta["count"] < MAX_HISTORY:
            meta["count"] += 1
        self._write_meta(meta)

    def list_recent(self, n: int = 20) -> list[ClipEntry]:
        """Return the *n* most recent entries, newest first."""
        meta = self._read_meta()
        if meta is None or meta["count"] == 0:
            return []

        n = min(n, meta["count"])
        result: list[ClipEntry] = []
        for i in range(1, n + 1):
            entry = self.get(i)
            if entry is not None:
                result.append(entry)
        return result

    def get(self, index: int) -> Optional[ClipEntry]:
        """Return entry by 1-based index (1 = newest).

        Returns *None* when the index is out of range.
        """
        meta = self._read_meta()
        if meta is None or index < 1 or index > meta["count"]:
            return None

        slot = (meta["head"] - index) % MAX_HISTORY
        raw = self._kv.get(_clip_key(slot))
        if not raw:
            return None
        try:
            return ClipEntry(**json.loads(raw))
        except (json.JSONDecodeError, TypeError) as exc:
            log.debug("corrupt clip entry at slot %d: %s", slot, exc)
            return None

    def clear(self) -> None:
        """Remove all clipboard history."""
        for i in range(MAX_HISTORY):
            self._kv.delete(_clip_key(i))
        self._kv.delete("clip_meta")

    def search(self, query: str) -> list[ClipEntry]:
        """Return matching entries (simple case-insensitive substring match), newest first."""
        meta = self._read_meta()
        if meta is None or meta["count"] == 0 or not query:
            return []

        query_lower = query.lower()
        results: list[ClipEntry] = []
        for i in range(meta["count"]):
            entry = self.get(i + 1)
            if entry is not None and query_lower in entry.text.lower():
                results.append(entry)
        return results

    # ── helpers ─────────────────────────────────────────────────────────────

    def _read_meta(self) -> Optional[dict]:
        raw = self._kv.get("clip_meta")
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def _write_meta(self, meta: dict) -> None:
        self._kv.set("clip_meta", json.dumps(meta))


def _clip_key(slot: int) -> str:
    """Return the KV key for a 0-based slot index (0 … *MAX_HISTORY* − 1)."""
    return f"clip_{slot + 1:04d}"
