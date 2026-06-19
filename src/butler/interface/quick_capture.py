"""Quick capture popup — triggered by global hotkey (Ctrl+Shift+Space).

Opens a minimal input prompt for quickly jotting down notes, reminders,
or queries without switching to the full TUI.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from butler.config import config

log = logging.getLogger("butler.quick_capture")


def on_quick_capture() -> None:
    """Callback invoked by the global hotkey.

    Runs the quick-capture flow in a fire-and-forget thread.
    """
    try:
        import threading
        thread = threading.Thread(target=_capture_sync, daemon=True)
        thread.start()
    except Exception as exc:
        log.error("quick capture failed: %s", exc)


def _capture_sync() -> None:
    """Synchronous quick-capture flow — runs in a daemon thread."""
    try:
        text = _prompt_user()
        if not text or not text.strip():
            return
        _process(text.strip())
    except Exception as exc:
        log.error("quick capture error: %s", exc)


def _prompt_user() -> Optional[str]:
    """Show a tkinter input dialog for quick capture.

    Falls back to console input if tkinter is unavailable.
    """
    try:
        import tkinter
        from tkinter import simpledialog
    except ImportError:
        return _console_prompt()

    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        result = simpledialog.askstring(
            "Butler Quick Capture",
            "📝 Note / reminder / query:",
            parent=root,
        )
        return result
    finally:
        try:
            root.destroy()
        except Exception:
            pass


def _console_prompt() -> Optional[str]:
    """Fallback terminal prompt."""
    try:
        result = input("\n📝 Quick capture (Ctrl+D to cancel): ")
        return result
    except (EOFError, KeyboardInterrupt):
        return None


def _process(text: str) -> None:
    """Process captured text — store as note/reminder."""
    log.info("Quick capture: %s", text[:80])

    # Store in profile notes
    try:
        from butler.data.layer import data_layer
        from butler.data.sqlite_store import SQLiteKVStore
        from butler.platform.paths import data_dir

        # Use KV store to persist quick captures
        kv = data_layer.kv
        if kv is None:
            return

        now = datetime.now().isoformat()
        key = f"quick_capture_{now}"
        kv.set(key, text)

        # Notify via desktop notification if available
        try:
            from butler.agent.notifier import notifier
            asyncio.run_coroutine_threadsafe(
                notifier.send(
                    "Butler: Quick Capture",
                    text[:120],
                ),
                asyncio.get_event_loop(),
            )
        except Exception:
            pass

        log.info("Quick capture saved: %s", key)
    except Exception as exc:
        log.debug("Quick capture storage failed: %s", exc)
