# Contributing to Bantz

Hey — welcome! 🦌

Bantz is a local-first AI butler: a 1920s English valet persona wrapped around
small, local models (Ollama by default), with optional cloud providers, a
desktop "Operations Center", live web research, Google integrations, voice, and
a persistent memory palace. Our little model has big ambitions — and there's a
lot of surface area where a fresh pair of hands genuinely helps. Whether you're
fixing a typo, hardening a tool, or teaching the router a new trick, we're glad
you're here.

This guide gets you from `git clone` to your first merged PR.

## Quick start (dev environment)

Bantz pulls in **bantz-web** as a git submodule, so clone recursively:

```bash
git clone --recurse-submodules git@github.com:miclaldogan/bantzv2.git
cd bantzv2
./setup.sh           # creates .venv, installs the package, sets up .env
source .venv/bin/activate
python -m bantz --doctor     # sanity-check your environment
python -m bantz              # run the terminal interface
```

If you forgot `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

`setup.sh` will offer two optional extras:

- **MarianMT** (`~300MB`) — local TR↔EN translation, only if you want the
  Turkish layer.
- **Google integrations** — Gmail / Calendar / Classroom tools.

### Prerequisites

- **Python 3.11+**
- **[Ollama](https://ollama.com)** running locally (`ollama serve`) with a model
  pulled, e.g. `ollama pull qwen2.5:7b`. This is the default provider — no API
  keys needed to get started. (Claude / Gemini / OpenAI are optional and
  switchable at runtime.)
- For the desktop UI: **Node + Rust/Tauri** (see `bantz-ui/`).

### Running the tests

```bash
python -m pytest -q            # full suite
python -m pytest tests/memory  # one area
```

Please add or update tests for anything you change — most subsystems
(`tests/memory`, `tests/core`, `tests/tools`, …) have good examples to copy.

## Project structure

```
src/bantz/
├── core/          # The Brain pipeline, finalizer, intent routing, location,
│                  #   time/profile context, secure_io, gps_server
├── llm/           # Provider adapters + router (ollama | claude | gemini | openai)
├── tools/         # Tools the Brain can call (shell, gmail, calendar,
│                  #   web_search, screenshot, vision_execute, …) — auto-registered
├── memory/        # MemPalace bridge (ChromaDB vectors + SQLite knowledge graph)
│                  #   and omni_memory (parallel hybrid recall)
├── interface/     # WebSocket server (ws://localhost:8765) + terminal/live UI
├── agent/         # Planner, workflows (overnight poll, reflection, maintenance)
├── personality/   # Persona / mood / bonding
├── auth/          # Google OAuth + token store
├── integrations/  # Telegram bot
├── vision/        # Screenshots + VLM screen understanding
├── i18n/          # Translation bridge (MarianMT)
├── scheduler/     # Cron-like job scheduling
├── config.py      # Pydantic settings (env-driven, read live where possible)
└── __main__.py    # CLI entry (`python -m bantz`)

bantz-ui/          # Tauri v2 + React desktop "Operations Center" (talks over WS)
vendor/bantz-web/  # Submodule: standalone search/research/news pipeline
```

## How the Brain pipeline works

Everything a user says flows through `core/brain.py`, which routes in stages:

1. **Quick-route** (`routing_engine`) — cheap regex fast-paths for hardware/UI
   controls and a few intents (music, reminders) that don't need the LLM.
2. **CoT route** (`core/intent.py::cot_route`) — the LLM decides what to do and
   returns a structured decision: `tool` (call one tool), `planner` (decompose a
   multi-step task), or `chat` (just talk). Routing hints/examples live here, so
   this is where you teach Bantz to recognise new kinds of requests.
3. **Execute** — a tool runs via the registry, the planner executes a step plan,
   or the chat path streams a reply.
4. **Finalize** (`core/finalizer.py`) — tool output is grounded against FACTS and
   rewritten in the butler voice (or returned verbatim when short). This is where
   `<thinking>`/`[CONTEXT:…]` internal markers are stripped so they never reach
   the user.
5. **Memory** — exchanges are stored to MemPalace; `omni_memory.recall()` runs
   graph + vector + deep searches in parallel and merges them within a token
   budget before the next turn.

A good mental model: **intent.py decides, tools/ do, finalizer.py speaks,
memory/ remembers.**

## Where to start — good first issues

You don't need to understand the whole system. Great entry points:

- **Intent routing** (`core/intent.py`) — Bantz mis-routes a request to chat
  when it should call a tool (or vice-versa)? Add a routing hint/example and a
  test. High impact, low blast radius.
- **Tool reliability** (`src/bantz/tools/`) — make a tool fail gracefully,
  surface a real error instead of a silent empty string, tighten an API query,
  add a test. Calendar, Gmail, and web_search always have rough edges.
- **UI improvements** (`bantz-ui/`) — the Operations Center has six pages
  (Broadcast Channel, Vitals, Kernel Log, Directives, Anomaly Watch, Settings).
  Polish, accessibility, and new visualisations are all welcome.
- **Docs & tests** — fixing a misleading docstring or adding a missing test is a
  real contribution and a great way to learn the codebase.

Browse the issue tracker for `good first issue` / `help wanted` labels, or open
an issue describing what you'd like to tackle so we can point you the right way.

## Coding standards

- **Python 3.11+** idioms welcome (`match`/`case`, `X | Y` unions). Put
  `from __future__ import annotations` at the top of every module.
- **Type hints** on public functions; **docstrings** on modules and classes.
- **English** for code, comments, and user-facing copy. (Turkish reaches users
  only through the optional translation layer.)
- **Match the surrounding code** — comment density, naming, and idioms. New code
  should read like it was always there.
- **Plain commit messages, no AI/co-author trailers.** Follow
  [Conventional Commits](https://www.conventionalcommits.org/):
  `feat: add web_news tool (#123)`, `fix(calendar): surface real create errors`.
- Branch from `main`: `feat/NN-description`, `fix/NN-description`,
  `chore/description`.

### Adding a new tool

1. Create `src/bantz/tools/your_tool.py`, subclass `BaseTool`, implement
   `execute()` and set `name` / `description` / `risk_level`.
2. Register it (`registry.register(YourTool())`) and import it in
   `tools/__init__.py` so it auto-discovers.
3. Add routing hints in `core/intent.py` so the Brain knows when to call it.
4. Add tests under `tests/tools/`.

### Running Bantz as a daemon (heads-up for backend changes)

In a real install, Bantz runs as a **systemd user service** importing from an
**install clone** at `~/.local/share/bantz/src` — *not* your dev checkout. If
you're testing against a running daemon, after a backend change you must:

```bash
git -C ~/.local/share/bantz/src pull --recurse-submodules
systemctl --user restart bantz-daemon
```

If a fix "doesn't work", check you're not looking at the stale install clone
before assuming a code bug. Manage the daemon only through systemd
(`systemctl --user {restart,status,stop} bantz-daemon`) — don't hand-launch it,
or it'll race the unit and crash-loop on the port. (Full operational notes live
in `CLAUDE.md`.)

## Pull requests

1. Branch from `main`, make your change, add/update tests.
2. Run `python -m pytest -q` and, if you can, `python -m pyright src/`.
3. Push and open a PR against `main`; reference the issue (`Closes #NN`).
4. Keep PRs focused — one logical change per PR beats a giant grab-bag.

## Reporting issues

- Use GitHub Issues with clear reproduction steps and your environment
  (OS, Python version, provider).
- For **security** issues, see [SECURITY.md](SECURITY.md) — please don't open a
  public issue for vulnerabilities.

## Code of conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions are licensed under the
Apache License 2.0.

Thanks for helping the little butler grow. ☕
