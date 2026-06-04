# GitHub Copilot Usage — bantzv2 Issue-Fix Session (2026-06-04)

This document describes how GitHub Copilot (agent mode, Claude Sonnet 4.6) was
used to diagnose, fix, and ship seven issues in a single session.  For each
issue it shows: the problem, what Copilot found, the exact code change, and
the merged PR.

---

## Issue #462 — `_WSLogHandler.emit()` crashes silently, desktop UI never receives logs

**File:** `src/bantz/interface/ws_server.py` · **PR:** #467 · **Effort:** 1 line

### Problem
The `WsBroadcastServer` owns a queue stored as `self._q`, but the inner
`_WSLogHandler` class referenced it as `self._log_q`.  Every log record
caused an `AttributeError` that was silently swallowed, so the Tauri desktop
UI received no log output at all.

### How Copilot found it
Copilot searched for all queue attribute assignments in `ws_server.py`:

```
grep_search(query="_q|_log_q", includePattern="ws_server.py")
```

Found `self._q: asyncio.Queue` in `__init__` and `self._log_q.put_nowait`
inside `emit()` — clear mismatch.

### Exact change (1 line)
```diff
-  loop.call_soon_threadsafe(self._log_q.put_nowait, payload)
+  loop.call_soon_threadsafe(self._q.put_nowait, payload)
```

---

## Issue #465 — TUI service dots always show "Ollama" regardless of active provider

**File:** `src/bantz/interface/live_ui.py` · **PR:** #470 · **Effort:** ~35 lines

### Problem
`_services` was initialised with the hardcoded key `"Ollama"` and
`_probe_services()` always called `check_ollama()`.  Users running Claude,
OpenAI, or Gemini saw a dead "Ollama" dot with no health feedback for their
actual LLM.

### How Copilot found it
Copilot read `_build_layout()` and `_probe_services()` end-to-end, then
grepped for every place `"Ollama"` appeared as a string literal:

```
grep_search(query='"Ollama"', includePattern="live_ui.py")
```

Identified three hardcoded sites that needed to be dynamic.

### Key code Copilot introduced

**Dynamic service key from config:**
```python
_llm_svc = {
    "ollama": "Ollama", "claude": "Claude",
    "openai": "OpenAI", "gemini": "Gemini",
}.get((config.llm_provider or "ollama").lower(), "Ollama")
```

**New `check_claude()` and `check_openai()` coroutines:**
```python
async def check_claude() -> None:
    try:
        if config.anthropic_api_key:
            from bantz.llm.anthropic_client import claude
            self._services[_llm_key] = (
                ServiceDot.UP if claude.is_enabled() else ServiceDot.DOWN
            )
            self.add_log(f"✓ Claude configured → {config.anthropic_model}")
        else:
            self._services[_llm_key] = ServiceDot.UNCONFIGURED
            self.add_log("✗ Claude: BANTZ_ANTHROPIC_API_KEY not set")
    except Exception:
        self._services[_llm_key] = ServiceDot.DOWN

async def check_openai() -> None:
    try:
        if config.openai_api_key:
            from bantz.llm.openai_client import openai_client
            self._services[_llm_key] = (
                ServiceDot.UP if openai_client.is_enabled() else ServiceDot.DOWN
            )
            self.add_log(f"✓ OpenAI configured → {config.openai_model}")
        else:
            self._services[_llm_key] = ServiceDot.UNCONFIGURED
            self.add_log("✗ OpenAI: BANTZ_OPENAI_API_KEY not set")
    except Exception:
        self._services[_llm_key] = ServiceDot.DOWN
```

**Dispatch to the right coroutine:**
```python
if _provider == "claude":
    _llm_coro = check_claude()
elif _provider == "openai":
    _llm_coro = check_openai()
elif _provider == "gemini":
    _llm_coro = asyncio.sleep(0)   # Gemini dot handled separately
else:
    _llm_coro = check_ollama(client)
```

---

## Issue #460 — `finalizer.py` hardcodes Ollama, breaks Claude/OpenAI/Gemini users

**File:** `src/bantz/core/finalizer.py` · **PR:** #468 · **Effort:** ~5 lines (×3 sites)

### Problem
Three functions (`finalize()`, `finalize_stream()`, `synthesize_plan_response()`)
all contained:
```python
from bantz.llm.ollama import ollama
raw = await ollama.chat(messages)
```
Running with a non-Ollama provider caused every finalizer call to use the
wrong backend (or fail entirely if Ollama was not running).

### How Copilot fixed it
Copilot first confirmed the router existed:
```
grep_search(query="get_provider|get_llm", includePattern="router.py")
```
Then replaced all three sites with the router:
```python
from bantz.llm.router import get_llm
llm = get_llm()
raw = await llm.chat(messages)
```
Copilot also added `get_llm = get_provider` as a convenience alias in
`router.py` so callers don't need to invoke the function indirectly.

---

## Issue #461 — `summarizer.py` has Gemini-first / Ollama-fallback hardcode

**File:** `src/bantz/tools/summarizer.py` · **PR:** #469 · **Effort:** ~8 lines

### Problem
`SummarizerTool.execute()` tried Gemini first, fell back to Ollama, and
passed a `temperature=0.2` that Ollama's `.chat()` signature does not accept.

### Exact change Copilot made
```diff
-  try:
-      from bantz.llm.gemini import gemini
-      raw = await gemini.chat(messages, temperature=0.2)
-  except Exception:
-      from bantz.llm.ollama import ollama
-      raw = await ollama.chat(messages)
+  from bantz.llm.router import get_llm
+  llm = get_llm()
+  raw = await llm.chat(messages)
```

---

## Issue #464 — `_erase_prompt_line()` writes escape sequences while Live is running, duplicating the TUI

**File:** `src/bantz/interface/live_ui.py` · **PR:** #471 · **Effort:** ~25 lines

### Problem
After the user typed a message, `_erase_prompt_line()` used `os.write(1, …)`
to send raw ANSI cursor-movement escapes directly to stdout.  Rich Live was
simultaneously rendering to the same terminal, causing a race that reproduced
the entire TUI block below the real one.

### How Copilot diagnosed it
Copilot read `_erase_prompt_line()` and the surrounding input loop, then
searched for all `sys.stdout.write` and `os.write` calls inside the Live
context to find every site that bypassed the Rich render path.

### Solution Copilot introduced

**New `prompt` panel in the layout (size=1 row):**
```python
layout.split_column(
    Layout(name="header",  size=5),
    Layout(name="chat",    ratio=3),
    Layout(name="bottom",  ratio=1, minimum_size=7),
    Layout(name="prompt",  size=1),   # ← added
)
```

**`_render_prompt()` and state variable:**
```python
self._prompt_text: str = ""          # in __init__

def _render_prompt(self) -> Text:
    return Text.from_markup(self._prompt_text)
```

**`_erase_prompt_line()` simplified to a state reset:**
```diff
-  try:
-      width = self.console.width or 80
-      chars = 2 + len(typed)
-      lines_used = max(1, (chars + width - 1) // width)
-      os.write(1, f"\033[{lines_used}A\r\033[J".encode())
-  except OSError:
-      pass
+  self._prompt_text = ""    # next Live refresh clears the row cleanly
```

---

## Issue #463 — `Live(screen=True)` opens alternate buffer, no scrollback

**File:** `src/bantz/interface/live_ui.py` · **Status:** Already fixed (no PR needed)

### Finding
Copilot searched for `screen=` in `live_ui.py` and confirmed the Live
context manager already read:
```python
with Live(
    self._layout,
    console=self.console,
    refresh_per_second=self.REFRESH_FPS,
    screen=False,       # ← already correct
    transient=False,
    auto_refresh=False,
) as live:
```
`REFRESH_FPS: int = 4` was also already present.  No code change was required;
Copilot closed the issue with an explanatory GitHub comment.

---

## Issue #422 — EN→TR translation adds 4–8 s after LLM inference (total 12–18 s)

**Files:** `src/bantz/i18n/bridge.py`, `src/bantz/core/finalizer.py`,
`src/bantz/interface/ws_server.py` · **PR:** #472 · **Effort:** ~50 lines

### Problem
Two independent bottlenecks:
1. `bridge.to_turkish()` called MarianMT on the **full accumulated response**
   after all LLM inference finished — sequential, not overlapping.
2. No caching: identical butler stock phrases (`"Done. ✓"`, planning narration)
   re-ran the full neural translation every call.

### Part 1 — LRU cache Copilot added to `_Translator`

```python
_CACHE_MAXSIZE: int = 256   # new module constant

class _Translator:
    def __init__(self, direction):
        ...
        self._cache: dict[str, str] = {}    # ← added

    def translate(self, text: str) -> str:
        if not text.strip():
            return text
        cached = self._cache.get(text)      # ← cache hit
        if cached is not None:
            return cached
        self._load()
        ...
        result = self._tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
        if len(self._cache) >= _CACHE_MAXSIZE:
            self._cache.pop(next(iter(self._cache)))  # FIFO eviction
        self._cache[text] = result          # ← cache store
        return result
```

Same pattern added to `_chunk_translate()` for full-text caching.

### Part 2 — Sentence-boundary streaming Copilot introduced in `finalize_stream()`

Copilot first verified that `finalize()` callers store results as `str` (cannot
accept an async generator), then chose to implement streaming inside the
already-async-generator `finalize_stream()._stream()` instead:

```python
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")   # module-level constant

async def _stream() -> AsyncIterator[str]:
    from bantz.llm.router import get_llm
    from bantz.i18n.bridge import bridge as _bridge
    llm = get_llm()
    try:
        if _bridge.is_enabled():
            buf = ""
            async for token in llm.chat_stream(messages):
                buf += token
                parts = _SENTENCE_END_RE.split(buf, maxsplit=1)
                while len(parts) > 1:
                    sentence = parts[0].strip()
                    if sentence:
                        yield await _bridge.to_turkish(sentence)  # overlaps LLM
                        yield " "
                    buf = parts[1]
                    parts = _SENTENCE_END_RE.split(buf, maxsplit=1)
            if buf.strip():
                yield await _bridge.to_turkish(buf.strip())
        else:
            async for token in llm.chat_stream(messages):
                yield token
    except Exception:
        yield output[:1500]
```

Translation now **overlaps** LLM inference: as soon as a sentence boundary
arrives the translate call starts, while the LLM continues generating the
next sentence.

### Part 3 — ws_server streaming path updated by Copilot

Copilot traced how `result.stream` was consumed in `_handle_chat()` and found
the redundant re-translation:

```diff
-  # Accumulate all English tokens, then translate the full text at once.
-  response = await _to_tr("".join(parts))
+  # finalize_stream() already translates sentence-by-sentence when the
+  # language bridge is enabled (#422); plain join suffices either way.
+  response = "".join(parts)
```

---

## Summary

| Issue | File(s) changed | Lines | PR | Merged |
|---|---|---|---|---|
| #462 | `ws_server.py` | 1 | #467 | 2026-06-04 |
| #460 | `core/finalizer.py` + `llm/router.py` | ~20 | #468 | 2026-06-04 |
| #461 | `tools/summarizer.py` | ~8 | #469 | 2026-06-04 |
| #465 | `interface/live_ui.py` | ~35 | #470 | 2026-06-04 |
| #464 | `interface/live_ui.py` | ~25 | #471 | 2026-06-04 |
| #463 | *(none — already fixed)* | 0 | closed with comment | 2026-06-04 |
| #422 | `i18n/bridge.py` + `core/finalizer.py` + `ws_server.py` | ~50 | #472 | 2026-06-04 |

**All PRs were squash-merged to `main` and their source branches deleted.**
All corresponding GitHub issues confirmed `CLOSED` via `gh issue view NNN --json state`.

### Copilot workflow used for every issue

1. Read the affected file(s) before touching anything
2. Search for the exact symbol / string causing the bug
3. Make the minimal change, add no unrelated refactors
4. `python -m py_compile <file>` to verify syntax
5. `git checkout -b fix/NNN-…` → `git commit -F /tmp/commitNNN.txt` → `git push`
6. `gh pr create --body-file /tmp/prNNN_body.md` → `gh pr merge NNN --squash --delete-branch`
7. `gh issue view NNN --json state -q '.state'` → verify `CLOSED`
8. Update `COPILOT_CONTEXT.md` and push to `main`
