"""Background clipboard monitor — polls pyperclip on a daemon thread."""
from __future__ import annotations

import logging
import threading
import time

import pyperclip

from butler.data.clipboard_store import ClipboardStore

_POLL_INTERVAL = 1.0
log = logging.getLogger("butler.clipboard_monitor")


class ClipboardMonitor:
    """Polls the system clipboard and records changes to a ClipboardStore."""

    def __init__(self) -> None:
        self._last = ""
        self._store: ClipboardStore | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, store: ClipboardStore) -> None:
        """Begin polling on a daemon thread."""
        self._store = store
        self._last = pyperclip.paste()
        self._thread = threading.Thread(target=self._poll, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Signal the polling thread to exit."""
        self._stop.set()

    def _poll(self) -> None:
        while not self._stop.wait(_POLL_INTERVAL):
            try:
                text = pyperclip.paste()
                if text and text != self._last:
                    self._store.add(text)
                    self._last = text
            except Exception as exc:
                log.debug("clipboard poll error: %s", exc)


# Module-level convenience instance.
clipboard_monitor = ClipboardMonitor()
