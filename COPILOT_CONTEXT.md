# Bantz — Copilot Context

## Project Identity

Bantz is a local-first, offline-capable AI assistant written in Python that runs entirely on the user's machine using Ollama as its LLM backend (default: `llama3.1:8b`). It presents itself as a 1920s English butler — always polite, subtly sarcastic, and firmly convinced he is a real person — handling Turkish-to-English translation, multi-step tool planning (web search, Gmail, Calendar, shell, filesystem, AT-SPI desktop control), voice I/O via faster-whisper + Piper TTS, and persistent memory via MemPalace (ChromaDB + SQLite knowledge graph). The primary user speaks Turkish on a Linux desktop; the entire pipeline — except optional Google/Telegram integrations — runs on-device with no cloud dependency.

---

## Stack

- **Language**: Python 3.11+, async-first (`asyncio` everywhere)
- **LLM backend**: Ollama HTTP API at `http://localhost:11434` — `llm/ollama.py`
- **Translation**: Helsinki-NLP MarianMT (`opus-mt-tr-en`, `opus-mt-tc-big-en-tr`) via `transformers` — `i18n/bridge.py`
- **TTS**: Piper binary (`~/.local/bin/piper` or miniforge3) + `tr_TR-dfki-medium.onnx` — audio via `pw-play` → `paplay` → `aplay`
- **STT**: `faster-whisper` (NOT installed) — `agent/stt.py`
- **Voice capture**: `pyaudio` + `webrtcvad` (NOT installed) — `agent/voice_capture.py`
- **Wake word**: Porcupine / Picovoice (key unset) — `agent/wake_word.py`
- **Memory**: `mempalace>=3.0.0` — ChromaDB L3 vector + SQLite knowledge graph — `memory/bridge.py`
- **Scheduler**: APScheduler (`AsyncIOScheduler`) — `agent/job_scheduler.py`
- **TUI**: Textual — `interface/live_ui.py`
- **Telegram**: `python-telegram-bot` — `interface/telegram_bot.py`
- **Config**: Pydantic-settings `Config` class reading `.env` — `config.py`
- **Entry points**:
  - `bantz` → TUI (`live_ui.run()`)
  - `bantz --daemon` → headless daemon (WS server + APScheduler)
  - `bantz --once "..."` → single-shot query
  - `bantz --doctor` → system health check
  - `bantz --setup <target>` → guided setup wizard

---

## Architecture Map

```
src/bantz/
├── __main__.py              Entry point — argparse dispatch to TUI / daemon / --once / --doctor / --setup
├── config.py                Pydantic-settings Config — all env vars; _voice_master_switch cascade validator
│
├── core/
│   ├── brain.py             Orchestrator — translation → routing → tool execution → finalisation
│   ├── intent.py            cot_route() — CoT streaming router via Ollama; returns (plan_dict, thinking_str)
│   ├── routing_engine.py    quick_route() (regex hardware-only) + execute_plan() (multi-step dispatch)
│   ├── translation_layer.py to_en() — async TR→EN wrapper over i18n/bridge.py
│   ├── finalizer.py         finalize() — strip markdown, hallucination check, EN→TR back-translation
│   ├── context.py           BantzContext — typed dataclass carrier for one full request→response cycle
│   ├── memory_injector.py   inject(ctx) — parallel gather of graph/vector/deep/persona context into ctx
│   ├── prompt_builder.py    build_chat_system(ctx, tc) — renders CHAT_SYSTEM template
│   ├── memory.py            Memory (ConversationStore) — SQLite conversation log, FTS5 search
│   ├── habits.py            HabitEngine — mines tool usage patterns from SQLite by time segment
│   └── rl_hooks.py          rl_reward_hook() / rl_feedback_reward() — affinity rewards after tool runs
│
├── agent/
│   ├── tts.py               TTSEngine — Piper subprocess + pw-play/paplay/aplay, sentence streaming ✅
│   ├── stt.py               STTEngine — faster-whisper lazy load, PCM→transcript 🔴 (not installed)
│   ├── voice_capture.py     VoiceCapture — PyAudio + WebRTC VAD, records until silence 🔴 (not installed)
│   ├── wake_word.py         WakeWordListener — Porcupine wake-word, feeds AmbientAnalyzer 🔴 (no key)
│   ├── ghost_loop.py        Continuous listen→STT→brain loop; requires all voice deps 🔴
│   ├── ambient.py           AmbientAnalyzer — RMS+ZCR sound classifier, fed by wake word stream ⚠️
│   ├── job_scheduler.py     JobScheduler — APScheduler cron night jobs + persistent reminders ✅
│   ├── planner.py           PlannerAgent — LLM plan decomposition into JSON steps (PlanStep[])
│   ├── executor.py          PlanExecutor — sequential step execution with $REF_STEP_N binding
│   ├── affinity_engine.py   AffinityEngine — cumulative reward score, drives BONDED persona state ⚠️
│   ├── proactive.py         ProactiveEngine — time+context-triggered unprompted messages
│   └── workflows/
│       ├── maintenance.py   03:00 maintenance job
│       ├── reflection.py    23:00 reflection job
│       └── overnight_poll.py Overnight polling job
│
├── tools/
│   ├── __init__.py          BaseTool, ToolResult, ToolRegistry — every tool self-registers here
│   ├── system.py            SystemTool — psutil CPU/RAM/disk/uptime ✅
│   ├── shell.py             ShellTool — bash execution with destructive confirmation gate
│   ├── filesystem.py        FilesystemTool — read/write/list with home-dir sandbox
│   ├── desktop.py           DesktopTool — AT-SPI2 app/window enumeration ⚠️
│   ├── accessibility.py     AT-SPI2 accessibility tree walker
│   ├── screenshot.py        ScreenshotTool — delegates to vision/screenshot.py ✅
│   ├── browser.py           BrowserTool — headless browser via playwright
│   ├── gmail.py             GmailTool — Gmail API read/send ⚠️ (needs OAuth token)
│   ├── calendar.py          CalendarTool — Google Calendar read/write ⚠️ (needs OAuth token)
│   ├── search.py            SearchTool — web search backend
│   ├── visual_click.py      VisualClickTool — screenshot + VLM + AT-SPI click
│   └── [18 more tools]      weather, maps, translator, code_runner, reminders, etc.
│
├── memory/
│   ├── bridge.py            MemPalaceBridge — adapter over MemPalace (ChromaDB L3 + SQLite KG)
│   └── omni_memory.py       OmniMemoryManager — parallel KG+vector+deep recall with token budget
│
├── i18n/
│   └── bridge.py            LanguageBridge — MarianMT TR↔EN, lazy-loaded, thread-pool offloaded
│
├── interface/
│   ├── live_ui.py           Textual TUI — chat pane, status bar, service dots
│   ├── telegram_bot.py      run_bot() — python-telegram-bot dual-path (commands + LLM) ⚠️
│   └── ws_server.py         WebSocket broadcast server for bantz-ui React frontend
│
├── personality/
│   └── persona.py           PersonaStateBuilder — 6 states from CPU/time/app/affinity signals ✅
│
├── vision/
│   ├── screenshot.py        capture() — Wayland/X11 screenshot, JPEG compression ✅
│   └── remote_vlm.py        describe_screen() — POSTs base64 JPEG to VLM endpoint ❌ (disabled)
│
├── llm/
│   ├── ollama.py            OllamaClient — async HTTP, streaming, chat, embed
│   └── gemini.py            GeminiClient — optional Gemini fallback (disabled by default)
│
├── data/
│   ├── layer.py             DataLayer — composes Memory, Scheduler, KV store behind one init point
│   ├── sqlite_store.py      SQLiteKVStore — generic key-value and set storage on bantz.db
│   └── connection_pool.py   Thread-safe SQLite connection pool
│
├── auth/
│   └── [token files]        Google OAuth token store and refresh
│
├── cli/
│   └── setup.py             _doctor(), _handle_setup() — all --setup X and --doctor logic
│
└── workflows/
    └── [YAML runner]        YAML workflow runner + registry for user-defined multi-step pipelines
```

---

## Data Flow

Every user message travels this pipeline:

```
1. INPUT
   User types in TUI / Telegram / --once arg
   └── brain.py: handle_message(user_input)

2. TRANSLATION (if BANTZ_LANGUAGE=tr)
   core/translation_layer.py: to_en(user_input)
   └── i18n/bridge.py: LanguageBridge.to_english()
       └── Helsinki-NLP opus-mt-tr-en via transformers (thread executor)
   Result: en_input (English string)

3. CONTEXT LOADING
   core/memory_injector.py: inject(ctx)
   └── asyncio.gather(
         memory/omni_memory.py: OmniMemoryManager.recall()  ← KG + ChromaDB + deep
         personality/persona.py: PersonaStateBuilder.build() ← CPU/time/app/affinity
         core/habits.py: HabitEngine.top_tools_for_segment()
       )
   Result: ctx.memory_combined, ctx.persona_state, ctx.style_hint populated

4. QUICK ROUTE (hardware-only regex, no LLM)
   core/routing_engine.py: quick_route(original, en_input)
   └── Matches: TTS stop, wake word on/off, audio duck on/off, clear memory
   └── Returns: ToolResult immediately OR None to continue

5. COT ROUTE (LLM-based intent classification)
   core/intent.py: cot_route(en_input, tool_schemas)
   └── Streams <thinking>…</thinking> then JSON plan via ollama.chat_stream()
   └── Returns: (plan_dict, thinking_str)  ← TUPLE, not dict
   plan_dict keys: "route" (tool name or "chat"), "args" (dict), "steps" (list)

6. TOOL DISPATCH
   core/routing_engine.py: execute_plan(plan, ctx)
   └── Single tool: tool_registry.get(route).execute(**args)
   └── Multi-step: agent/executor.py: PlanExecutor.run(steps)
       └── $REF_STEP_N resolved at Python dict level before each step
   Result: tool output string injected into ctx

7. LLM RESPONSE GENERATION
   llm/ollama.py: OllamaClient.chat_stream()
   └── System prompt: core/prompt_builder.py: build_chat_system(ctx, time_ctx)
   └── Streams response tokens to TUI / Telegram

8. FINALISATION
   core/finalizer.py: finalize(response, ctx)
   └── Strip markdown → hallucination check → EN→TR back-translation
   └── i18n/bridge.py: LanguageBridge.to_turkish() (thread executor)

9. OUTPUT
   └── TUI: rendered in Textual chat pane
   └── Telegram: streamed via edit_message_text()
   └── TTS: agent/tts.py: TTSEngine.speak() sentence-by-sentence via Piper + pw-play
```

---

## Critical Files

| File | Description |
|------|-------------|
| `src/bantz/core/brain.py` | Central orchestrator — all request handling flows through here |
| `src/bantz/core/intent.py` | `cot_route()` — the LLM routing brain; returns `(plan, thinking)` tuple |
| `src/bantz/config.py` | All configuration; `_voice_master_switch` cascades voice flags |
| `src/bantz/memory/bridge.py` | MemPalace adapter; `.enabled` is always False until `await init()` called |
| `src/bantz/agent/tts.py` | TTS engine — confirmed working; pw-play priority, sentence streaming |
| `src/bantz/agent/stt.py` | STT engine — broken; `faster-whisper` not installed |
| `src/bantz/interface/live_ui.py` | Textual TUI — primary user interface |
| `src/bantz/interface/telegram_bot.py` | Telegram integration — complete code, blocked on missing token |
| `src/bantz/agent/job_scheduler.py` | APScheduler — 6 cron jobs running; persistent reminders via SQLAlchemy |
| `src/bantz/core/memory_injector.py` | Parallel async memory injection into BantzContext before every prompt |

---

## Active Issues — Priority Order

### ~~#460 — `finalizer.py` Hardcodes Ollama — Bypasses Configured LLM Provider~~ ✅ FIXED (PR #468, merged 2026-06-04)
**Affected files**: `core/finalizer.py`, `llm/router.py`
**What was changed**:
- `llm/router.py`: added `get_llm = get_provider` alias
- `core/finalizer.py`: replaced hardcoded `from bantz.llm.ollama import ollama` at all three call-sites (`finalize()`, `finalize_stream()`, `synthesize_plan_response()`) with `from bantz.llm.router import get_llm` + `llm = get_llm()`

---

### ~~#461 — `summarizer.py` Hardcodes Ollama/Gemini — Bypasses Configured LLM Provider~~ ✅ FIXED (PR #469, merged 2026-06-04)
**Affected files**: `tools/summarizer.py`
**What was changed**:
- Replaced Gemini-first → Ollama fallback two-try block in `SummarizerTool.execute()` with a single `from bantz.llm.router import get_llm; llm = get_llm(); raw = await llm.chat(messages)` call
- `temperature=0.2` kwarg removed (Ollama's `chat()` has no temperature param; all providers use their defaults)

---

### ~~#462 — `_WSLogHandler.emit()` Uses `self._log_q` (AttributeError) — Desktop UI Logs Silently Dropped~~ ✅ FIXED (PR #467, merged 2026-06-04)
**Affected files**: `interface/ws_server.py`
**What was changed**:
- Line 734: `self._log_q.put_nowait` → `self._q.put_nowait` — one-character rename to match the attribute set in `__init__` (line 719)
- The bare `except Exception: pass` was swallowing the `AttributeError` silently; desktop UI now receives live log messages

---

### ~~#465 — TUI Service Dots Always Show Ollama/Gemini — No Claude or OpenAI Indicator~~ ✅ FIXED (PR #470, merged 2026-06-04)
**Affected files**: `interface/live_ui.py`
**What was changed**:
- `__init__`: `"Ollama"` key in `_services` replaced with dynamic label from `config.llm_provider`
- `_probe_services`: `_provider`/`_llm_key` computed at method top; `check_ollama` updated to use `_llm_key`
- Added `check_claude()` (key-presence + `is_enabled()`, no live API call) and `check_openai()` (same)
- `gather()`: selects active LLM coroutine via `if/elif _provider`; gemini uses `asyncio.sleep(0)` since `check_gemini()` already owns the `"Gemini"` dot

---

### ~~#463 — TUI: Rich `Live` Full-Screen Layout Causes Terminal Paint UX — No Scrollback, Can't Copy Text~~ ✅ ALREADY FIXED (closed 2026-06-04)
**Affected files**: `interface/live_ui.py`
**Status**: `screen=False`, `transient=False`, `refresh_per_second=4`, `auto_refresh=False` were already present in the codebase before this issue was triaged. Inline rendering, no alternate buffer, 4 fps, scrollback preserved. Issue closed with comment.

---

### ~~#464 — TUI: `_erase_prompt_line()` Causes Double-Render Artifact — Whole TUI Block Duplicates on Screen~~ ✅ FIXED (PR #471, merged 2026-06-04)
**Affected files**: `interface/live_ui.py`
**What was changed**:
- Added `Layout(name="prompt", size=1)` at bottom of `_build_layout()`
- Added `self._prompt_text: str = ""` to `__init__`; `_render_prompt()` renders it as a `Text` renderable; `_update_panels()` pushes it to the layout
- Main loop: `sys.stdout.write("› ")` replaced with `self._prompt_text = "› "` set before `_refresh_now()`
- `_erase_prompt_line()`: body replaced with `self._prompt_text = ""`; no more raw `os.write` to fd 1 while Live runs
- `import os` removed (no longer needed)

---

### ~~#422 — Async Streaming Translation to Reduce Turkish Response Latency from 18s to <10s~~ ✅ FIXED (PR #472, merged 2026-06-04)
**Affected files**: `core/finalizer.py`, `i18n/bridge.py`, `interface/ws_server.py`
**What was changed**:
- **`i18n/bridge.py`**: Added `_cache: dict[str, str]` (maxsize=256, FIFO eviction) to `_Translator`; both `translate()` and `_chunk_translate()` check the cache before invoking the model — common butler stock phrases now translate in ~0 ms after the first call
- **`core/finalizer.py`**: `finalize_stream()._stream()` now detects `bridge.is_enabled()` and buffers LLM tokens until sentence boundaries (`(?<=[.!?])\\s+`), then calls `bridge.to_turkish()` per sentence and yields immediately — translation overlaps LLM inference instead of running serially after it; no signature changes
- **`interface/ws_server.py`**: Removed the `await _to_tr("".join(parts))` re-translation on the streaming path; `finalize_stream` already emits pre-translated tokens when the bridge is enabled

---

### ~~#431 — Ghost Loop / STT Broken~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `agent/stt.py`, `agent/voice_capture.py`, `agent/ghost_loop.py`, `agent/wake_word.py` — voice packages missing, failures invisible

---

### ~~#440 — First-Run Onboarding Missing~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `interface/live_ui.py`, `__main__.py`, `cli/setup.py` — no welcome banner or guided first-run experience

---

### ~~#442 — Raw Tracebacks Break Persona~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `core/brain.py`, `interface/live_ui.py`, `interface/telegram_bot.py` — unhandled exceptions exposed Python tracebacks to the user

---

### ~~#432 — `--doctor` MemPalace False Negative~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `cli/setup.py:_doctor()` — `palace_bridge.enabled` always False at import time; Ollama tool count shows 0

---

### ~~#433 — MarianMT Wrong Routing~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `core/intent.py`, `core/routing_engine.py` — Turkish hardware queries not caught by `quick_route()` before translation

---

### ~~#437 — TUI Status Bar Missing~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `interface/live_ui.py` — no live service health dots (Ollama/MemPalace/TTS/STT/Voice)

---

### ~~#434 — Guided Voice Setup Wizard Missing~~ ✅ CLOSED (closed 2026-05-27)
**Was**: `cli/setup.py` — no `bantz --setup voice` wizard; voice package detection/install not surfaced to user

---

### ~~#435 — `bantz --once` Silent Hang~~ ✅ CLOSED (closed 2026-05-28)
**Was**: `__main__.py:_once()` — no progress output during 15–30 s of model load + inference

---

### ~~#439 — VLM Vision Never Called~~ ✅ CLOSED (closed 2026-05-28)
**Was**: `vision/remote_vlm.py`, `config.py` — `BANTZ_VLM_ENABLED=false` by default; no local Ollama VLM path

---

### ~~#438 — AffinityEngine Never Fires~~ ✅ CLOSED (closed 2026-05-28)
**Was**: `core/rl_hooks.py`, `agent/affinity_engine.py` — `BANTZ_RL_ENABLED=false` default; interaction data collected but unused

---

### ~~#436 — Redis Dead Reference~~ ✅ CLOSED (closed 2026-05-28)
**Was**: `memory/bridge.py:178`, `interface/telegram_bot.py` — Redis comment stale; `_active_chats` set lost on restart

---

### ~~#441 — AmbientEngine Blocked by Picovoice~~ ✅ CLOSED (closed 2026-05-28)
**Was**: `agent/ambient.py`, `agent/wake_word.py` — `AmbientAnalyzer` only reachable via Porcupine; added `StandaloneAmbientSampler`

---

## Conventions

### Tool Registration
Every tool must:
1. Subclass `BaseTool` from `tools/__init__.py`
2. Implement `name: str`, `description: str`, `risk_level: str`, and `execute(**kwargs) -> ToolResult`
3. Call `registry.register(MyTool())` at the **bottom** of its module file (not inside any class or function)
4. Be imported in `tools/__init__.py` so the registry populates on Brain init

```python
class MyTool(BaseTool):
    name = "my_tool"
    description = "Does something useful"
    risk_level = "low"

    async def execute(self, param: str) -> ToolResult:
        return ToolResult(success=True, output=f"Done: {param}")

registry.register(MyTool())
```

### Routing
- `quick_route(original_text, en_text)` — hardware-only regex; returns `ToolResult` or `None`
- If `quick_route()` returns `None`, call `cot_route(en_text, tool_schemas)`
- `cot_route()` **always returns a tuple**: `(plan_dict, thinking_str)` — never call `.get()` directly on the return value
- `plan_dict["route"]` is the tool name or `"chat"` for conversational responses
- `plan_dict["args"]` is a dict of kwargs to pass to the tool's `execute()` method

### Async Patterns
- All I/O is `async`/`await` — never use `time.sleep()`, always `asyncio.sleep()`
- CPU-bound work (translation, image processing) runs in `asyncio.get_event_loop().run_in_executor(None, ...)`
- Database access uses the connection pool in `data/connection_pool.py` — never open raw `sqlite3.connect()` outside it
- `memory_injector.inject(ctx)` uses `asyncio.gather()` — all memory sources queried in parallel

### Required Environment Variables
These must be set in `.env` for core features:
```
BANTZ_LANGUAGE=tr                        # enables MarianMT translation
BANTZ_TTS_ENABLED=true                   # enables Piper TTS output
BANTZ_MEMPALACE_ENABLED=true             # enables ChromaDB+KG memory
BANTZ_PERSONA_ENABLED=true               # enables 6-state persona system
OLLAMA_HOST=http://localhost:11434       # Ollama server URL
BANTZ_LLM_MODEL=llama3.1:8b             # primary LLM model

# Voice (currently broken — all three packages missing):
BANTZ_VOICE_ENABLED=true                 # master switch (cascades all below)
BANTZ_PICOVOICE_ACCESS_KEY=<key>         # required for wake word
```

---

## What NOT to Touch

These modules are stable, well-tested, and should not be modified unless a specific issue directly requires it:

| Module | Reason |
|--------|--------|
| `data/connection_pool.py` | Thread-safe SQLite pool — subtle concurrency logic; changes cause race conditions |
| `data/sqlite_store.py` | Generic KV store used by scheduler, memory, and reminders — stable API |
| `llm/ollama.py` | Async HTTP client with streaming — battle-tested; changes break all LLM calls |
| `i18n/bridge.py` | MarianMT wrapper with thread executor and chunking — works correctly |
| `core/context.py` | `BantzContext` dataclass — adding fields is OK, renaming or removing breaks the entire pipeline |
| `agent/workflows/` | Night job implementations — only touch for scheduler-related issues |
| `personality/persona.py` | 6-state persona system — stable; only touch for issue #442 (error message persona) |
| `memory/omni_memory.py` | Parallel gather with token budget — correct logic; don't touch the budget math |
| `agent/tts.py` | TTS confirmed working end-to-end — only touch if a TTS-specific issue arises |
| `core/prompt_builder.py` | `CHAT_SYSTEM` template is carefully tuned — anti-hallucination rules are load-bearing |
