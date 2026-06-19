"""Cross-platform daemon management — abstract backend for init systems.

Provides a uniform interface for installing, starting, stopping, enabling,
and checking the status of a user-level daemon across systemd (Linux),
launchd (macOS), and Windows Task Scheduler.
"""
from __future__ import annotations

import logging
import os
import shlex
import subprocess
import sys
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

logger = logging.getLogger("butler.platform.daemon")

_SERVICE_NAME = "butler"


def get_daemon_backend() -> DaemonBackend:
    """Return the appropriate backend for the current platform."""
    platform = sys.platform
    if platform == "linux":
        return SystemdBackend()
    elif platform == "darwin":
        return LaunchdBackend()
    elif platform == "win32":
        return WindowsTaskBackend()
    raise RuntimeError(f"Unsupported platform: {platform}")


class DaemonBackend(ABC):
    """Abstract base for daemon lifecycle management."""

    @abstractmethod
    def service_path(self) -> Optional[Path]:
        """Path to the installed service file, or None if not installed."""

    @abstractmethod
    def install(self, venv_python: str, working_dir: str) -> bool:
        """Install the service file. Returns True on success."""

    @abstractmethod
    def is_active(self) -> Optional[bool]:
        """Check if the service is running. None = unknown, True = active."""

    @abstractmethod
    def enable(self) -> bool:
        """Enable the service to start on boot."""

    @abstractmethod
    def disable(self) -> bool:
        """Disable the service."""

    @abstractmethod
    def start(self) -> bool:
        """Start the service now."""

    @abstractmethod
    def stop(self) -> bool:
        """Stop the service now."""

    @abstractmethod
    def daemon_reload(self) -> bool:
        """Reload the daemon configuration."""

    @abstractmethod
    def status_text(self) -> str:
        """Human-readable status display."""


class SystemdBackend(DaemonBackend):
    """systemd --user service manager (Linux)."""

    def service_path(self) -> Optional[Path]:
        p = Path.home() / ".config" / "systemd" / "user" / f"{_SERVICE_NAME}.service"
        return p if p.exists() else None

    def install(self, venv_python: str, working_dir: str) -> bool:
        systemd_dir = Path.home() / ".config" / "systemd" / "user"
        systemd_dir.mkdir(parents=True, exist_ok=True)
        target = systemd_dir / f"{_SERVICE_NAME}.service"
        content = f"""[Unit]
Description=Butler v2 — Personal AI Assistant (Daemon)
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User={os.environ.get("USER", "")}
WorkingDirectory={shlex.quote(working_dir)}
EnvironmentFile={working_dir}/.env
ExecStart={shlex.quote(venv_python)} -m butler --daemon
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=butler

# Security hardening
NoNewPrivileges=yes
ReadWritePaths=/home/{os.environ.get("USER", "")}

[Install]
WantedBy=multi-user.target
"""
        target.write_text(content)
        logger.info("Service file installed: %s", target)
        return True

    def _run(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["systemctl", "--user", *args],
            capture_output=True, text=True,
        )

    def is_active(self) -> Optional[bool]:
        r = self._run("is-active", f"{_SERVICE_NAME}.service")
        return r.stdout.strip() == "active" if r.returncode == 0 else False

    def enable(self) -> bool:
        return self._run("enable", f"{_SERVICE_NAME}.service").returncode == 0

    def disable(self) -> bool:
        return self._run("disable", f"{_SERVICE_NAME}.service").returncode == 0

    def start(self) -> bool:
        return self._run("start", f"{_SERVICE_NAME}.service").returncode == 0

    def stop(self) -> bool:
        return self._run("stop", f"{_SERVICE_NAME}.service").returncode == 0

    def daemon_reload(self) -> bool:
        return self._run("daemon-reload").returncode == 0

    def status_text(self) -> str:
        r = self._run("status", f"{_SERVICE_NAME}.service", "--no-pager", "-l")
        return r.stdout + r.stderr


class LaunchdBackend(DaemonBackend):
    """launchd service manager (macOS)."""

    @property
    def _plist_path(self) -> Path:
        return Path.home() / "Library" / "LaunchAgents" / f"com.{_SERVICE_NAME}.daemon.plist"

    def service_path(self) -> Optional[Path]:
        p = self._plist_path
        return p if p.exists() else None

    def install(self, venv_python: str, working_dir: str) -> bool:
        target = self._plist_path
        target.parent.mkdir(parents=True, exist_ok=True)
        content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.{_SERVICE_NAME}.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>{shlex.quote(venv_python)}</string>
        <string>-m</string>
        <string>butler</string>
        <string>--daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{shlex.quote(working_dir)}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>{os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/com.{_SERVICE_NAME}.daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/com.{_SERVICE_NAME}.daemon.err</string>
</dict>
</plist>
"""
        target.write_text(content)
        logger.info("LaunchAgent installed: %s", target)
        return True

    def _launchctl(self, subcmd: str) -> bool:
        r = subprocess.run(
            ["launchctl", subcmd, str(self._plist_path)],
            capture_output=True, text=True,
        )
        return r.returncode == 0

    def is_active(self) -> Optional[bool]:
        try:
            r = subprocess.run(
                ["launchctl", "list", f"com.{_SERVICE_NAME}.daemon"],
                capture_output=True, text=True,
            )
            return r.returncode == 0
        except Exception:
            return None

    def enable(self) -> bool:
        return self._launchctl("load")

    def disable(self) -> bool:
        return self._launchctl("unload")

    def start(self) -> bool:
        return self._launchctl("kickstart")

    def stop(self) -> bool:
        result = subprocess.run(
            ["launchctl", "bootout", f"gui/{os.getuid()}/{str(self._plist_path)}"],
            capture_output=True, text=True,
        )
        return result.returncode == 0

    def daemon_reload(self) -> bool:
        self.stop()
        return self._launchctl("load")

    def status_text(self) -> str:
        try:
            r = subprocess.run(
                ["launchctl", "list", f"com.{_SERVICE_NAME}.daemon"],
                capture_output=True, text=True,
            )
            return r.stdout + r.stderr
        except Exception as e:
            return f"launchctl failed: {e}"


class WindowsTaskBackend(DaemonBackend):
    """Windows Task Scheduler backend."""

    _TASK_NAME = f"ButlerDaemon"

    def service_path(self) -> Optional[Path]:
        # Windows doesn't have a single service file; check if task exists
        try:
            r = subprocess.run(
                ["schtasks", "/Query", "/TN", self._TASK_NAME, "/FO", "CSV"],
                capture_output=True, text=True, timeout=5,
            )
            return Path(f"schtasks://{self._TASK_NAME}") if r.returncode == 0 else None
        except Exception:
            return None

    def install(self, venv_python: str, working_dir: str) -> bool:
        task_cmd = f'"{venv_python}" -m butler --daemon'
        try:
            r = subprocess.run(
                [
                    "schtasks", "/Create", "/SC", "ONLOGON",
                    "/TN", self._TASK_NAME,
                    "/TR", task_cmd,
                    "/DELAY", "0000:30",  # 30s delay after logon
                    "/F",  # overwrite if exists
                ],
                capture_output=True, text=True, timeout=10,
            )
            return r.returncode == 0
        except Exception as e:
            logger.error("schtasks create failed: %s", e)
            return False

    def _run(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["schtasks", *args],
            capture_output=True, text=True, timeout=10,
        )

    def is_active(self) -> Optional[bool]:
        try:
            r = self._run("/Query", "/TN", self._TASK_NAME, "/FO", "CSV")
            if r.returncode != 0:
                return None
            # CSV: "TaskName","Status","Next Run","Last Run","Last Result"
            for line in r.stdout.splitlines():
                if self._TASK_NAME in line:
                    status = line.split(",")[1].strip('"') if "," in line else ""
                    return status == "Running"
            return None
        except Exception:
            return None

    def enable(self) -> bool:
        return self._run("/Change", "/TN", self._TASK_NAME, "/ENABLE").returncode == 0

    def disable(self) -> bool:
        return self._run("/Change", "/TN", self._TASK_NAME, "/DISABLE").returncode == 0

    def start(self) -> bool:
        return self._run("/Run", "/TN", self._TASK_NAME).returncode == 0

    def stop(self) -> bool:
        return self._run("/End", "/TN", self._TASK_NAME).returncode == 0

    def daemon_reload(self) -> bool:
        # No reload concept in Task Scheduler; just ensure it's enabled
        return self.enable()

    def status_text(self) -> str:
        try:
            r = self._run("/Query", "/TN", self._TASK_NAME, "/FO", "LIST", "/V")
            return r.stdout + r.stderr
        except Exception as e:
            return f"schtasks failed: {e}"
