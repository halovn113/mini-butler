"""Macro store — persistent storage for recorded macros.

Each macro is a named sequence of steps (key, type, click, scroll, wait, shell).
Stored in SQLite via the existing KV store or as a dedicated table.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

log = logging.getLogger("butler.data.macro_store")

MACRO_KV_PREFIX = "macro_"


@dataclass
class MacroStep:
    """A single step within a macro."""
    action: str  # "key" | "type" | "click" | "scroll" | "wait" | "shell"
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Macro:
    """A named, ordered sequence of automation steps."""
    name: str
    description: str = ""
    steps: list[MacroStep] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


class MacroStore:
    """Persistent macro storage via SQLite KV store."""

    def __init__(self, kv) -> None:
        self._kv = kv

    def list_macros(self) -> list[Macro]:
        """Return all stored macros."""
        macros: list[Macro] = []
        if self._kv is None:
            return macros
        try:
            all_keys = self._kv.keys()
            for key in all_keys:
                if key.startswith(MACRO_KV_PREFIX):
                    raw = self._kv.get(key)
                    if raw:
                        macros.append(_deserialize(raw, key))
        except Exception as exc:
            log.debug("macro list failed: %s", exc)
        return macros

    def get_macro(self, name: str) -> Optional[Macro]:
        """Get a macro by name."""
        if self._kv is None:
            return None
        try:
            raw = self._kv.get(MACRO_KV_PREFIX + name)
            if raw:
                return _deserialize(raw, MACRO_KV_PREFIX + name)
        except Exception as exc:
            log.debug("macro get failed: %s", exc)
        return None

    def save_macro(self, macro: Macro) -> bool:
        """Save or overwrite a macro."""
        if self._kv is None:
            return False
        try:
            data = {
                "name": macro.name,
                "description": macro.description,
                "steps": [{"action": s.action, "params": s.params} for s in macro.steps],
                "tags": macro.tags,
            }
            self._kv.set(MACRO_KV_PREFIX + macro.name, json.dumps(data))
            return True
        except Exception as exc:
            log.error("macro save failed: %s", exc)
            return False

    def delete_macro(self, name: str) -> bool:
        """Delete a macro by name."""
        if self._kv is None:
            return False
        try:
            self._kv.delete(MACRO_KV_PREFIX + name)
            return True
        except Exception as exc:
            log.debug("macro delete failed: %s", exc)
            return False


def _deserialize(raw: str, key: str) -> Macro:
    """Deserialize stored JSON into a Macro."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else json.loads(raw.decode())
        steps = [
            MacroStep(action=s.get("action", ""), params=s.get("params", {}))
            for s in data.get("steps", [])
        ]
        return Macro(
            name=data.get("name", key.replace(MACRO_KV_PREFIX, "")),
            description=data.get("description", ""),
            steps=steps,
            tags=data.get("tags", []),
        )
    except Exception as exc:
        log.warning("macro deserialize failed for %s: %s", key, exc)
        return Macro(name=key.replace(MACRO_KV_PREFIX, ""))
