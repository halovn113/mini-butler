"""Tests for clipboard store — circular buffer, dedup, search, clear."""
from __future__ import annotations

from unittest.mock import MagicMock

from butler.data.clipboard_store import MAX_HISTORY, ClipEntry, ClipboardStore


class TestClipboardStore:
    """Tests use a MagicMock for the KV store with a backing dict to simulate
    real read-after-write behaviour."""

    def _make_store(self):
        data: dict[str, str] = {}
        kv = MagicMock()

        def get_side_effect(key: str, default: str = "") -> str:
            return data.get(key, default)

        def set_side_effect(key: str, value: str) -> None:
            data[key] = value

        def delete_side_effect(key: str) -> None:
            data.pop(key, None)

        kv.get.side_effect = get_side_effect
        kv.set.side_effect = set_side_effect
        kv.delete.side_effect = delete_side_effect

        return ClipboardStore(kv), kv, data

    # ── dedup ────────────────────────────────────────────────────────────────

    def test_add_dedup(self) -> None:
        """Adding the same text twice only stores one entry."""
        store, kv, _ = self._make_store()

        store.add("hello")
        store.add("hello")  # should be deduped

        # Two kv.set calls: one for clip_meta, one for clip_0001
        assert kv.set.call_count == 2

        entries = store.list_recent(10)
        assert len(entries) == 1
        assert entries[0].text == "hello"

    def test_add_distinct_no_dedup(self) -> None:
        """Adding different texts stores each one."""
        store, _, _ = self._make_store()

        store.add("hello")
        store.add("world")

        entries = store.list_recent(10)
        assert len(entries) == 2
        assert entries[0].text == "world"
        assert entries[1].text == "hello"

    # ── FIFO overflow ───────────────────────────────────────────────────────

    def test_fifo_overflow(self) -> None:
        """Adding more than MAX_HISTORY entries keeps only the most recent 50."""
        store, kv, _ = self._make_store()

        for i in range(MAX_HISTORY + 1):  # 51 entries
            store.add(f"entry-{i}")

        entries = store.list_recent(MAX_HISTORY + 10)
        assert len(entries) == MAX_HISTORY
        # Newest first; the oldest entry (entry-0) should be gone
        assert entries[0].text == "entry-50"
        assert entries[-1].text == "entry-1"

        clip_keys = {
            c[0][0] for c in kv.set.call_args_list
            if c[0][0].startswith("clip_") and c[0][0] != "clip_meta"
        }
        assert len(clip_keys) == MAX_HISTORY
    # ── search ──────────────────────────────────────────────────────────────

    def test_search(self) -> None:
        """Search finds case-insensitive substring matches."""
        store, _, _ = self._make_store()

        store.add("Hello World")
        store.add("Goodbye Moon")
        store.add("hello again")

        results = store.search("hello")
        assert len(results) == 2
        assert all("hello" in r.text.lower() for r in results)

        results = store.search("moon")
        assert len(results) == 1
        assert results[0].text == "Goodbye Moon"

        results = store.search("zzzz")
        assert results == []

    def test_search_empty_query(self) -> None:
        """Empty query returns empty list."""
        store, _, _ = self._make_store()
        store.add("hello")
        assert store.search("") == []

    # ── clear ───────────────────────────────────────────────────────────────

    def test_clear(self) -> None:
        """Clear removes all entries and meta."""
        store, kv, _ = self._make_store()

        store.add("one")
        store.add("two")
        assert len(store.list_recent(10)) == 2

        store.clear()

        assert store.list_recent(10) == []
        # clip_meta should have been deleted
        meta_deleted = any(
            c[0][0] == "clip_meta"
            for c in kv.delete.call_args_list
        )
        assert meta_deleted

    # ── get (1-based) ───────────────────────────────────────────────────────

    def test_get_by_index(self) -> None:
        """1-based index: 1 = newest."""
        store, _, _ = self._make_store()

        store.add("first")
        store.add("second")
        store.add("third")

        assert store.get(1).text == "third"
        assert store.get(2).text == "second"
        assert store.get(3).text == "first"
        assert store.get(0) is None  # no zero
        assert store.get(4) is None  # out of range

    def test_get_empty(self) -> None:
        """Get on empty store returns None."""
        store, _, _ = self._make_store()
        assert store.get(1) is None
