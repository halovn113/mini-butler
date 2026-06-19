"""Tests for macro system — store and tool."""
from __future__ import annotations

from unittest.mock import MagicMock

from butler.data.macro_store import Macro, MacroStep, MacroStore


class TestMacroStore:
    def test_list_empty(self) -> None:
        kv = MagicMock()
        kv.keys.return_value = []
        store = MacroStore(kv)
        assert store.list_macros() == []

    def test_save_and_retrieve(self) -> None:
        kv = MagicMock()
        kv.keys.return_value = ["macro_test1"]
        kv.get.return_value = (
            '{"name": "test1", "description": "test macro", '
            '"steps": [{"action": "key", "params": {"key": "enter"}}], "tags": []}'
        )
        store = MacroStore(kv)

        saved = store.save_macro(Macro(
            name="test1", description="test macro",
            steps=[MacroStep(action="key", params={"key": "enter"})],
        ))
        assert saved is True

        macro = store.get_macro("test1")
        assert macro is not None
        assert macro.name == "test1"
        assert len(macro.steps) == 1
        assert macro.steps[0].action == "key"
        assert macro.steps[0].params == {"key": "enter"}

    def test_list_returns_all(self) -> None:
        kv = MagicMock()
        kv.keys.return_value = ["macro_a", "macro_b"]
        kv.get.side_effect = [
            '{"name": "a", "steps": []}',
            '{"name": "b", "steps": []}',
        ]
        store = MacroStore(kv)
        macros = store.list_macros()
        assert len(macros) == 2

    def test_delete_macro(self) -> None:
        kv = MagicMock()
        kv.delete.return_value = True
        store = MacroStore(kv)
        assert store.delete_macro("test1") is True

    def test_get_nonexistent(self) -> None:
        kv = MagicMock()
        kv.get.return_value = None
        store = MacroStore(kv)
        assert store.get_macro("nonexistent") is None

    def test_save_failure(self) -> None:
        kv = MagicMock()
        kv.set.side_effect = RuntimeError("storage full")
        store = MacroStore(kv)
        result = store.save_macro(Macro(name="fail", steps=[]))
        assert result is False


class TestMacroModel:
    def test_macro_step_defaults(self) -> None:
        step = MacroStep(action="click")
        assert step.params == {}

    def test_macro_defaults(self) -> None:
        m = Macro(name="test")
        assert m.description == ""
        assert m.steps == []
        assert m.tags == []

    def test_macro_with_steps(self) -> None:
        steps = [
            MacroStep(action="key", params={"key": "a"}),
            MacroStep(action="wait", params={"seconds": 1.0}),
        ]
        m = Macro(name="test", steps=steps)
        assert len(m.steps) == 2
        assert m.steps[0].params["key"] == "a"
