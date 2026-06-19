# TODO — Bug Fix List (Phase 1 review)

All bugs found after DeepSeek implemented Phase 1. Fix in order.

---

## ✅ DONE — BUG-01 — `cli/setup.py` — stale `bantz.tools.*` imports (runtime crash)

**File:** `src/butler/cli/setup.py`  
**Lines:** 1059–1069  
**Severity:** Critical — `butler --doctor` crashes with `ModuleNotFoundError`

**Current code:**
```python
for _mod in (
    "bantz.tools.shell", "bantz.tools.system", "bantz.tools.filesystem",
    "bantz.tools.weather", "bantz.tools.web_search", "bantz.tools.web_reader",
    "bantz.tools.gmail", "bantz.tools.calendar", "bantz.tools.classroom",
    "bantz.tools.reminder",
):
    _importlib.import_module(_mod)
for _opt in (
    "bantz.tools.news", "bantz.tools.document", "bantz.tools.accessibility",
    "bantz.tools.visual_click", "bantz.tools.browser_control",
    "bantz.tools.screenshot_tool", "bantz.tools.desktop",
    "bantz.tools.delegate_task",
):
```

**Fix:** Replace every `"bantz.tools.` with `"butler.tools.` in both lists.

---

## ✅ DONE — BUG-02 — `cli/setup.py` — `answer` undefined in `_setup_systemd()` (NameError)

**File:** `src/butler/cli/setup.py`  
**Line:** 1491  
**Severity:** Critical — `butler --setup systemd` crashes with `NameError`

**Current code:**
```python
    _ensure_linger(user)
    print()

    # Ask if user wants to enable + start now
    if answer in ("", "y", "yes"):   # ← answer is never defined
        ok = backend.daemon_reload() and ok
```

**Fix:** Add the missing `input()` call before the `if`:
```python
    _ensure_linger(user)
    print()

    answer = input("Enable + start service now? [Y/n] ").strip().lower()
    if answer in ("", "y", "yes"):
        ok = True
        ok = backend.daemon_reload() and ok
```

---

## ✅ DONE — BUG-03 — `platform/location.py` — Windows timezone returns non-IANA name

**File:** `src/butler/platform/location.py`  
**Function:** `_windows_timezone()`  
**Lines:** 286–308  
**Severity:** Medium — returns `"Turkey Standard Time"` instead of `"Europe/Istanbul"`;
tools that consume this value (weather, scheduler) expect IANA format.

**Current order:** registry first → tzlocal fallback  
**Problem:** Registry always succeeds on Windows and returns Windows timezone name.
`tzlocal` (which returns IANA names) is never reached.

**Fix:** Swap the order — try `tzlocal` first, registry as last resort:
```python
def _windows_timezone() -> str:
    # tzlocal returns an IANA name on Windows (ZoneInfo)
    try:
        from tzlocal import get_localzone
        tz = str(get_localzone())
        if tz:
            return tz
    except ImportError:
        pass
    except Exception:
        pass
    # Fallback: Windows registry (non-IANA — only used when tzlocal not installed)
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation' | Select-Object -ExpandProperty TimeZoneKeyName"],
            capture_output=True, text=True, timeout=5,
        )
        tz = result.stdout.strip()
        if tz:
            return tz
    except Exception:
        pass
    return os.environ.get("TZ", "UTC")
```

---

## ✅ DONE — BUG-04 — `tests/platform/__init__.py` missing

**Path:** `tests/platform/__init__.py`  
**Severity:** Low — pytest may fail to collect `tests/platform/` without it

**Fix:** Create an empty file at `tests/platform/__init__.py`.

---

## ✅ DONE — COSMETIC-01 — `cli/setup.py` — stale `bantz` in user-facing strings

**File:** `src/butler/cli/setup.py`  
**Severity:** Cosmetic — no crash, but user sees old name  
**Affected lines (approx):** 55–66, 70, 225, 265, 292, 316, 422, 825, 994, 1004, 1111

**Fix:** Bulk replace all user-facing string occurrences:
- `bantz --setup` → `butler --setup`
- `bantz --doctor` → `butler --doctor`
- `bantz --once` → `butler --once`
- `Bantz —` → `Butler —`
- `Restart Bantz` → `Restart Butler`

Do NOT change references inside `vendor/bantz-web/` (submodule — leave as-is).

---

---

## ✅ DONE — BUG-05 — `data/migration.py:253` — default DB filename wrong

**File:** `src/butler/data/migration.py`  
**Line:** 253  
**Severity:** Medium — `python -m butler.data.migration --migrate` creates `bantz.db` instead of `butler.db`

**Current code:**
```python
db = args.db or (args.data_dir / "bantz.db")
```

**Fix:**
```python
db = args.db or (args.data_dir / "butler.db")
```

---

## ✅ DONE — BUG-06 — `core/brain.py:1160` — persona system prompt uses old name

**File:** `src/butler/core/brain.py`  
**Line:** ~1160  
**Severity:** Medium — LLM is told "You are Bantz" so it will refer to itself as "Bantz" in responses

**Current code:**
```python
"You are Bantz, a 1920s English butler who also keeps a sharp eye on "
```

**Fix:** Replace `Bantz` → `Butler` in this prompt string.

---

## ✅ DONE — BUG-07 — `tools/feed_tool.py:43` — hardcoded Linux config path

**File:** `src/butler/tools/feed_tool.py`  
**Line:** 43  
**Severity:** Medium — on Windows/macOS, user override feeds.yaml is never found

**Current code:**
```python
Path.home() / ".config" / "butler" / "feeds.yaml",
```

**Fix:**
```python
from butler.platform.paths import config_dir
# ...
config_dir() / "feeds.yaml",
```

---

## ✅ DONE — COSMETIC-02 — Scattered `bantz` string literals (29 files)

**Severity:** Cosmetic  
**Key instances to fix (by priority):**

| File | Line | Current | Fix |
|---|---|---|---|
| `agent/job_scheduler.py` | ~101 | `--who=bantz` | `--who=butler` |
| `core/context.py` | class def | `class BantzContext` | `class ButlerContext` |
| `core/brain.py` | import + usages | `BantzContext` | `ButlerContext` |
| All docstrings | various | `Bantz —` | `Butler —` |

**Note:** `vendor/bantz-web/` submodule — do NOT change.

---

## Verification after fixes

```bash
# 1. Import check — no crash
PYTHONPATH=src python -c "from butler.cli.setup import _doctor; print('OK')"

# 2. Location timezone returns IANA on Windows
PYTHONPATH=src python -c "
from butler.platform.location import system_timezone
tz = system_timezone()
print('TZ:', tz)
assert '/' in tz or tz == 'UTC', f'Not IANA: {tz}'
print('OK')
"

# 3. Tests pass
PYTHONPATH=src pytest tests/platform/ tests/tools/test_macro.py -v

# 4. No bantz imports remain in butler source (submodule excluded)
grep -rn "bantz" src/butler/ --include="*.py" | grep -v "bantz-web" | grep -v "#"
# → should only show string literals in comments, if any
```
