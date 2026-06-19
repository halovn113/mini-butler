"""Cross-platform location primitives — WiFi scan, GeoClue2, timezone.

Wraps platform-specific tools (nmcli, netsh, airport, gi/Geoclue) behind
a uniform async interface. Falls back gracefully when the tool is missing.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger("butler.platform.location")


# ── WiFi scan ────────────────────────────────────────────────────────────


def wifi_scan_aps() -> list[dict]:
    """Nearby APs as [{macAddress, signalStrength(dBm)}].

    Platform-specific backends:
      Linux  → nmcli
      macOS  → /System/Library/PrivateFrameworks/Apple80211.framework/…/airport -I
      Windows→ netsh wlan show networks mode=bssid
    """
    platform = sys.platform
    if platform == "linux":
        return _nmcli_scan()
    elif platform == "darwin":
        return _airport_scan()
    elif platform == "win32":
        return _netsh_scan()
    return []


def current_ssid() -> Optional[str]:
    """SSID of the currently connected WiFi network.

    Returns None if not connected or the tool is unavailable.
    """
    platform = sys.platform
    if platform == "linux":
        return _nmcli_ssid()
    elif platform == "darwin":
        return _airport_ssid()
    elif platform == "win32":
        return _netsh_ssid()
    return None


def _nmcli_scan() -> list[dict]:
    aps: list[dict] = []
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "BSSID,SIGNAL", "dev", "wifi", "list"],
            capture_output=True, text=True, timeout=8,
        )
        for line in result.stdout.splitlines():
            line = line.replace("\\:", ":")  # nmcli escapes BSSID colons
            bssid, _, sig = line.rpartition(":")
            if len(bssid) != 17:
                continue
            try:
                pct = int(sig)
            except ValueError:
                continue
            dbm = (pct // 2) - 100
            aps.append({"macAddress": bssid.lower(), "signalStrength": dbm})
    except Exception as exc:
        logger.debug("nmcli wifi scan failed: %s", exc)
    return aps


def _nmcli_ssid() -> Optional[str]:
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"],
            capture_output=True, text=True, timeout=3,
        )
        for line in result.stdout.splitlines():
            if line.startswith("yes:"):
                return line.split(":", 1)[1]
    except Exception as exc:
        logger.debug("nmcli ssid failed: %s", exc)
    return None


def _airport_scan() -> list[dict]:
    aps: list[dict] = []
    path = _airport_path()
    if not path:
        return aps
    try:
        result = subprocess.run(
            [path, "-s"], capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines()[1:]:  # skip header
            parts = line.split()
            if len(parts) >= 3:
                bssid = parts[0] if ":" in parts[0] else None
                if not bssid:
                    continue
                try:
                    rssi = int(parts[2])  # RSSI in dBm
                except (ValueError, IndexError):
                    rssi = -80
                aps.append({"macAddress": bssid.lower(), "signalStrength": rssi})
    except Exception as exc:
        logger.debug("airport scan failed: %s", exc)
    return aps


def _airport_ssid() -> Optional[str]:
    path = _airport_path()
    if not path:
        return None
    try:
        result = subprocess.run(
            [path, "-I"], capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.splitlines():
            if "SSID" in line and "BSSID" not in line:
                return line.split(":", 1)[1].strip()
    except Exception as exc:
        logger.debug("airport ssid failed: %s", exc)
    return None


def _airport_path() -> Optional[str]:
    """Locate the airport binary on macOS."""
    candidates = [
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
        "/usr/sbin/airport",
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def _netsh_scan() -> list[dict]:
    aps: list[dict] = []
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "networks", "mode=bssid"],
            capture_output=True, text=True, timeout=15,
        )
        current_bssid = None
        for line in result.stdout.splitlines():
            stripped = line.strip()
            # Match "BSSID 1 : aa:bb:cc:dd:ee:ff" or similar
            bssid_match = re.match(r"^BSSID\s+\d+\s*:\s*([\da-fA-F:]+)", stripped)
            if bssid_match:
                current_bssid = bssid_match.group(1).lower()
                continue
            # Match "Signal             : XX%"  (localized so may vary)
            if current_bssid and "%" in stripped and "Signal" in stripped:
                try:
                    pct = int(re.search(r"(\d+)%", stripped).group(1))
                    dbm = (pct // 2) - 100
                    aps.append({"macAddress": current_bssid, "signalStrength": dbm})
                except (AttributeError, ValueError):
                    pass
                current_bssid = None
    except Exception as exc:
        logger.debug("netsh wlan scan failed: %s", exc)
    return aps


def _netsh_ssid() -> Optional[str]:
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "interfaces"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.splitlines():
            stripped = line.strip()
            if stripped.startswith("SSID") and "BSSID" not in stripped:
                return stripped.split(":", 1)[1].strip()
    except Exception as exc:
        logger.debug("netsh ssid failed: %s", exc)
    return None


# ── GeoClue2 (Linux only) ────────────────────────────────────────────────


async def geoclue_location(timeout: float = 8.0) -> Optional[dict]:
    """Try GeoClue2 (system location service) on Linux.

    Returns dict with keys: lat, lon, accuracy, source="geoclue".
    None on timeout / unavailable / non-Linux.
    """
    if sys.platform != "linux":
        return None
    try:
        return await asyncio.get_event_loop().run_in_executor(
            None, _geoclue_sync
        )
    except asyncio.TimeoutError:
        logger.debug("GeoClue2 timed out")
        return None
    except Exception as exc:
        logger.debug("GeoClue2 unavailable: %s", exc)
        return None


def _geoclue_sync() -> Optional[dict]:
    """Blocking GeoClue2 lookup via gi.repository (Geoclue.Simple)."""
    try:
        import gi  # type: ignore[import-untyped]
        gi.require_version("Geoclue", "2.0")
        from gi.repository import Geoclue  # type: ignore[import-untyped]
    except Exception as exc:
        logger.debug("GeoClue2 gi bindings unavailable: %s", exc)
        return None

    try:
        simple = Geoclue.Simple.new_sync(
            "butler", Geoclue.AccuracyLevel.CITY, None,
        )
        loc = simple.get_location()
        if loc is None:
            logger.debug("GeoClue2 returned no location fix")
            return None
        lat = float(loc.get_property("latitude"))
        lon = float(loc.get_property("longitude"))
        acc = round(loc.get_property("accuracy"))
        logger.info("GeoClue2 fix: %.6f, %.6f (±%sm)", lat, lon, acc)
        return {"lat": lat, "lon": lon, "accuracy": acc, "source": "geoclue"}
    except Exception as exc:
        logger.debug("GeoClue2 lookup failed: %s", exc)
        return None


# ── Timezone ─────────────────────────────────────────────────────────────


def system_timezone() -> str:
    """Best-effort IANA timezone for this machine.

    Uses /etc/localtime (Linux), timedatectl (Linux with systemd),
    registry (Windows), or systemsetup (macOS).
    Falls back to TZ env var or UTC.
    """
    platform = sys.platform
    if platform == "linux":
        return _linux_timezone()
    elif platform == "win32":
        return _windows_timezone()
    elif platform == "darwin":
        return _macos_timezone()
    return os.environ.get("TZ", "UTC")


def _linux_timezone() -> str:
    # /etc/localtime is usually a symlink into …/zoneinfo/<Area>/<City>.
    try:
        parts = Path("/etc/localtime").resolve().parts
        if "zoneinfo" in parts:
            tz = "/".join(parts[parts.index("zoneinfo") + 1:])
            if tz:
                return tz
    except Exception:
        pass
    # Fallback: timedatectl
    try:
        result = subprocess.run(
            ["timedatectl", "show", "--property=Timezone", "--value"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0:
            tz = result.stdout.strip()
            if tz and "/" in tz:
                return tz
    except Exception:
        pass
    return os.environ.get("TZ", "UTC")


def _windows_timezone() -> str:
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation' | Select-Object -ExpandProperty TimeZoneKeyName"],
            capture_output=True, text=True, timeout=5,
        )
        tz = result.stdout.strip()
        if tz:
            # Windows names like "Turkey Standard Time" → pytz might handle
            return tz
    except Exception:
        pass
    return os.environ.get("TZ", "UTC")


def _macos_timezone() -> str:
    try:
        result = subprocess.run(
            ["systemsetup", "-gettimezone"],
            capture_output=True, text=True, timeout=5,
        )
        tz = result.stdout.replace("Time Zone:", "").strip()
        if tz:
            return tz
    except Exception:
        pass
    # Fallback: /etc/localtime symlink read
    try:
        tz = os.readlink("/etc/localtime")
        if "zoneinfo" in tz:
            return tz.split("zoneinfo/", 1)[1]
    except Exception:
        pass
    return os.environ.get("TZ", "UTC")
