"""
Bantz environment probe — runs once at import time and caches the result.

Builds a lightweight snapshot of the host environment so the planner can
make informed decisions (right browser, right terminal, right editor) without
guessing or relying on LLM training-data assumptions.
"""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class EnvSnapshot:
    os_name: str = "Linux"
    os_version: str = ""
    display_server: str = ""
    shell: str = ""
    package_manager: str = ""
    browsers: list[str] = field(default_factory=list)
    terminals: list[str] = field(default_factory=list)
    editors: list[str] = field(default_factory=list)
    media_players: list[str] = field(default_factory=list)
    file_managers: list[str] = field(default_factory=list)

    def summary(self) -> str:
        """One-line string suitable for injection into the planner system prompt."""
        parts = [f"OS: {self.os_name}"]
        if self.os_version:
            parts[0] += f" {self.os_version}"
        if self.display_server:
            parts.append(f"Display: {self.display_server}")
        if self.shell:
            parts.append(f"Shell: {self.shell}")
        if self.browsers:
            parts.append(f"Browser: {self.browsers[0]}")
        if self.terminals:
            parts.append(f"Terminal: {self.terminals[0]}")
        if self.editors:
            parts.append(f"Editor: {self.editors[0]}")
        if self.media_players:
            parts.append(f"Media: {self.media_players[0]}")
        if self.file_managers:
            parts.append(f"Files: {self.file_managers[0]}")
        if self.package_manager:
            parts.append(f"Packages: {self.package_manager}")
        return " | ".join(parts)


def _probe_bins(candidates: list[str]) -> list[str]:
    return [c for c in candidates if shutil.which(c)]


def _read_os_release() -> tuple[str, str]:
    try:
        text = Path("/etc/os-release").read_text()
        name = version = ""
        for line in text.splitlines():
            if line.startswith("NAME="):
                name = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("VERSION_ID="):
                version = line.split("=", 1)[1].strip().strip('"')
        return name or "Linux", version
    except OSError:
        return "Linux", ""


def _detect_display_server() -> str:
    session = os.environ.get("XDG_SESSION_TYPE", "").lower()
    if session in ("wayland", "x11", "mir"):
        return session
    if os.environ.get("WAYLAND_DISPLAY"):
        return "wayland"
    if os.environ.get("DISPLAY"):
        return "x11"
    return ""


def _detect_package_manager() -> str:
    for pm in ("pacman", "apt", "dnf", "brew", "zypper", "xbps-install", "emerge"):
        if shutil.which(pm):
            return pm
    return ""


def probe() -> EnvSnapshot:
    """Probe the host environment. Inexpensive — all stdlib, no network."""
    os_name, os_version = _read_os_release()
    return EnvSnapshot(
        os_name=os_name,
        os_version=os_version,
        display_server=_detect_display_server(),
        shell=os.path.basename(os.environ.get("SHELL", "")),
        package_manager=_detect_package_manager(),
        browsers=_probe_bins(["firefox", "chromium", "google-chrome", "brave", "opera"]),
        terminals=_probe_bins(["kitty", "alacritty", "wezterm", "gnome-terminal", "konsole", "xterm"]),
        editors=_probe_bins(["nvim", "vim", "code", "gedit", "kate"]),
        media_players=_probe_bins(["mpv", "vlc", "totem"]),
        file_managers=_probe_bins(["thunar", "nautilus", "dolphin", "nemo"]),
    )


# ── Module-level singleton — probe once at import time ────────────────────────
env: EnvSnapshot = probe()
