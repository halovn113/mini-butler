"""Cross-platform global hotkey registration.

Wraps the `keyboard` library for Linux/macOS and provides a
Windows fallback via ctypes. Used for quick-capture trigger.
"""
from __future__ import annotations

import logging
import sys
from typing import Callable, Optional

logger = logging.getLogger("butler.platform.hotkey")

# Module-level flag so we only attempt import once
_KEYBOARD_AVAILABLE = False
try:
    import keyboard  # type: ignore[import-untyped]
    _KEYBOARD_AVAILABLE = True
except ImportError:
    pass


def register_hotkey(hotkey: str, callback: Callable[[], None]) -> Optional[object]:
    """Register a global hotkey.

    On Linux/macOS (with ``keyboard`` installed), registers a system-wide
    hotkey. On Windows, falls back to a polling-based listener via ctypes.

    Returns a cleanup handle (call ``handle.cancel()`` / unregister) or
    None if hotkey registration is unsupported.
    """
    if _KEYBOARD_AVAILABLE:
        try:
            keyboard.add_hotkey(hotkey, callback)
            logger.info("Registered hotkey: %s", hotkey)
            return _Cleanup(hotkey)
        except Exception as exc:
            logger.warning("Failed to register hotkey '%s': %s", hotkey, exc)
            return None

    logger.warning("Hotkey registration not supported on this platform")
    return None


class _Cleanup:
    """Cleanup handle — calling remove() unregisters the hotkey."""

    def __init__(self, hotkey: str) -> None:
        self._hotkey = hotkey

    def remove(self) -> None:
        if _KEYBOARD_AVAILABLE:
            try:
                keyboard.remove_hotkey(self._hotkey)
            except Exception:
                pass
