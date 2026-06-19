# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Butler** — a local-first AI personal assistant (daemon + desktop UI) running on Linux. Three components:
- `src/butler/` — Python backend (daemon, brain pipeline, tools, memory, scheduler)
- `butler-ui/` — Tauri v2 + React desktop app ("Operations Center"), 6 pages, talks to daemon over WebSocket (:8765)
- `vendor/bantz-web/` — git submodule; standalone search/research/news pipeline, imported in-process by `src/butler/tools/web_search.py`

## Dev commands

```bash
# Tests
PYTHONPATH=src pytest                         # full suite (target 65% coverage)
PYTHONPATH=src pytest tests/core/             # single area
PYTHONPATH=src pytest tests/core/test_brain.py::test_name  # single test
PYTHONPATH=src pytest --cov=butler             # coverage report

# Lint + type check (same as CI)
ruff check src/
pyright src/                                  # advisory, not blocking

# Run (Linux deployment machine only)
butler --daemon     # headless daemon
butler --ui         # desktop app (auto-spawns daemon if not running)
butler --once "q"   # single query
butler --doctor     # health check
```

Test config is in `pyproject.toml` (`[tool.pytest.ini_options]`) and `pytest.ini`. `asyncio_mode = auto` — all async tests work without `@pytest.mark.asyncio`. `tests/_aspirational/` is excluded from the default run.

## Architecture

### Request flow

Every user input goes through this pipeline in [src/butler/core/brain.py](src/butler/core/brain.py):

```
Input → translation_layer (Turkish↔English, local MarianMT)
      → memory_injector (assembles context: recent msgs, desktop state, persona, location)
      → routing_engine.quick_route() (regex fast-path for common hardware/simple intents)
      → intent.cot_route() (LLM Chain-of-Thought — picks tool(s) or "chat")
      → executor (runs tool steps with $REF_STEP_N variable binding, circuit-breaks on failure)
      → finalizer (butler persona rewrite + hallucination check + strip_internal())
      → streamed response tokens → WebSocket → UI
```

Multi-step tasks: `planner.py` generates a step list, `executor.py` runs each with `$REF_STEP_N` binding across steps.

### Key source modules

| Path | Purpose |
|------|---------|
| `core/brain.py` | Orchestrator — ties together all stages |
| `core/routing_engine.py` | Two-stage routing: regex fast-path then LLM CoT |
| `core/intent.py` | CoT LLM routing; routing examples/hints live here |
| `core/finalizer.py` | Butler voice rewrite + `strip_internal()` (strips `<thinking>`, `[CONTEXT:...]`) |
| `core/memory_injector.py` | Assembles context passed to every LLM call |
| `core/location.py` | Multi-source location: .env → phone GPS → wifi SSID → GeoClue2 → ipinfo |
| `core/event_bus.py` | Pub/sub decoupling brain, voice, TUI, notifications |
| `core/secure_io.py` | `secure_write_text()` — creates sensitive files 0o600 from first syscall |
| `memory/bridge.py` | Adapter over MemPalace (ChromaDB + SQLite KG); `graph_search()` does 2-hop KG traversal |
| `memory/omni_memory.py` | Hybrid recall: 35% graph + 40% vector + 25% deep, 400-token budget, runs in parallel |
| `agent/executor.py` | Step runner with `$REF_STEP_N` binding and circuit-breaker |
| `agent/job_scheduler.py` | APScheduler cron jobs (nightly maintenance 3am, reflection 11pm, briefing 6am) |
| `agent/affinity_engine.py` | Bonding score [-100, 100] → formality tier; highwater-protected (can't drop a tier) |
| `llm/router.py` | Provider selector — ollama \| claude \| gemini \| openai; reads config live |
| `interface/ws_server.py` | WebSocket broadcast server — chat tokens, vitals every 2s, anomaly detection, config sync |
| `data/layer.py` | DataLayer singleton composing all SQLite stores (profile, places, reminders, session) |
| `config.py` | Pydantic-settings over ~70 `BUTLER_*` env vars; read live on each access |

### Memory recall (400-token budget)

Three sources run in parallel (`asyncio`), merged by relevance:
- **35% graph**: 2-hop KG traversal, scored by `base(hop) × recency × importance`. Recency: ≤7d → 1.5×, ≤30d → 1.2×, else 0.8×. Importance: `1 + log(1 + access_count)`.
- **40% vector**: ChromaDB semantic search via MemPalace L3 (`bridge.vector_context`)
- **25% deep**: spontaneous L3 search, rate-limited

KG entity matches apply ×1.3 topic boost to overlapping vector chunks (`omni_memory._apply_topic_boost`).

### Tool registry

`tools/__init__.py` auto-registers all tools via `@register`. `web_search.py` appends `vendor/bantz-web` to `sys.path` (append, NOT insert(0) — inserting at 0 shadows the `telegram` package).

### LLM providers

`llm/router.py` returns the active provider; config is read live so model/provider changes apply without restart. Long-lived subsystems (voice, wake word) still require a restart.

## Runtime and deployment (Linux)

- **Daemon**: systemd user unit `butler-daemon.service`. Manage: `systemctl --user {restart,status,stop} butler-daemon`. **Do not** hand-launch with `setsid`/`nohup` — it races the systemd unit.
- **Install clone**: `~/.local/share/butler/src` — this is what the daemon actually imports (NOT this dev repo). After pushing, sync it:
  ```bash
  git -C ~/.local/share/butler/src pull --recurse-submodules
  git -C ~/.local/share/butler/src submodule update --init --recursive  # if vendor/ changed
  systemctl --user restart butler-daemon
  ```
- **Ports**: WS server `:8765`, OAuth redirect `:8766`, phone GPS server `:9777`
- **Tokens**: `~/.local/share/butler/tokens/` (calendar_token.json, gmail_token.json, credentials.json)
- **Venv gotcha (GeoClue2)**: the miniforge-based daemon venv has no `gi` by default → GeoClue2 silently falls through to IP. Fix: `ln -sf /home/misa/miniforge3/lib/python3.13/site-packages/gi ~/.local/share/butler/venv/lib/python3.13/site-packages/gi`. Recreate this symlink if the venv is rebuilt.
- **Submodule gotcha**: `git submodule status` showing a leading `-` means `vendor/bantz-web` is uninitialized → run `submodule update --init --recursive`.
- If a fix doesn't seem to take effect, check whether the running daemon is still on the stale install clone before assuming a code bug.

## Known open issues

- **Calendar wrong account**: calendar token authenticates as `230291026@firat.edu.tr` (Fırat University), not the personal Gmail. `calendarId="primary"` writes to the school calendar. Fix: `butler --setup google calendar` and sign in with the personal account.
- **Autonomy dial not enforced**: `requires_confirm` is set on the routing decision but `executor.py` doesn't act on it (only `shell`'s own `DESTRUCTIVE_COMMANDS` prompt).
- **Briefing category filter not wired**: `categorize()`/`briefing=True` exist in `gmail.py` but `agent/workflows/overnight_poll.py` and `greeting.py` don't call them yet.
- **web_research Ollama-bound**: deep research makes many local-model calls; Ollama can stall on memory-constrained machines.

## Standing rules

- **No co-author / AI attribution in commit messages.** Plain messages only.
- **Commit and push after making a change**; stage only relevant files — never `git add -A`, never stage `.env`.
- **After pushing**, sync the install clone and restart the daemon (see Runtime section above).
