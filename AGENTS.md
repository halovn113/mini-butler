# Repository Guidelines

## Project Overview

**Butler** — a local-first AI personal assistant (Python daemon + Tauri desktop UI) for Linux. Runs as a background daemon with optional Telegram bot, TUI, and desktop "Operations Center" UI. Memory, scheduling, voice I/O, and tool execution are all handled locally or via configurable LLM providers (Ollama, Claude, Gemini, OpenAI).

Three major components:

- `src/butler/` — Python backend (daemon, brain pipeline, 31 tools, memory, scheduler, voice, LLM clients)
- `butler-ui/` — Tauri v2 + React 18 + Vite 8 desktop app ("Operations Center"), 6 pages, talks to daemon over WebSocket (`:8765`)
- `vendor/bantz-web/` — git submodule; standalone search/research/news pipeline imported in-process by `web_search.py`

---

## Architecture & Data Flow

### Request pipeline

Every user input flows through `src/butler/core/brain.py` in this order:

```
Input → Translation Layer (MarianMT TR↔EN)
      → Memory Injector (parallel gather: graph + vector + deep context, 400-token budget)
      → Quick Route (regex fast-path for hardware/simple intents)
      → CoT Route (LLM Chain-of-Thought — picks tool(s) or "chat")
      → Executor (runs tool steps with $REF_STEP_N variable binding, circuit-breaks on failure)
      → Finalizer (butler persona rewrite + hallucination check + strip_internal())
      → Output (streamed tokens → WebSocket → UI / CLI / Telegram)
```

### Key subsystems

| System | Location | Role |
|--------|----------|------|
| Brain | `core/brain.py` | Top-level orchestrator — ties all stages together |
| Routing | `core/routing_engine.py` + `core/intent.py` | Two-stage: regex fast-path then LLM CoT classification |
| Executor | `agent/executor.py` | Runs multi-step plans with `$REF_STEP_N` variable binding across steps |
| Planner | `agent/planner.py` | Generates step lists for multi-turn tasks |
| Memory | `memory/bridge.py`, `memory/omni_memory.py` | MemPalace (ChromaDB vector + SQLite KG); hybrid recall: 35% graph + 40% vector + 25% deep |
| LLM Router | `llm/router.py` | Provider selector — Ollama / Claude / Gemini / OpenAI; config read live |
| Job Scheduler | `agent/job_scheduler.py` | APScheduler cron jobs (nightly maintenance 3am, reflection 11pm, briefing 6am) |
| Event Bus | `core/event_bus.py` | Pub/sub decoupling brain, voice, TUI, notifications |
| Config | `config.py` | Pydantic-settings over ~70 `BUTLER_*` env vars; read live on each access |
| Data Layer | `data/layer.py` | Singleton composing all SQLite stores (profile, places, reminders, session) |
| Finalizer | `core/finalizer.py` | Butler voice rewrite + `strip_internal()` (strips `<thinking>`, `[CONTEXT:...]`) |
| Affinity Engine | `agent/affinity_engine.py` | Bonding score [-100, 100] → formality tier; highwater-protected |

### Memory recall (400-token budget)

Three sources run in parallel (`asyncio.gather`), merged by relevance:

- **35% graph**: 2-hop KG traversal, scored by `base(hop) × recency × importance`. Recency: ≤7d → 1.5×, ≤30d → 1.2×, else 0.8×. Importance: `1 + log(1 + access_count)`.
- **40% vector**: ChromaDB semantic search via MemPalace L3 (`bridge.vector_context`)
- **25% deep**: spontaneous L3 search, rate-limited

KG entity matches apply ×1.3 topic boost to overlapping vector chunks (`omni_memory._apply_topic_boost`).

---

## Key Directories

| Path | Purpose |
|------|---------|
| `src/butler/core/` | Central orchestration — brain, routing, memory injection, location, event bus, prompt building, finalization, scheduling, translation |
| `src/butler/agent/` | Agent lifecycle — executor, planner, health monitoring, proactive behaviors, voice I/O, wake word, sub-agents, job scheduling, workflows (reflection, maintenance, overnight poll) |
| `src/butler/tools/` | 31 LLM-callable tools — Gmail, browser control, desktop control, calendar, filesystem, web search, reminders, accessibility, shell, image, screenshot, summarizer, weather, news, RSS feeds, document handling, contacts, system, delegate task, GUI action, computer use |
| `src/butler/vision/` | Computer vision — screenshot capture, screen navigation, spatial element cache, remote VLM client, browser vision, computer-use agent |
| `src/butler/data/` | Persistence — SQLAlchemy/SQLite store, migration, connection pool, async executor, JSON store, ORM models |
| `src/butler/interface/` | User interfaces — live TUI (Textual), Telegram bot, WebSocket server for desktop UI, Textual app |
| `src/butler/memory/` | Memory subsystem — omni-memory bridge (3 files, tightly coupled to MemPalace) |
| `src/butler/llm/` | LLM provider clients (Ollama, Gemini, Anthropic, OpenAI) + router |
| `src/butler/personality/` | Persona definition, bonding system, system prompt generation, greeting generation |
| `src/butler/workflows/` | Declarative YAML-based workflow system — runner, registry, models, built-in workflows |
| `src/butler/cli/` | Setup wizard — profile, places, schedule, Google OAuth, Telegram, voice, systemd |
| `src/butler/auth/` | Token store, Google OAuth flow |
| `src/butler/i18n/` | Internationalization bridge (Turkish ↔ English translation) |
| `src/butler/integrations/` | Third-party integration shims (Telegram stub) |
| `vendor/bantz-web/` | Git submodule — standalone search / research / news pipeline |
| `butler-ui/` | Tauri v2 + React 18 + Tailwind desktop app |
| `tests/` | pytest test suite mirroring src/butler/ structure |
| `deploy/` | Systemd service templates, VLM server script, Colab notebook |
| `config/` | Runtime config files (feeds.yaml) |
| `db/migrations/` | Cypher migration scripts (graph schema) |

---

## Development Commands

```bash
# Run tests
PYTHONPATH=src pytest                                          # full suite
PYTHONPATH=src pytest tests/core/                              # single area
PYTHONPATH=src pytest tests/core/test_brain.py::test_name      # single test
PYTHONPATH=src pytest --cov=butler                              # coverage report

# Lint + type check (same as CI)
ruff check src/                                                # lint
pyright src/                                                   # type check (advisory, not blocking)

# Run (Linux only)
python -m butler --daemon     # headless daemon
python -m butler --ui         # desktop app (auto-spawns daemon)
python -m butler --once "q"   # single query
python -m butler --doctor     # health check
python -m butler --setup      # setup wizard

# Dev setup
./setup.sh                   # creates venv, installs deps
```

---

## Code Conventions & Common Patterns

### Formatting & style

- **Line length**: 100 (enforced by ruff)
- **Target**: Python 3.11+
- **Type hints**: Required on public function signatures. Use `| None` union syntax (Python 3.10+ style). Prefer `Self` return type on classmethods.
- **Linting**: `ruff check src/` in CI — passes must be clean before PR merge.
- **Type checking**: Pyright (advisory only, not blocking CI).
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_CASE` for constants. Module names are short and lowercase.
- **Strings**: English for all code, identifiers, comments, and commit messages.

### Async patterns

- All I/O-bound operations use `asyncio`. The daemon runs with `asyncio.run(main())`.
- Parallel independent work uses `asyncio.gather()` — see `omni_memory.py`, `memory_injector.py`, `brain.py` for examples.
- Tests use `asyncio_mode = auto` (pytest-asyncio) — async tests work without `@pytest.mark.asyncio`.
- Long-running background loops (ghost loop, voice capture) use `asyncio.create_task()` with cancellation handling.

### Tool registration

`tools/__init__.py` auto-registers all tools via `@register` decorator pattern. Each tool subclasses `BaseTool` (or equivalent), is decorated, and appears in `tools/__init__.py` for import.

```python
# Pattern for adding a new tool — see tools/shell.py, tools/system_tool.py
@register
class MyTool(BaseTool):
    name = "my_tool"
    description = "Does X, Y, Z"
    # ... implementations
```

### Config & environment

- `config.py` defines a `Config` class using `pydantic-settings` (`BaseSettings`).
- Reads from environment variables prefixed `BUTLER_*` and/or `.env` file.
- **Config is read live on every access** — most setting changes take effect without restarting the daemon (exception: voice pipeline, wake word).
- Never hardcode provider/model selection — route through `llm/router.py`.

### State management

- **No global mutable state** except `DataLayer` (singleton composing SQLite stores) and `event_bus` (pub/sub event hub).
- Memory (MemPalace) is stateful — avoid clearing or rewinding without understanding the graph/vector coupling.
- Bonding/affinity is persisted and highwater-protected (can't drop a tier once reached).
- The `Config` pydantic object is re-read on each property access, not cached.

### Error handling

- Tools return structured error dicts on failure rather than raising exceptions to the LLM.
- The executor circuit-breaks on tool failure: if a step errors, remaining steps are skipped and the error is reported to the user.
- Non-critical subsystems (location, GPS, translation) degrade gracefully — fall through to the next best source rather than failing hard.
- Use `logging` via the `ButlerLogger` / `WSLogHandler` pattern — not raw `print()`.

### What NOT to touch

These modules are stable and tightly coupled to the data model. Changing them without deep understanding risks data loss or memory corruption:

- `data/connection_pool.py`, `data/sqlite_store.py` — SQLite persistence internals
- `memory/omni_memory.py`, `memory/bridge.py` — MemPalace integration
- `llm/ollama.py` — Ollama client protocol
- `i18n/bridge.py` — translation bridge
- `core/context.py` (ButlerContext) — conversation context shape
- `agent/tts.py` — TTS pipeline
- `core/prompt_builder.py` — prompt construction

---

## Important Files

| File | Purpose |
|------|---------|
| `src/butler/__main__.py` | CLI entry point — dispatches to daemon, UI, setup, doctor, once modes |
| `src/butler/config.py` | Pydantic-settings config (~70 `BUTLER_*` env vars) |
| `src/butler/core/brain.py` | Main orchestration loop (~60KB, the "brain" pipeline) |
| `src/butler/core/routing_engine.py` | Two-stage routing (regex → LLM CoT) |
| `src/butler/core/intent.py` | LLM-based intent classification with routing examples |
| `src/butler/core/finalizer.py` | Response finalization — butler voice + strip_internal() |
| `src/butler/memory/bridge.py` | MemPalace bridge — ChromaDB vector + SQLite KG |
| `src/butler/agent/executor.py` | Step-by-step tool execution with `$REF_STEP_N` binding |
| `src/butler/agent/job_scheduler.py` | APScheduler cron job definitions |
| `src/butler/data/layer.py` | DataLayer singleton composing SQLite stores |
| `src/butler/interface/ws_server.py` | WebSocket broadcast server for desktop UI |
| `src/butler/interface/live_ui.py` | Textual-based terminal UI |
| `src/butler/interface/telegram_bot.py` | Telegram bot interface |
| `src/butler/llm/router.py` | LLM provider dispatch (live config) |
| `src/butler/cli/setup.py` | Extensive setup wizard (66KB) |
| `pyproject.toml` | Build system + dependency + tool config |
| `.env.example` | Reference for all configurable environment variables |
| `Dockerfile` / `docker-compose.yml` | Containerized deployment (Ollama + Butler) |
| `deploy/butler@.service` | Systemd user unit template for daemon |

---

## Runtime / Tooling Preferences

- **Python**: ≥3.11. Required on **Linux** (primary target; WSL2 works for dev). Not tested on native Windows/macOS.
- **Package manager**: `pip` / `hatchling` for the Python backend; `npm` for the Tauri UI.
- **LLM provider**: Local Ollama (default) or cloud APIs (Claude, Gemini, OpenAI). At least one must be configured.
- **Database**: SQLite only (no external DB). MemPalace uses ChromaDB + SQLite.
- **Desktop UI**: Tauri v2 + React 18 + Vite 8 + Tailwind CSS (`butler-ui/`). Built with `npm run tauri build`.
- **Linter**: `ruff` (line-length 100, target py311). Push-black to CI.
- **Type checker**: `pyright` (advisory — warnings OK, errors should be fixed).
- **Git**: `main` is protected. PRs require 1+ approving review. Squash-merge. Delete branch after merge.
- **Branch naming**: `feat/NN-description`, `fix/NN-description`, `chore/description`.
- **Conventional commits**: Use `type(scope): description` format (e.g. `feat(core): add proactive briefing trigger`, `fix(tools): handle empty Gmail inbox`).

---

## Testing & QA

### Framework

- **pytest** with `pytest-asyncio` (asyncio_mode=auto) and `pytest-cov`
- Tests live in `tests/` mirroring `src/butler/` structure (e.g. `tests/core/` tests `src/butler/core/`)

### Running tests

```bash
PYTHONPATH=src pytest                         # full suite
PYTHONPATH=src pytest tests/core/             # module-specific
PYTHONPATH=src pytest -k "test_name"          # keyword filter
PYTHONPATH=src pytest --cov=butler             # with coverage
```

### Coverage

- **Target**: 65% line coverage (`fail_under = 65` in `pyproject.toml`)
- Several directories are **excluded** from coverage measurement: `__main__.py`, Google API tools (gmail, calendar, classroom, document), web_search, weather, reminder, filesystem, system, auth/*
- Coverage exclusions: `pragma: no cover`, `if __name__`, `pass`, `except ImportError`, `except Exception`

### Test patterns

- Tests use `unittest.mock` (`MagicMock`, `AsyncMock`, `patch`) for isolation
- Many tests gate on optional dependencies with `pytest.importorskip("textual")`, `importorskip("telegram")`, etc.
- Shared fixtures in `tests/conftest.py`: `tmp_db` (temp SQLite path), `mock_config` (MockConfig)
- Async tests work without `@pytest.mark.asyncio` (asyncio_mode=auto)

### Known test issues

- **318 pre-existing failures** documented in `KNOWN_ISSUES.md`:
  - 226 TUI implementation gaps (aspirational specs for features not yet built)
  - 63 test ordering / state pollution (pass in isolation)
  - 21 missing apscheduler dependency
  - 6 Python 3.12 `get_event_loop()` deprecation
  - Plus smaller issues (Piper flag rename, import-time error)

These are **pre-existing** — do not "fix" them unless the associated feature code is changed. If your change touches code covered by these tests, verify the test's expectations before concluding they're related to your change.
