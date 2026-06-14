"""
Bantz v2 — Location Service

Priority order:
1. .env manual override (BANTZ_CITY, BANTZ_LAT, BANTZ_LON)
2. Live GPS from phone (via gps_server HTTP endpoint)
3. WiFi SSID → places.json mapping
4. places.json primary location
5. GeoClue2 (system location service — primary automatic source, tried
   before IP geolocation)
6. ipinfo.io IP geolocation (works without permission, online only)
7. If everything fails: location unknown (no wrong-city guess)

Fetched once per session, cached in memory.
Call reset() to re-resolve (e.g. after receiving new GPS data).
"""
from __future__ import annotations

import asyncio
import json as _json_mod
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

from bantz.config import config

logger = logging.getLogger(__name__)

_shared_client: httpx.AsyncClient | None = None

def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient()
    return _shared_client

IPINFO_URL = "https://ipinfo.io/json"
TIMEOUT = 5.0


def _system_timezone() -> str:
    """Best-effort IANA timezone for this machine.

    Used when geolocation can't name a city but the app still needs a valid
    tz (calendar.py feeds Location.timezone straight into pytz.timezone()).
    Never invents a city — only the local clock's zone.
    """
    # /etc/localtime is usually a symlink into …/zoneinfo/<Area>/<City>.
    try:
        parts = Path("/etc/localtime").resolve().parts
        if "zoneinfo" in parts:
            tz = "/".join(parts[parts.index("zoneinfo") + 1:])
            if tz:
                return tz
    except Exception:
        pass
    import os
    return os.environ.get("TZ") or "UTC"


@dataclass
class Location:
    city: str
    country: str
    timezone: str
    region: str = ""
    lat: float = 0.0
    lon: float = 0.0
    source: str = "unknown"   # "config" | "geoclue" | "ipinfo" | "unknown"

    @property
    def is_live(self) -> bool:
        """True when location comes from a real-time source (GPS, WiFi, GeoClue)."""
        return self.source in ("phone_gps", "geoclue") or self.source.startswith("wifi:")

    @property
    def is_turkey(self) -> bool:
        return self.country == "TR"

    @property
    def display(self) -> str:
        parts = [p for p in [self.city, self.region, self.country] if p]
        if not parts:
            return "location unknown"
        return ", ".join(parts)


class LocationService:
    def __init__(self) -> None:
        self._cache: Optional[Location] = None
        self._lock = asyncio.Lock()

    async def get(self) -> Location:
        if self._cache is not None:
            return self._cache
        async with self._lock:
            if self._cache is not None:
                return self._cache
            self._cache = await self._resolve()
            logger.info(f"Location: {self._cache.display} via {self._cache.source}")
            return self._cache

    async def _resolve(self) -> Location:
        # 1. Manual .env override (BANTZ_CITY / BANTZ_LAT / BANTZ_LON)
        if loc := self._from_config():
            return loc

        # 2. Live GPS from phone (highest real-time priority)
        if loc := self._from_live_gps():
            return loc

        # 3. WiFi SSID → places.json match
        if loc := self._from_wifi_ssid():
            return loc

        # 4. places.json primary location (set via --setup places)
        if loc := self._from_places():
            return loc

        # 5. GeoClue2 (Linux system location)
        if loc := await self._from_geoclue():
            return loc

        # 6. ipinfo.io
        if loc := await self._from_ipinfo():
            return loc

        # 7. Nothing worked — be honest rather than guessing a wrong city.
        #    Keep a valid system timezone so time-dependent tools still run.
        logger.warning("All location sources failed — location unknown")
        return Location(
            city="", country="", region="",
            timezone=_system_timezone(),
            lat=0.0, lon=0.0, source="unknown",
        )

    def _from_config(self) -> Optional[Location]:
        """Read BANTZ_CITY / BANTZ_LAT / BANTZ_LON from config."""
        city = getattr(config, "location_city", "") or ""
        if not city:
            return None
        return Location(
            city=city,
            country=getattr(config, "location_country", "TR") or "TR",
            timezone=getattr(config, "location_timezone", "Europe/Istanbul") or "Europe/Istanbul",
            region=getattr(config, "location_region", "") or "",
            lat=float(getattr(config, "location_lat", 0.0) or 0.0),
            lon=float(getattr(config, "location_lon", 0.0) or 0.0),
            source="config",
        )

    def _from_places(self) -> Optional[Location]:
        """Read primary location from places.json (set via --setup places)."""
        import json
        from pathlib import Path

        places_path = Path.home() / ".local" / "share" / "bantz" / "places.json"
        if not places_path.exists():
            return None
        try:
            data = json.loads(places_path.read_text(encoding="utf-8"))
            if not data:
                return None

            # Find primary place, or fall back to first place
            place = None
            for v in data.values():
                if v.get("primary"):
                    place = v
                    break
            if not place:
                place = next(iter(data.values()))

            lat = place.get("lat", 0.0)
            lon = place.get("lon", 0.0)
            if lat == 0.0 and lon == 0.0:
                return None

            label = place.get("label", "Unknown")
            return Location(
                city=label,
                country="TR",
                timezone="Europe/Istanbul",
                lat=lat,
                lon=lon,
                source="places",
            )
        except Exception as exc:
            logger.debug(f"places.json read failed: {exc}")
            return None

    def _from_live_gps(self) -> Optional[Location]:
        """Read live GPS from phone (via gps_server's saved location file)."""
        try:
            from bantz.core.gps_server import gps_server
            loc_data = gps_server.latest
            if not loc_data:
                return None
            lat = loc_data.get("lat", 0.0)
            lon = loc_data.get("lon", 0.0)
            if lat == 0.0 and lon == 0.0:
                return None
            acc = round(loc_data.get("accuracy", 0))
            logger.info(f"Live GPS: {lat:.6f}, {lon:.6f} (±{acc}m)")
            return Location(
                city=f"GPS ({lat:.4f}, {lon:.4f})",
                country="TR",
                timezone="Europe/Istanbul",
                lat=lat,
                lon=lon,
                source="phone_gps",
            )
        except Exception as exc:
            logger.debug(f"Live GPS read failed: {exc}")
            return None

    @staticmethod
    def _current_ssid() -> Optional[str]:
        """Get the currently connected WiFi SSID via nmcli."""
        try:
            result = subprocess.run(
                ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"],
                capture_output=True, text=True, timeout=3,
            )
            for line in result.stdout.splitlines():
                if line.startswith("yes:"):
                    ssid = line.split(":", 1)[1].strip()
                    if ssid:
                        return ssid
        except Exception:
            pass
        return None

    def _from_wifi_ssid(self) -> Optional[Location]:
        """Match current WiFi SSID against places.json ssid field."""
        ssid = self._current_ssid()
        if not ssid:
            return None

        places_path = Path.home() / ".local" / "share" / "bantz" / "places.json"
        if not places_path.exists():
            return None
        try:
            data = _json_mod.loads(places_path.read_text(encoding="utf-8"))
            for name, place in data.items():
                if place.get("ssid") == ssid:
                    lat = place.get("lat", 0.0)
                    lon = place.get("lon", 0.0)
                    label = place.get("label", name)
                    logger.info(f"WiFi SSID '{ssid}' → {label}")
                    return Location(
                        city=label,
                        country="TR",
                        timezone="Europe/Istanbul",
                        lat=lat,
                        lon=lon,
                        source=f"wifi:{ssid}",
                    )
        except Exception as exc:
            logger.debug(f"WiFi SSID lookup failed: {exc}")
        return None

    async def _from_geoclue(self) -> Optional[Location]:
        """Try GeoClue2 (system location service). Primary automatic source.

        Bounded by a timeout so a stalled geoclue can't block startup; on
        timeout/failure the caller falls through to IP geolocation.
        """
        try:
            return await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, self._geoclue_sync
                ),
                timeout=8.0,
            )
        except asyncio.TimeoutError:
            logger.debug("GeoClue2 timed out")
            return None
        except Exception as exc:
            logger.debug(f"GeoClue2 unavailable: {exc}")
            return None

    def _geoclue_sync(self) -> Optional[Location]:
        """Blocking GeoClue2 lookup via gi.repository (Geoclue.Simple).

        The `gdbus` CLI cannot be used here: GeoClue2 binds each Client to the
        D-Bus connection that created it, so a Client made in one `gdbus call`
        is destroyed the instant that process exits ("Object does not exist").
        Geoclue.Simple holds a single connection open and blocks until the
        first fix is available.
        """
        try:
            import gi
            gi.require_version("Geoclue", "2.0")
            from gi.repository import Geoclue
        except Exception as exc:
            logger.debug(f"GeoClue2 gi bindings unavailable: {exc}")
            return None

        try:
            simple = Geoclue.Simple.new_sync(
                "bantz", Geoclue.AccuracyLevel.CITY, None,
            )
            loc = simple.get_location()
            if loc is None:
                logger.debug("GeoClue2 returned no location fix")
                return None

            lat = float(loc.get_property("latitude"))
            lon = float(loc.get_property("longitude"))
            if lat == 0.0 and lon == 0.0:
                return None
            acc = round(loc.get_property("accuracy"))
            logger.info("GeoClue2 fix: %.6f, %.6f (±%sm)", lat, lon, acc)

            # Reverse geocode lat/lon → city (best effort)
            city, country, tz = self._reverse_geocode_sync(lat, lon)
            return Location(
                city=city, country=country, timezone=tz,
                lat=lat, lon=lon, source="geoclue",
            )
        except Exception as exc:
            logger.debug(f"GeoClue2 lookup failed: {exc}")
            return None

    def _reverse_geocode_sync(self, lat: float, lon: float) -> tuple[str, str, str]:
        """Simple reverse geocode via nominatim (no API key)."""
        import json as _json
        import urllib.request
        url = (
            f"https://nominatim.openstreetmap.org/reverse"
            f"?lat={lat}&lon={lon}&format=json"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Bantz/2.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = _json.loads(r.read())
        addr = data.get("address", {})
        city = (addr.get("city") or addr.get("town") or
                addr.get("village") or addr.get("county") or "Unknown")
        country = addr.get("country_code", "").upper()
        # Nominatim doesn't return a tz; use the machine's local zone.
        tz = _system_timezone()
        return city, country, tz

    async def _from_ipinfo(self) -> Optional[Location]:
        try:
            client = _get_client()
            resp = await client.get(IPINFO_URL, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()

            lat, lon = 0.0, 0.0
            if loc_str := data.get("loc", ""):
                parts = loc_str.split(",")
                if len(parts) == 2:
                    lat, lon = float(parts[0]), float(parts[1])

            # No usable data → let the caller fall through to "unknown"
            # rather than emitting a blank/half-filled location.
            if not data.get("city") and lat == 0.0 and lon == 0.0:
                return None

            return Location(
                city=data.get("city", ""),
                country=data.get("country", ""),
                timezone=data.get("timezone") or _system_timezone(),
                region=data.get("region", ""),
                lat=lat, lon=lon,
                source="ipinfo",
            )
        except Exception as exc:
            logger.debug(f"ipinfo.io failed: {exc}")
            return None

    def reset(self) -> None:
        self._cache = None


location_service = LocationService()